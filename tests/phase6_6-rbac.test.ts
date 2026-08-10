import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify, {type FastifyInstance} from 'fastify';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPool, pgPing, pgQuery} from '../apps/api/src/infrastructure/db/postgres.js';
import {outboxWorker} from '../apps/api/src/foundation/outbox-worker.js';
import {authHasPermission, isPermissionSubset, PERMISSIONS} from '../apps/api/src/foundation/permissions-catalog.js';
import {currentTotp} from '../apps/api/src/foundation/crypto.js';
import {issueStepUpToken} from './helpers/step-up.js';

const required = process.env.FOUNDATION_PG_REQUIRED === 'true';

async function ensureMigrations() {
  const migrate = spawnSync('npm', ['run', 'db:migrate:pg'], {
    cwd: path.resolve(process.cwd()),
    env: process.env,
    encoding: 'utf8',
    shell: true,
  });
  if (migrate.status !== 0) throw new Error(migrate.stderr || migrate.stdout || 'migrate failed');
}

async function registerOwner(app: FastifyInstance, suffix: string) {
  const email = `p66-${suffix}-${Date.now()}@example.test`;
  const password = 'SecurePass!123';
  const reg = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {email, password, organization_name: `P66 ${suffix}`, name: suffix},
  });
  expect(reg.statusCode).toBe(201);
  const orgId = reg.json().data.organization_id as string;
  const userId = reg.json().data.user_id as string;
  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/verify-email',
    payload: {token: reg.json().data.email_verification_token},
  });
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {email, password},
  });
  expect(login.statusCode).toBe(200);
  return {email, password, orgId, userId, token: login.json().data.access_token as string};
}

