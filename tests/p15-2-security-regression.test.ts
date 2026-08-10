import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify from 'fastify';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPing, pgQuery} from '../apps/api/src/infrastructure/db/postgres.js';
import {forceInMemoryRateLimitStore} from '../apps/api/src/foundation/rate-limit-store.js';
import {RATE_LIMIT_PLAN, resetRateLimitCounters} from '../apps/api/src/foundation/rate-limit.js';

const hasPg = async () => {
  try {
    return await pgPing();
  } catch {
    return false;
  }
};

describe('P15.2 security regression', () => {
  const app = Fastify({logger: false});
  let ready = false;
  let token = '';
  let orgId = '';

  beforeAll(async () => {
    ready = await hasPg();
    if (!ready) {
      if (process.env.FOUNDATION_PG_REQUIRED === 'true') throw new Error('PostgreSQL required');
      return;
    }
    forceInMemoryRateLimitStore();
    resetRateLimitCounters();
    await app.register(apiV1Routes, {prefix: '/api/v1'});
    await app.ready();

    const email = `p152-sec-${Date.now()}@example.com`;
    const password = 'Password123!';
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {email, password, organization_name: 'P152 Sec Org'},
    });
    expect(reg.statusCode).toBe(201);
    orgId = reg.json().data.organization_id;
    const vToken = reg.json().data?.email_verification_token;
    if (vToken) {
      await app.inject({method: 'POST', url: '/api/v1/auth/verify-email', payload: {token: vToken}});
    } else {
      await pgQuery(`UPDATE users SET email_verified_at=NOW() WHERE email_normalized=$1`, [email.toLowerCase()]);
    }
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {email, password},
    });
    token = login.json().data.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects X-Tenant-ID header', async () => {
    if (!ready) return;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {authorization: `Bearer ${token}`, 'x-tenant-id': orgId},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('TENANT_HEADER_FORBIDDEN');
  });

  it('secret references API never returns secret values', async () => {
    if (!ready) return;
    process.env.P152_TEST_WEBHOOK_SECRET = 'never-return-me';
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/secrets/references',
      headers: {authorization: `Bearer ${token}`},
      payload: {
        purpose: 'webhook_secret',
        secret_ref: 'P152_TEST_WEBHOOK_SECRET',
        backend: 'env',
        environment: 'SANDBOX',
      },
    });
    expect([200, 201]).toContain(create.statusCode);
    const body = JSON.stringify(create.json());
    expect(body).not.toContain('never-return-me');

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/secrets/references',
      headers: {authorization: `Bearer ${token}`},
    });
    expect(list.statusCode).toBe(200);
    const listBody = JSON.stringify(list.json());
    expect(listBody).not.toContain('never-return-me');
    delete process.env.P152_TEST_WEBHOOK_SECRET;
  });

  it('auth.login rate limit bucket still defined', () => {
    expect(RATE_LIMIT_PLAN['auth.login'].perIp).toBeGreaterThan(0);
    expect(RATE_LIMIT_PLAN['webhooks.ingress'].perIp).toBeGreaterThan(0);
  });

  it('unauthenticated protected route returns 401', async () => {
    if (!ready) return;
    const res = await app.inject({method: 'GET', url: '/api/v1/organizations/current'});
    expect(res.statusCode).toBe(401);
  });

  it('sandbox provider remains registered (not removed by P15.2)', async () => {
    if (!ready) return;
    const {getProviderAdapter} = await import('../apps/api/src/providers/registry.js');
    const adapter = getProviderAdapter('sandbox');
    expect(adapter.code).toBe('sandbox');
  });
});
