import './load-env.js';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import {config} from './config.js';
import {routes} from './interfaces/http/routes.js';
import {apiV1Routes} from './interfaces/http/apiV1/routes.js';
import {pool} from './infrastructure/db/mysql.js';
import {closePgPool} from './infrastructure/db/postgres.js';
import {redisPing, closeRedis} from './infrastructure/db/redis.js';
import {outboxWorker} from './foundation/outbox-worker.js';
import {billingRenewalWorker} from './billing/renewal-service.js';
import {bootstrapRateLimitStore} from './foundation/rate-limit-bootstrap.js';
import {bootstrapStripeRoutesDev} from './providers/bootstrap-stripe-routes.js';
import {correlationFields, sanitizeLogFields} from './observability/logging.js';
import {incrMetric} from './observability/metrics.js';

const app = Fastify({
  logger: {level: process.env.LOG_LEVEL || 'info'},
  genReqId: () => crypto.randomUUID(),
  trustProxy: process.env.TRUST_PROXY === 'true',
});

await app.register(helmet, {
  global: true,
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: config.isProduction ? undefined : false,
});
await app.register(cors, {
  origin: config.corsOrigin.split(',').map((x) => x.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-CSRF-Token',
    'Idempotency-Key',
    'X-Step-Up-Token',
    'X-Api-Key',
  ],
});

// Global edge limiter remains in-memory Fastify plugin for coarse protection.
// Application bucket limits use Redis in production via foundation rate-limit store.
await app.register(rateLimit, {
  max: Number(process.env.RATE_LIMIT_MAX || 120),
  timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
});

try {
  const rl = await bootstrapRateLimitStore();
  app.log.info({rate_limit_backend: rl.backend}, 'rate limit store ready');
} catch (error: any) {
  if (config.isProduction) throw error;
  app.log.warn({err: error}, 'rate limit store bootstrap failed; using in-memory');
}

await app.register(apiV1Routes, {prefix: '/api/v1'});

app.addHook('onResponse', async (req, reply) => {
  incrMetric('http_requests_total', {
    method: req.method,
    status: String(reply.statusCode),
  });
  req.log.info(
    sanitizeLogFields({
      ...correlationFields({
        requestId: req.id,
        organizationId: (req as any).auth?.organizationId,
        userId: (req as any).auth?.userId,
      }),
      method: req.method,
      route: req.routeOptions?.url || req.url,
      status_code: reply.statusCode,
      duration_ms: reply.elapsedTime,
    }),
    'request completed',
  );
});

const REDACT =
  /password|secret|token|authorization|api[-_]?key|client[-_]?secret|refresh[-_]?token|access[-_]?token|cvv|cvc|card[-_]?number|provider[-_]?token/i;
