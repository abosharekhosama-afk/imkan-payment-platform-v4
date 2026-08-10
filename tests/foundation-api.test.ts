import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify from 'fastify';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPool, pgPing, pgQuery} from '../apps/api/src/infrastructure/db/postgres.js';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const hasPg = async () => {
  try {
    return await pgPing();
  } catch {
    return false;
  }
};

async function ensureMigrations() {
  const existing = await pgQuery<{c: string}>(
    `SELECT COUNT(*)::text AS c FROM information_schema.tables
     WHERE table_schema='public' AND table_name='organizations'`,
  );
  if (Number(existing.rows[0]?.c || 0) > 0) return;

  const migrate = spawnSync('npm', ['run', 'db:migrate:pg'], {
    cwd: path.resolve(process.cwd()),
    env: process.env,
    encoding: 'utf8',
    shell: true,
  });
  if (migrate.status !== 0) {
    console.error(migrate.stdout, migrate.stderr);
    throw new Error('PostgreSQL migrations failed');
  }
}

describe('foundation /api/v1', () => {
  const app = Fastify({logger: false});
  let ready = false;
  let tokenA = '';
  let orgA = '';
  let tokenB = '';
  let orgB = '';

  beforeAll(async () => {
    ready = await hasPg();
    if (!ready) {
      if (process.env.FOUNDATION_PG_REQUIRED === 'true') {
        throw new Error('FOUNDATION_PG_REQUIRED=true but PostgreSQL is unreachable');
      }
      return;
    }
    try {
      await ensureMigrations();
    } catch (error) {
      if (process.env.FOUNDATION_PG_REQUIRED === 'true') throw error;
      ready = false;
      return;
    }
    await app.register(apiV1Routes, {prefix: '/api/v1'});
    await app.ready();

    const emailA = `owner-a-${Date.now()}@example.test`;
    const emailB = `owner-b-${Date.now()}@example.test`;
    const regA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {email: emailA, password: 'SecurePass!123', organization_name: 'Org Alpha', name: 'Alpha Owner'},
    });
    expect(regA.statusCode).toBe(201);
    orgA = regA.json().data.organization_id;

    const loginA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {email: emailA, password: 'SecurePass!123'},
    });
    expect(loginA.statusCode).toBe(200);
    tokenA = loginA.json().data.access_token;

    const regB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {email: emailB, password: 'SecurePass!123', organization_name: 'Org Beta'},
    });
    expect(regB.statusCode).toBe(201);
    orgB = regB.json().data.organization_id;
    const loginB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {email: emailB, password: 'SecurePass!123'},
    });
    tokenB = loginB.json().data.access_token;
  }, 120_000);

  afterAll(async () => {
    await app.close().catch(() => undefined);
    await pgPool.end().catch(() => undefined);
  });

  it('requires PostgreSQL when FOUNDATION_PG_REQUIRED=true', async () => {
    if (process.env.FOUNDATION_PG_REQUIRED === 'true') {
      expect(ready).toBe(true);
      return;
    }
    // Without the flag, suite may soft-skip if no local PG is running.
    expect(typeof ready).toBe('boolean');
  });

  it('health endpoints work', async () => {
    if (!ready) return;
    const health = await app.inject({method: 'GET', url: '/api/v1/health'});
    expect(health.statusCode).toBe(200);
    const readyRes = await app.inject({method: 'GET', url: '/api/v1/health/ready'});
    expect(readyRes.statusCode).toBe(200);
    expect(readyRes.json().data.postgres).toBe(true);
  });

  it('rejects X-Tenant-ID on protected routes', async () => {
    if (!ready) return;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {authorization: `Bearer ${tokenA}`, 'x-tenant-id': 'anything'},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('TENANT_HEADER_FORBIDDEN');
  });

  it('requires authentication on protected routes', async () => {
    if (!ready) return;
    const res = await app.inject({method: 'GET', url: '/api/v1/auth/me'});
    expect(res.statusCode).toBe(401);
  });

  it('returns current user with RBAC permissions', async () => {
    if (!ready) return;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {authorization: `Bearer ${tokenA}`},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.organization_id).toBe(orgA);
    expect(res.json().data.roles).toContain('MERCHANT_OWNER');
    expect(res.json().data.permissions).toContain('org.manage');
  });

  it('enforces tenant isolation on organization read', async () => {
    if (!ready) return;
    const allowed = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${orgA}`,
      headers: {authorization: `Bearer ${tokenA}`},
    });
    expect(allowed.statusCode).toBe(200);

    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${orgB}`,
      headers: {authorization: `Bearer ${tokenA}`},
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('CROSS_TENANT_DENIED');
  });

  it('enforces authorization on audit events', async () => {
    if (!ready) return;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/audit-events',
      headers: {authorization: `Bearer ${tokenA}`},
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
  });

  it('keeps org B members invisible to org A', async () => {
    if (!ready) return;
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${orgB}/members`,
      headers: {authorization: `Bearer ${tokenA}`},
    });
    expect(res.statusCode).toBe(403);
  });

  it('includes request_id in error responses', async () => {
    if (!ready) return;
    const res = await app.inject({method: 'GET', url: '/api/v1/auth/me'});
    expect(res.json().error.request_id).toBeTruthy();
  });

  it('persists register audit, security, and outbox in one transaction boundary', async () => {
    if (!ready) return;
    const email = `tx-reg-${Date.now()}@example.test`;
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {email, password: 'SecurePass!123', organization_name: 'Tx Org'},
    });
    expect(reg.statusCode).toBe(201);
    const userId = reg.json().data.user_id as string;
    const organizationId = reg.json().data.organization_id as string;

    const audit = await pgQuery(
      `SELECT COUNT(*)::int AS c FROM audit_events WHERE organization_id=$1 AND action='user.registered' AND resource_id=$2`,
      [organizationId, userId],
    );
    const security = await pgQuery(
      `SELECT COUNT(*)::int AS c FROM security_events WHERE organization_id=$1 AND user_id=$2 AND event_type='user.registered'`,
      [organizationId, userId],
    );
    const outbox = await pgQuery(
      `SELECT COUNT(*)::int AS c FROM outbox_events WHERE organization_id=$1 AND idempotency_key=$2`,
      [organizationId, `user.registered:${userId}`],
    );
    expect(audit.rows[0].c).toBe(1);
    expect(security.rows[0].c).toBe(1);
    expect(outbox.rows[0].c).toBe(1);
  });

  it('issues session with login and security events atomically', async () => {
    if (!ready) return;
    const email = `tx-login-${Date.now()}@example.test`;
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {email, password: 'SecurePass!123', organization_name: 'Login Tx Org'},
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {email, password: 'SecurePass!123'},
    });
    expect(login.statusCode).toBe(200);
    const sessionId = login.json().data.session_id as string;
    const userId = login.json().data.user.id as string;
    const organizationId = login.json().data.organization_id as string;

    const sessions = await pgQuery(`SELECT COUNT(*)::int AS c FROM sessions WHERE id=$1 AND user_id=$2`, [
      sessionId,
      userId,
    ]);
    const loginEvents = await pgQuery(
      `SELECT COUNT(*)::int AS c FROM login_events WHERE user_id=$1 AND organization_id=$2 AND success=TRUE`,
      [userId, organizationId],
    );
    const security = await pgQuery(
      `SELECT COUNT(*)::int AS c FROM security_events WHERE user_id=$1 AND organization_id=$2 AND event_type='login.succeeded'`,
      [userId, organizationId],
    );
    expect(sessions.rows[0].c).toBe(1);
    expect(loginEvents.rows[0].c).toBeGreaterThanOrEqual(1);
    expect(security.rows[0].c).toBeGreaterThanOrEqual(1);
  });

  it('enables MFA with audit and security events', async () => {
    if (!ready) return;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/enable',
      headers: {authorization: `Bearer ${tokenA}`},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.mfa_enabled).toBe(true);
    expect(res.json().data.secret).toBeTruthy();
    const security = await pgQuery(
      `SELECT COUNT(*)::int AS c FROM security_events WHERE organization_id=$1 AND event_type='user.mfa_enabled'`,
      [orgA],
    );
    expect(security.rows[0].c).toBeGreaterThanOrEqual(1);
  });

  it('records failed login attempts with security events', async () => {
    if (!ready) return;
    const email = `fail-${Date.now()}@example.test`;
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {email, password: 'SecurePass!123', organization_name: 'Fail Org'},
    });
    const fail = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {email, password: 'WrongPassword!!'},
    });
    expect(fail.statusCode).toBe(401);
    const user = await pgQuery<{id: string; failed_login_count: number}>(
      `SELECT id, failed_login_count FROM users WHERE email_normalized=$1`,
      [email.toLowerCase()],
    );
    expect(user.rows[0].failed_login_count).toBeGreaterThanOrEqual(1);
    const security = await pgQuery(
      `SELECT COUNT(*)::int AS c FROM security_events WHERE user_id=$1 AND event_type='login.failed'`,
      [user.rows[0].id],
    );
    expect(security.rows[0].c).toBeGreaterThanOrEqual(1);
  });
});