describe('phase 6.6 RBAC / tenant isolation', () => {
  const app = Fastify({logger: false});
  let ready = false;
  let a: Awaited<ReturnType<typeof registerOwner>>;
  let b: Awaited<ReturnType<typeof registerOwner>>;

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
    a = await registerOwner(app, 'orgA');
    b = await registerOwner(app, 'orgB');
  }, 180_000);

  afterAll(async () => {
    outboxWorker.stop();
    await app.close().catch(() => undefined);
    await pgPool.end().catch(() => undefined);
  });

  it('unit: permission helpers prevent escalation', () => {
    expect(authHasPermission(['payments.read'], 'payments.read')).toBe(true);
    expect(authHasPermission(['payments.read'], 'payments.manage')).toBe(false);
    expect(authHasPermission(['platform.admin'], 'payouts.manage')).toBe(true);
    expect(isPermissionSubset(['payments.read', 'customers.read'], ['payments.read'])).toBe(true);
    expect(isPermissionSubset(['payments.read'], ['payments.read', 'api_keys.manage'])).toBe(false);
    expect(PERMISSIONS.ORG_READ).toBe('org.read');
  });

  it('unauthenticated renewals → 401', async () => {
    if (!ready) return;
    const res = await app.inject({method: 'POST', url: '/api/v1/billing/renewals/run', payload: {}});
    expect(res.statusCode).toBe(401);
  });

  it('viewer cannot manage payment links (403)', async () => {
    if (!ready) return;
    // Downgrade a second user in org A to VIEWER via SQL
    const viewerEmail = `p66-viewer-${Date.now()}@example.test`;
    const password = 'SecurePass!123';
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {email: viewerEmail, password, organization_name: `Viewer Org ${Date.now()}`, name: 'Viewer'},
    });
    expect(reg.statusCode).toBe(201);
    const orgId = reg.json().data.organization_id as string;
    const userId = reg.json().data.user_id as string;
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: {token: reg.json().data.email_verification_token},
    });
    await pgQuery(
      `UPDATE user_roles ur
       SET role_id = (SELECT id FROM roles WHERE code='MERCHANT_VIEWER' AND organization_id IS NULL)
       WHERE ur.user_id=$1 AND ur.organization_id=$2`,
      [userId, orgId],
    );
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {email: viewerEmail, password},
    });
    const token = login.json().data.access_token;
    const denied = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/payment-links',
      headers: {authorization: `Bearer ${token}`, 'idempotency-key': crypto.randomUUID()},
      payload: {
        title: 'Nope',
        amount_minor: '100',
        currency_code: 'USD',
      },
    });
    expect(denied.statusCode).toBe(403);
  });

  it('F-01: renewals/run is organization-scoped for merchants', async () => {
    if (!ready) return;
    // Create a due subscription in org B
    const cust = await app.inject({
      method: 'POST',
      url: '/api/v1/customers',
      headers: {authorization: `Bearer ${b.token}`, 'idempotency-key': crypto.randomUUID()},
      payload: {
        name: 'B Customer',
        email: `b-${Date.now()}@example.test`,
        default_payment_method_token: 'tok_ok',
      },
    });
    expect(cust.statusCode).toBe(201);
    const product = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: {authorization: `Bearer ${b.token}`, 'idempotency-key': crypto.randomUUID()},
      payload: {name: 'B Product', product_type: 'SUBSCRIPTION'},
    });
    expect(product.statusCode).toBe(201);
    const price = await app.inject({
      method: 'POST',
      url: '/api/v1/prices',
      headers: {authorization: `Bearer ${b.token}`, 'idempotency-key': crypto.randomUUID()},
      payload: {
        product_id: product.json().data.id,
        currency_code: 'USD',
        unit_amount_minor: '500',
        interval_unit: 'MONTH',
        interval_count: 1,
      },
    });
    expect(price.statusCode).toBe(201);
    const sub = await app.inject({
      method: 'POST',
      url: '/api/v1/subscriptions',
      headers: {authorization: `Bearer ${b.token}`, 'idempotency-key': crypto.randomUUID()},
      payload: {
        customer_id: cust.json().data.id,
        price_id: price.json().data.id,
        payment_method_token: 'tok_ok',
      },
    });
    expect(sub.statusCode).toBe(201);
    const subId = sub.json().data.id as string;
    await pgQuery(`UPDATE subscriptions SET next_billing_at=NOW() - interval '1 minute' WHERE id=$1`, [subId]);

    // Org A runs renewals — must NOT invoice org B
    const runA = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/renewals/run',
      headers: {
        authorization: `Bearer ${a.token}`,
        'idempotency-key': crypto.randomUUID(),
        'x-step-up-token': await issueStepUpToken(app, a.token),
      },
      payload: {limit: 50},
    });
    expect(runA.statusCode).toBe(200);
    expect(runA.json().data.organization_scoped).toBe(true);
    const invoicesB = await app.inject({
      method: 'GET',
      url: '/api/v1/invoices',
      headers: {authorization: `Bearer ${b.token}`},
    });
    expect(invoicesB.statusCode).toBe(200);
    const bList = invoicesB.json().data || [];
    expect(bList.length).toBe(0);

    // Org B runs renewals — should create invoice for itself
    const runB = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/renewals/run',
      headers: {
        authorization: `Bearer ${b.token}`,
        'idempotency-key': crypto.randomUUID(),
        'x-step-up-token': await issueStepUpToken(app, b.token),
      },
      payload: {limit: 50},
    });
    expect(runB.statusCode).toBe(200);
    const invoicesB2 = await app.inject({
      method: 'GET',
      url: '/api/v1/invoices',
      headers: {authorization: `Bearer ${b.token}`},
    });
    expect((invoicesB2.json().data || []).length).toBeGreaterThan(0);
  });

  it('custom role escalation denied without holding target permissions', async () => {
    if (!ready) return;
    // Enable MFA + step-up for owner A
    const mfa = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/enable',
      headers: {authorization: `Bearer ${a.token}`},
    });
    expect(mfa.statusCode).toBe(200);
    const secret = mfa.json().data.secret as string;
    const step = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/step-up',
      headers: {authorization: `Bearer ${a.token}`},
      payload: {totp: currentTotp(secret)},
    });
    expect(step.statusCode).toBe(200);
    const stepUp = step.json().data.step_up_token as string;

    const escalate = await app.inject({
      method: 'POST',
      url: '/api/v1/rbac/roles',
      headers: {
        authorization: `Bearer ${a.token}`,
        'idempotency-key': crypto.randomUUID(),
        'x-step-up-token': stepUp,
      },
      payload: {
        name: `Escalator ${Date.now()}`,
        permissions: ['platform.system.manage'],
      },
    });
    expect([403, 400]).toContain(escalate.statusCode);

    const step2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/step-up',
      headers: {authorization: `Bearer ${a.token}`},
      payload: {totp: currentTotp(secret)},
    });
    const okRole = await app.inject({
      method: 'POST',
      url: '/api/v1/rbac/roles',
      headers: {
        authorization: `Bearer ${a.token}`,
        'idempotency-key': crypto.randomUUID(),
        'x-step-up-token': step2.json().data.step_up_token,
      },
      payload: {
        name: `Safe Role ${Date.now()}`,
        permissions: ['payments.read'],
      },
    });
    expect(okRole.statusCode).toBe(201);
  });

  it('cross-tenant invoice read returns 404', async () => {
    if (!ready) return;
    const listB = await app.inject({
      method: 'GET',
      url: '/api/v1/invoices',
      headers: {authorization: `Bearer ${b.token}`},
    });
    const inv = (listB.json().data || [])[0];
    if (!inv) return;
    const leak = await app.inject({
      method: 'GET',
      url: `/api/v1/invoices/${inv.id}`,
      headers: {authorization: `Bearer ${a.token}`},
    });
    expect([403, 404]).toContain(leak.statusCode);
  });

  it('ADMIN cannot assign MERCHANT_OWNER (vertical escalation)', async () => {
    if (!ready) return;
    const adminEmail = `p66-admin-${Date.now()}@example.test`;
    const password = 'SecurePass!123';
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {email: adminEmail, password, organization_name: `Admin Org ${Date.now()}`, name: 'Admin'},
    });
    expect(reg.statusCode).toBe(201);
    const orgId = reg.json().data.organization_id as string;
    const ownerUserId = reg.json().data.user_id as string;
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: {token: reg.json().data.email_verification_token},
    });
    // Create second user as VIEWER then try ADMIN→OWNER assign via SQL-downgraded ADMIN
    const viewerEmail = `p66-admin-target-${Date.now()}@example.test`;
    const reg2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {email: viewerEmail, password, organization_name: `Other ${Date.now()}`, name: 'Target'},
    });
    const targetUserId = reg2.json().data.user_id as string;
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: {token: reg2.json().data.email_verification_token},
    });
    // Move target into admin's org as active member with VIEWER
    await pgQuery(`DELETE FROM organization_users WHERE user_id=$1`, [targetUserId]);
    await pgQuery(
      `INSERT INTO organization_users (organization_id, user_id, status) VALUES ($1,$2,'ACTIVE')
       ON CONFLICT (organization_id, user_id) DO UPDATE SET status='ACTIVE'`,
      [orgId, targetUserId],
    );
    await pgQuery(`DELETE FROM user_roles WHERE user_id=$1`, [targetUserId]);
    await pgQuery(
      `INSERT INTO user_roles (user_id, role_id, organization_id)
       SELECT $1, id, $2 FROM roles WHERE code='MERCHANT_VIEWER' AND organization_id IS NULL`,
      [targetUserId, orgId],
    );
    // Downgrade original owner to ADMIN
    await pgQuery(
      `UPDATE user_roles ur
       SET role_id = (SELECT id FROM roles WHERE code='MERCHANT_ADMIN' AND organization_id IS NULL)
       WHERE ur.user_id=$1 AND ur.organization_id=$2`,
      [ownerUserId, orgId],
    );
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {email: adminEmail, password},
    });
    const token = login.json().data.access_token as string;
    const stepUp = await issueStepUpToken(app, token);
    const escalate = await app.inject({
      method: 'POST',
      url: `/api/v1/rbac/users/${targetUserId}/assign-role`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': crypto.randomUUID(),
        'x-step-up-token': stepUp,
      },
      payload: {role_code: 'MERCHANT_OWNER'},
    });
    expect(escalate.statusCode).toBe(403);
    expect(escalate.json().error?.code).toBe('OWNER_ASSIGN_DENIED');
  });

  it('renewals without step-up → 403 STEP_UP_REQUIRED', async () => {
    if (!ready) return;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/renewals/run',
      headers: {authorization: `Bearer ${a.token}`, 'idempotency-key': crypto.randomUUID()},
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('payment cancel without payments.cancel → 403', async () => {
    if (!ready) return;
    const viewerEmail = `p66-cancel-${Date.now()}@example.test`;
    const password = 'SecurePass!123';
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {email: viewerEmail, password, organization_name: `Cancel Org ${Date.now()}`, name: 'V'},
    });
    const orgId = reg.json().data.organization_id as string;
    const userId = reg.json().data.user_id as string;
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: {token: reg.json().data.email_verification_token},
    });
    await pgQuery(
      `UPDATE user_roles ur
       SET role_id = (SELECT id FROM roles WHERE code='MERCHANT_VIEWER' AND organization_id IS NULL)
       WHERE ur.user_id=$1 AND ur.organization_id=$2`,
      [userId, orgId],
    );
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {email: viewerEmail, password},
    });
    const token = login.json().data.access_token as string;
    const denied = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/payments/${crypto.randomUUID()}/cancel`,
      headers: {authorization: `Bearer ${token}`, 'idempotency-key': crypto.randomUUID()},
      payload: {},
    });
    expect(denied.statusCode).toBe(403);
  });
});
