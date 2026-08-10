import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {pgPing, pgQuery} from '../../../infrastructure/db/postgres.js';
import {apiV1AuthHook, requireOrganizationContext, requirePermission} from '../../../foundation/authz.js';
import {identityService} from '../../../foundation/identity-service.js';
import {created, ok, parsePaging} from '../../../foundation/http.js';
import {AppError, forbidden, notFound} from '../../../foundation/errors.js';
import {config} from '../../../config.js';
import {redact} from '../../../foundation/redact.js';
import {writeAuditEvent, writeSecurityEvent} from '../../../foundation/audit.js';
import {registerPhase2Routes} from './phase2-routes.js';
import {registerPhase3Routes} from './phase3-routes.js';
import {registerPhase4Routes} from './phase4-routes.js';
import {registerPhase5Routes} from './phase5-routes.js';
import {registerPhase6Routes} from './phase6-routes.js';
import {registerPhase66RbacRoutes} from './phase6_6-rbac-routes.js';
import {registerPhase7FinancialRoutes} from './phase7-financial-routes.js';
import {rateLimit} from '../../../foundation/rate-limit.js';
import {redisPing} from '../../../infrastructure/db/redis.js';
import {rateLimitStoreReady} from '../../../foundation/rate-limit-bootstrap.js';
import {
  clearSessionCookies,
  maybeOmitAccessToken,
  setSessionCookies,
} from '../../../foundation/session-cookies.js';
import {evaluateAlerts} from '../../../observability/alerts.js';
import {incrMetric, metricsPrometheusText, snapshotMetrics} from '../../../observability/metrics.js';
import {resolveSecretBackendKind} from '../../../security/secrets/index.js';
import {listSecretReferences, upsertSecretReference} from '../../../security/secrets/secret-references-service.js';

