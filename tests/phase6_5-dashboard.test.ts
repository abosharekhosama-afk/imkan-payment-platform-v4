import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify from 'fastify';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPool, pgPing, pgQuery} from '../apps/api/src/infrastructure/db/postgres.js';
import {outboxWorker} from '../apps/api/src/foundation/outbox-worker.js';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const required = process.env.FOUNDATION_PG_REQUIRED === 'true';
const PASSWORD = 'SecurePass!123';

async function ensureMigrations() {
  const migrate = spawnSync('npm', ['run', 'db:migrate:pg'], {
    cwd: path.resolve(process.cwd()),
    env: process.env,
    encoding: 'utf8',
    shell: true,
  });
  if (migrate.status !== 0) throw new Error(migrate.stderr || migrate.stdout || 'migrate failed');
}

describe('phase 6.5 dashboard + security-events /api/v1', () => {
  const app = Fastify({logger: false});
  let ready = false;
  let ownerToken = '';
  let ownerOrg = '';
  let otherToken = '';

  async function register(email: string, orgName: string) {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {email, password: PASSWORD, organization_name: orgName, name: 'User'},
    });
    expect(reg.statusCode).toBe(201);
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: {token: reg.json().data.email_verification_token},
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {email, password: PASSWORD},
    });
    expect(login.statusCode).toBe(200);
    return {token: login.json().data.access_token as string, orgId: reg.json().data.organization_id as string};
  }

  beforeAll(async () => {
    try {
      ready = await pgPing();
    } catch {
      ready = false;
    }
    if (!ready) {
      if (required) throw new Error('PostgreSQL required');
      return;
    }
    await ensureMigrations();
    await app.register(apiV1Routes, {prefix: '/api/v1'});
    await app.ready();
    const ts = Date.now();
    const owner = await register(`p65-owner-${ts}@example.test`, 'Phase65 Merchant');
    ownerToken = owner.token;
    ownerOrg = owner.orgId;
    const other = await register(`p65-other-${ts}@example.test`, 'Phase65 Other');
    otherToken = other.token;
  }, 240_000);

  afterAll(async () => {
    outboxWorker.stop();
    await app.close().catch(() => undefined);
    await pgPool.end().catch(() => undefined);
  });

  it('returns merchant dashboard summary aggregates under RBAC', async () => {
    if (!ready) return;

    const unauth = await app.inject({method: 'GET', url: '/api/v1/merchant/dashboard/summary'});
    expect(unauth.statusCode).toBe(401);

    const empty = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/dashboard/summary',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().data.total_count).toBe(0);
    expect(empty.json().data.succeeded_volume_minor).toBe('0');
    expect(Array.isArray(empty.json().data.currency_breakdown)).toBe(true);
    expect(Array.isArray(empty.json().data.recent_payments)).toBe(true);

    // Ensures merchant_profiles row exists for the org (not created on register alone).
    const cfg = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/payment-config',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(cfg.statusCode).toBe(200);

    const merchant = await pgQuery(
      `SELECT id FROM merchant_profiles WHERE organization_id=$1 LIMIT 1`,
      [ownerOrg],
    );
    const merchantProfileId = merchant.rows[0]?.id;
    expect(merchantProfileId).toBeTruthy();

    await pgQuery(
      `INSERT INTO payment_intents (
         organization_id, merchant_profile_id, amount_minor, currency_code, status
       ) VALUES
         ($1, $2, 1000, 'SAR', 'SUCCEEDED'),
         ($1, $2, 2500, 'SAR', 'FAILED'),
         ($1, $2, 500, 'USD', 'CREATED')`,
      [ownerOrg, merchantProfileId],
    );

    const summary = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/dashboard/summary',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(summary.statusCode).toBe(200);
    const data = summary.json().data;
    expect(data.total_count).toBe(3);
    expect(data.succeeded_count).toBe(1);
    expect(data.failed_count).toBe(1);
    expect(data.pending_count).toBe(1);
    expect(data.created_count).toBe(1);
    expect(data.succeeded_volume_minor).toBe('1000');
    expect(data.currency_breakdown.some((c: {currency_code: string}) => c.currency_code === 'SAR')).toBe(true);
    expect(data.recent_payments.length).toBe(3);
    expect(data.recent_payments[0]).toHaveProperty('amount_minor');
    expect(typeof data.recent_payments[0].amount_minor).toBe('string');

    const otherView = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/dashboard/summary',
      headers: {authorization: `Bearer ${otherToken}`},
    });
    expect(otherView.statusCode).toBe(200);
    expect(otherView.json().data.total_count).toBe(0);
  });

  it('lists security events for current org with paging', async () => {
    if (!ready) return;

    const unauth = await app.inject({method: 'GET', url: '/api/v1/security-events'});
    expect(unauth.statusCode).toBe(401);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/security-events?limit=5&offset=0',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(list.statusCode).toBe(200);
    expect(Array.isArray(list.json().data)).toBe(true);
    expect(list.json().meta.limit).toBe(5);
    expect(list.json().meta.offset).toBe(0);
    if (list.json().data.length > 0) {
      const row = list.json().data[0];
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('event_type');
      expect(row).toHaveProperty('success');
      expect(row).toHaveProperty('created_at');
      expect(row.organization_id).toBe(ownerOrg);
      expect(row).not.toHaveProperty('password_hash');
    }

    const other = await app.inject({
      method: 'GET',
      url: '/api/v1/security-events',
      headers: {authorization: `Bearer ${otherToken}`},
    });
    expect(other.statusCode).toBe(200);
    for (const row of other.json().data) {
      expect(row.organization_id).not.toBe(ownerOrg);
    }
  });
});