function redact(value: any, depth = 0): any {
  if (depth > 6) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 12000 ? `${value.slice(0, 12000)}…[TRUNCATED]` : value;
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}
function validationMessage(e: any) {
  const issues = Array.isArray(e?.issues) ? e.issues : [];
  if (!issues.length) return 'The request contains invalid data.';
  return issues
    .map((issue: any) => {
      const field = Array.isArray(issue.path) && issue.path.length ? issue.path.join('.') : 'request';
      const message = String(issue.message || 'Invalid value');
      return `${field}: ${message}`;
    })
    .join(' | ');
}
function friendlyCodeMessage(code: string, message: string) {
  const map: Record<string, string> = {
    INVALID_SESSION: 'Your session is no longer valid. Please sign in again.',
    INVALID_API_KEY: 'The API key is invalid, expired, or revoked.',
    AUTHENTICATION_REQUIRED: 'Please sign in to continue.',
    FORBIDDEN: 'You do not have permission to perform this operation.',
    INVALID_CREDENTIALS: 'The email or password is incorrect.',
    ACCOUNT_LOCKED: 'This account is temporarily locked. Please try again later.',
    MERCHANT_NOT_FOUND: 'The merchant account could not be found for this workspace.',
    PAYMENT_NOT_FOUND: 'The requested payment could not be found.',
    CUSTOMER_NOT_FOUND: 'The requested customer could not be found.',
    PAYMENT_LINK_NOT_FOUND: 'The requested payment link could not be found.',
    PAYMENT_LINK_NOT_CANCELLABLE: 'This payment link cannot be cancelled in its current state.',
    IDEMPOTENCY_KEY_REQUIRED: 'This operation requires a unique Idempotency-Key header. Please retry the request.',
    API_KEY_NOT_FOUND: 'The requested API key could not be found.',
    REPORT_NOT_FOUND: 'The requested report could not be found.',
    WEBHOOK_DELIVERY_NOT_RETRYABLE: 'This webhook delivery is not currently eligible for retry.',
    CSRF_INVALID: 'CSRF validation failed. Refresh the page and try again.',
  };
  return map[code] || message;
}
function databaseMessage(e: any) {
  const code = String(e?.code || '');
  if (code === 'ER_BAD_FIELD_ERROR')
    return 'The local database schema is out of date. Run "npm run db:migrate" and restart the API.';
  if (code === 'ER_NO_SUCH_TABLE')
    return 'A required database table is missing. Run "npm run db:migrate" and restart the API.';
  if (code === 'ER_DUP_ENTRY') return 'This record already exists. Refresh the page and try again.';
  if (code === 'ER_PARSE_ERROR' || code === 'ER_WRONG_VALUE_COUNT_ON_ROW')
    return 'The local database query could not be executed. Please run the latest migrations and restart the API.';
  if (code === 'ER_NO_REFERENCED_ROW_2' || code === 'ER_ROW_IS_REFERENCED_2')
    return 'The requested record is not available or is still in use.';
  return '';
}
app.setErrorHandler(async (e: any, req, reply) => {
  req.log.error({err: e, request_id: req.id}, 'request failed');
  const isValidation = e?.name === 'ZodError' || Array.isArray(e?.issues);
  const dbMessage = databaseMessage(e);
  const status = isValidation ? 400 : Number(e.statusCode || 500);
  const code = isValidation ? 'VALIDATION_ERROR' : String(e.code || 'INTERNAL_ERROR');
  const rawMessage = isValidation
    ? validationMessage(e)
    : dbMessage || String(e.message || 'An unexpected server error occurred.');
  const message = isValidation ? rawMessage : friendlyCodeMessage(code, rawMessage);
  const auth: any = (req as any).auth || {};
  const safeHeaders = redact(req.headers);
  const report = {
    id: crypto.randomUUID(),
    tenant_id: auth.tenantId || null,
    user_id: auth.userId || null,
    request_id: req.id,
    method: req.method,
    route: req.routeOptions?.url || req.url,
    status_code: status,
    error_code: code,
    message,
    ip: req.ip,
    user_agent: String(req.headers['user-agent'] || ''),
    query_json: JSON.stringify(redact(req.query || {})),
    params_json: JSON.stringify(redact(req.params || {})),
    body_json: JSON.stringify(redact(req.body || null)),
    headers_json: JSON.stringify(safeHeaders),
    stack: config.isProduction && status >= 500 ? null : String(e.stack || ''),
  };
  try {
    await pool.query(
      `INSERT INTO error_reports(id,tenant_id,user_id,request_id,method,route,status_code,error_code,message,ip,user_agent,query_json,params_json,body_json,headers_json,stack) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        report.id,
        report.tenant_id,
        report.user_id,
        report.request_id,
        report.method,
        report.route,
        report.status_code,
        report.error_code,
        report.message,
        report.ip,
        report.user_agent,
        report.query_json,
        report.params_json,
        report.body_json,
        report.headers_json,
        report.stack,
      ],
    );
  } catch (dbError) {
    req.log.error({err: dbError, request_id: req.id}, 'failed to persist error report');
  }
  const publicMessage = config.isProduction && status >= 500 ? 'Internal server error' : message;
  reply.code(status).send({error: {code, message: publicMessage, request_id: req.id}});
});
if (config.enableLegacyV1) {
  await app.register(routes);
}
outboxWorker.start();
if (process.env.BILLING_RENEWAL_WORKER_ENABLED !== 'false') {
  billingRenewalWorker.start();
}
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  app.log.info({signal}, 'graceful shutdown');
  outboxWorker.stop();
  billingRenewalWorker.stop();
  await app.close().catch(() => undefined);
  await closeRedis().catch(() => undefined);
  await closePgPool().catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exit(0);
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
await bootstrapStripeRoutesDev().catch((err) => {
  app.log.warn({err}, 'stripe route bootstrap skipped');
});
await app.listen({port: config.port, host: '0.0.0.0'});
const redisStatus = await redisPing();
app.log.info(
  {
    port: config.port,
    provider: config.paymentProvider,
    region: config.region,
    api: '/api/v1',
    legacyV1: config.enableLegacyV1,
    outboxWorker: config.outboxWorkerEnabled,
    redis: redisStatus,
    rateLimitStore: config.rateLimitStore,
    secretBackend: config.secretBackend,
    sessionTransport: config.sessionTransport,
  },
  'API started',
);