export async function apiV1Routes(app: FastifyInstance) {
  // Preserve raw JSON body for provider webhook signature verification (Phase 5).
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', {parseAs: 'string'}, (req, body, done) => {
    (req as any).rawBody = typeof body === 'string' ? body : String(body || '');
    try {
      const raw = (req as any).rawBody as string;
      done(null, raw.length ? JSON.parse(raw) : {});
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  const {registerCookiePlugin} = await import('../../../foundation/cookie-plugin.js');
  await registerCookiePlugin(app);

  app.addHook('preHandler', apiV1AuthHook);
  await registerPhase2Routes(app);
  await registerPhase3Routes(app);
  await registerPhase4Routes(app);
  await registerPhase5Routes(app);
  await registerPhase6Routes(app);
  await registerPhase66RbacRoutes(app);
  await registerPhase7FinancialRoutes(app);

  app.setErrorHandler(async (error, request, reply) => {
    const status = error instanceof AppError ? error.statusCode : Number((error as any).statusCode || 500);
    const code = error instanceof AppError ? error.code : (error as any).code || 'INTERNAL_ERROR';
    const isZod = (error as any)?.name === 'ZodError' || Array.isArray((error as any)?.issues);
    const finalStatus = isZod ? 400 : status;
    const finalCode = isZod ? 'VALIDATION_ERROR' : String(code);
    const message = isZod
      ? ((error as any).issues || []).map((i: any) => `${(i.path || []).join('.') || 'request'}: ${i.message}`).join(' | ')
      : error.message || 'Unexpected error';
    request.log.error({err: error, request_id: request.id}, 'api v1 error');
    try {
      await pgQuery(
        `INSERT INTO error_reports(
          organization_id, user_id, request_id, method, route, status_code, error_code, message, ip, user_agent,
          query_json, params_json, body_json, headers_json, stack
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          request.auth?.organizationId || null,
          request.auth?.userId || null,
          request.id,
          request.method,
          request.routeOptions?.url || request.url,
          finalStatus,
          finalCode,
          message,
          request.ip,
          String(request.headers['user-agent'] || ''),
          JSON.stringify(redact(request.query || {})),
          JSON.stringify(redact(request.params || {})),
          JSON.stringify(redact(request.body || null)),
          JSON.stringify(redact(request.headers || {})),
          config.isProduction && finalStatus >= 500 ? null : String((error as any).stack || ''),
        ],
      );
    } catch (persistError) {
      request.log.error({err: persistError, request_id: request.id}, 'failed to persist api v1 error report');
    }
    reply.code(finalStatus).send({
      error: {
        code: finalCode,
        message: config.isProduction && finalStatus >= 500 ? 'Internal server error' : message,
        request_id: request.id,
      },
    });
  });

  app.get('/health', async (request) =>
    ok(request, {
      status: 'ok',
      api: 'v1',
      request_id: request.id,
    }),
  );

  app.get('/health/ready', async (request, reply) => {
    const checks: Record<string, unknown> = {};
    try {
      const pg = await pgPing();
      if (!pg) throw new Error('pg ping failed');
      checks.postgres = true;
    } catch {
      return reply.code(503).send({
        error: {code: 'NOT_READY', message: 'PostgreSQL is not ready', request_id: request.id},
        checks: {postgres: false},
      });
    }

    const rl = await rateLimitStoreReady();
    checks.rate_limit = rl;
    if (rl.required && !rl.ready) {
      return reply.code(503).send({
        error: {code: 'NOT_READY', message: 'Redis rate-limit store is not ready', request_id: request.id},
        checks,
      });
    }

    const redisStatus = await redisPing();
    checks.redis = redisStatus;
    if (config.isProduction && redisStatus !== 'ok') {
      return reply.code(503).send({
        error: {code: 'NOT_READY', message: 'Redis is not ready', request_id: request.id},
        checks,
      });
    }

    checks.outbox_worker = config.outboxWorkerEnabled;
    checks.secret_backend = resolveSecretBackendKind();
    checks.session_transport = config.sessionTransport;
    checks.payment_provider = config.paymentProvider || null;

    return ok(request, {status: 'ready', ...checks});
  });

  /** Prometheus-ish text + JSON snapshot (P15.2 baseline). Public scrape; no secrets. */
  app.get('/metrics', async (request, reply) => {
    const accept = String(request.headers.accept || '');
    if (accept.includes('text/plain') || request.query && (request.query as any).format === 'prometheus') {
      return reply.type('text/plain; version=0.0.4').send(metricsPrometheusText());
    }
    return ok(request, {
      counters: snapshotMetrics(),
      alerts: evaluateAlerts(),
    });
  });

  app.post('/auth/register', {preHandler: [rateLimit('auth.register')]}, async (request, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(10).max(200),
        name: z.string().min(1).max(200).optional(),
        organization_name: z.string().min(2).max(200),
        country_code: z.string().min(2).max(2).optional(),
      })
      .parse(request.body);
    const result = await identityService.register({
      email: body.email,
      password: body.password,
      name: body.name,
      organizationName: body.organization_name,
      countryCode: body.country_code || null,
      requestId: request.id,
      ip: request.ip,
      userAgent: String(request.headers['user-agent'] || ''),
    });
    return created(reply, request, result);
  });

  app.post('/auth/login', {preHandler: [rateLimit('auth.login')]}, async (request, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(1).max(200),
        organization_id: z.string().uuid().optional(),
      })
      .parse(request.body);
    try {
      const result = await identityService.login({
        email: body.email,
        password: body.password,
        organizationId: body.organization_id,
        ip: request.ip,
        userAgent: String(request.headers['user-agent'] || ''),
      });
      if ((result as any).access_token && (result as any).expires_at) {
        const csrf = setSessionCookies(reply, {
          accessToken: (result as any).access_token,
          expiresAt: new Date((result as any).expires_at),
        });
        const payload = maybeOmitAccessToken({...(result as any), ...(csrf ? {csrf_token: csrf} : {})});
        return ok(request, payload);
      }
      return ok(request, result);
    } catch (error) {
      incrMetric('auth_failures_total');
      throw error;
    }
  });

  app.post('/auth/mfa/verify', {preHandler: [rateLimit('auth.mfa')]}, async (request, reply) => {
    const body = z
      .object({
        mfa_token: z.string().min(10),
        totp: z.string().regex(/^\d{6}$/),
        organization_id: z.string().uuid().optional(),
      })
      .parse(request.body);
    try {
      const result = await identityService.verifyMfaLogin({
        mfaToken: body.mfa_token,
        totp: body.totp,
        organizationId: body.organization_id,
        ip: request.ip,
        userAgent: String(request.headers['user-agent'] || ''),
      });
      if ((result as any).access_token && (result as any).expires_at) {
        const csrf = setSessionCookies(reply, {
          accessToken: (result as any).access_token,
          expiresAt: new Date((result as any).expires_at),
        });
        const payload = maybeOmitAccessToken({...(result as any), ...(csrf ? {csrf_token: csrf} : {})});
        return ok(request, payload);
      }
      return ok(request, result);
    } catch (error) {
      incrMetric('auth_failures_total');
      throw error;
    }
  });

  app.post('/auth/logout', async (request, reply) => {
    const header = String(request.headers.authorization || '');
    const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    const cookieToken = (request as any).cookies?.imkan_session as string | undefined;
    const token = bearer || cookieToken || '';
    if (token) await identityService.logout(token);
    clearSessionCookies(reply);
    if (request.auth) {
      await writeAuditEvent({
        organizationId: request.auth.organizationId,
        actorUserId: request.auth.userId,
        action: 'user.logout',
        resourceType: 'session',
        resourceId: request.auth.sessionId,
        requestId: request.id,
      });
      await writeSecurityEvent({
        organizationId: request.auth.organizationId,
        userId: request.auth.userId,
        eventType: 'user.logout',
        ip: request.ip,
        userAgent: String(request.headers['user-agent'] || ''),
      });
      incrMetric('security_events_total', {type: 'logout'});
    }
    return ok(request, {logged_out: true});
  });

  app.get('/auth/me', async (request) => {
    const auth = request.auth!;
    return ok(request, {
      user: {id: auth.userId, email: auth.email},
      organization_id: auth.organizationId,
      roles: auth.roles,
      permissions: auth.permissions,
      session_id: auth.sessionId,
    });
  });

  // Self-service MFA enable (F-02): any authenticated session user may enable MFA for themselves.
  // Admin permissions are NOT required. API keys cannot enable MFA.
  app.post('/auth/mfa/enable', async (request) => {
    const auth = request.auth!;
    if (auth.authKind === 'api_key') {
      throw forbidden('API keys cannot enable MFA', 'MFA_SESSION_REQUIRED');
    }
    if (auth.userId.startsWith('api-key:')) {
      throw forbidden('API keys cannot enable MFA', 'MFA_SESSION_REQUIRED');
    }
    const result = await identityService.enableMfa(auth.userId, auth.organizationId, request.id);
    return ok(request, result);
  });

  app.get(
    '/organizations/current',
    {preHandler: [requireOrganizationContext(), requirePermission('org.read', 'platform.admin', 'platform.support')]},
    async (request) => {
      const auth = request.auth!;
      const org = await identityService.getOrganizationForUser(auth.organizationId!, auth.userId);
      return ok(request, org);
    },
  );

  app.get(
    '/organizations/:organizationId',
    {preHandler: [requirePermission('org.read', 'platform.admin', 'platform.support')]},
    async (request) => {
      const params = z.object({organizationId: z.string().uuid()}).parse(request.params);
      const auth = request.auth!;
      // Tenant isolation: members may only read their org unless platform permission
      const isPlatform = auth.permissions.includes('platform.admin') || auth.permissions.includes('platform.support');
      if (!isPlatform && auth.organizationId !== params.organizationId) {
        throw forbidden('Cross-tenant access denied', 'CROSS_TENANT_DENIED');
      }
      if (isPlatform && auth.organizationId !== params.organizationId) {
        const r = await pgQuery(
          `SELECT o.id, o.name, o.slug, o.status, o.created_at, os.default_currency, os.locale, os.timezone
           FROM organizations o
           LEFT JOIN organization_settings os ON os.organization_id = o.id
           WHERE o.id=$1`,
          [params.organizationId],
        );
        if (!r.rows[0]) throw notFound('Organization not found', 'ORG_NOT_FOUND');
        return ok(request, r.rows[0]);
      }
      const org = await identityService.getOrganizationForUser(params.organizationId, auth.userId);
      return ok(request, org);
    },
  );

  app.get(
    '/organizations/:organizationId/members',
    {preHandler: [requirePermission('users.read', 'users.manage', 'platform.admin')]},
    async (request) => {
      const params = z.object({organizationId: z.string().uuid()}).parse(request.params);
      const auth = request.auth!;
      const isPlatform = auth.permissions.includes('platform.admin');
      if (!isPlatform && auth.organizationId !== params.organizationId) {
        throw forbidden('Cross-tenant access denied', 'CROSS_TENANT_DENIED');
      }
      const members = isPlatform
        ? (
            await pgQuery(
              `SELECT u.id, u.email, u.name, u.status, ou.status AS membership_status, ou.joined_at,
                      COALESCE(array_agg(r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
               FROM organization_users ou
               JOIN users u ON u.id = ou.user_id
               LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.organization_id = ou.organization_id
               LEFT JOIN roles r ON r.id = ur.role_id
               WHERE ou.organization_id=$1
               GROUP BY u.id, u.email, u.name, u.status, ou.status, ou.joined_at
               ORDER BY ou.joined_at NULLS LAST`,
              [params.organizationId],
            )
          ).rows
        : await identityService.listMembers(params.organizationId, auth.userId);
      const {limit, offset} = parsePaging(request.query);
      return ok(request, members.slice(offset, offset + limit), {limit, offset, total: members.length});
    },
  );

  app.get(
    '/audit-events',
    {preHandler: [requireOrganizationContext(), requirePermission('audit.read', 'platform.admin')]},
    async (request) => {
      const auth = request.auth!;
      const {limit, offset} = parsePaging(request.query);
      const r = await pgQuery(
        `SELECT id, organization_id, actor_user_id, action, resource_type, resource_id, request_id, created_at
         FROM audit_events
         WHERE organization_id=$1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [auth.organizationId, limit, offset],
      );
      return ok(request, r.rows, {limit, offset});
    },
  );

  app.get(
    '/security-events',
    {preHandler: [requireOrganizationContext(), requirePermission('security.read', 'platform.admin')]},
    async (request) => {
      const auth = request.auth!;
      const {limit, offset} = parsePaging(request.query);
      const r = await pgQuery(
        `SELECT id, organization_id, user_id, event_type, success, ip, user_agent, metadata_json, created_at
         FROM security_events
         WHERE organization_id=$1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [auth.organizationId, limit, offset],
      );
      return ok(request, r.rows, {limit, offset});
    },
  );

  /** P15.2 — secret reference metadata only (never returns secret values). */
  app.get(
    '/secrets/references',
    {preHandler: [requireOrganizationContext(), requirePermission('security.manage', 'platform.admin', 'providers.manage')]},
    async (request) => {
      const auth = request.auth!;
      const rows = await listSecretReferences(auth.organizationId);
      return ok(request, rows);
    },
  );

  app.post(
    '/secrets/references',
    {preHandler: [requireOrganizationContext(), requirePermission('security.manage', 'platform.admin', 'providers.manage')]},
    async (request, reply) => {
      const auth = request.auth!;
      const body = z
        .object({
          purpose: z.enum([
            'provider_api_key',
            'webhook_secret',
            'bank_payout_credential',
            'oauth_client_secret',
            'encryption_key',
            'other',
          ]),
          secret_ref: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
          backend: z.enum(['env', 'file', 'kms']).optional(),
          version: z.string().max(64).optional(),
          provider_code: z.string().max(64).optional(),
          environment: z.enum(['SANDBOX', 'LIVE']).optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        })
        .parse(request.body);
      const row = await upsertSecretReference({
        organizationId: auth.organizationId,
        purpose: body.purpose,
        secretRef: body.secret_ref,
        backend: body.backend,
        version: body.version,
        providerCode: body.provider_code,
        environment: body.environment,
        metadata: body.metadata,
      });
      return created(reply, request, row);
    },
  );
}
