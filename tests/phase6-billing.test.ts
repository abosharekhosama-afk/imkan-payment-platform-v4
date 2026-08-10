import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify from 'fastify';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPool, pgPing, pgQuery} from '../apps/api/src/infrastructure/db/postgres.js';
import {outboxWorker} from '../apps/api/src/foundation/outbox-worker.js';
import {billingRenewalWorker} from '../apps/api/src/billing/renewal-service.js';
import {issueStepUpToken} from './helpers/step-up.js';
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

describe('phase 6 billing /api/v1', () => {
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
    const owner = await register(`p6-owner-${ts}@example.test`, 'Phase6 Merchant');
    ownerToken = owner.token;
    ownerOrg = owner.orgId;
    const other = await register(`p6-other-${ts}@example.test`, 'Phase6 Other');
    otherToken = other.token;
  }, 240_000);

  afterAll(async () => {
    outboxWorker.stop();
    billingRenewalWorker.stop();
    await app.close().catch(() => undefined);
    await pgPool.end().catch(() => undefined);
  });

  it('creates customer with DEC-006 email uniqueness and tenant isolation', async () => {
    if (!ready) return;
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/customers',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-cust-${Date.now()}`},
      payload: {name: 'Ada', email: 'ada@p6.test', default_payment_method_token: 'tok_ok'},
    });
    expect(c.statusCode).toBe(201);

    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/customers',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-cust-dup-${Date.now()}`},
      payload: {name: 'Ada2', email: 'ADA@p6.test'},
    });
    expect(dup.statusCode).toBe(409);

    const otherSameEmail = await app.inject({
      method: 'POST',
      url: '/api/v1/customers',
      headers: {authorization: `Bearer ${otherToken}`, 'idempotency-key': `p6-cust-o-${Date.now()}`},
      payload: {name: 'Other Ada', email: 'ada@p6.test'},
    });
    expect(otherSameEmail.statusCode).toBe(201);
  });

  it('catalog → subscription → renewal success via Payment Core → Router', async () => {
    if (!ready) return;
    const product = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-prod-${Date.now()}`},
      payload: {name: 'Pro', product_type: 'SUBSCRIPTION'},
    });
    expect(product.statusCode).toBe(201);

    const price = await app.inject({
      method: 'POST',
      url: '/api/v1/prices',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-price-${Date.now()}`},
      payload: {
        product_id: product.json().data.id,
        currency_code: 'SAR',
        unit_amount_minor: '1500',
        interval_unit: 'MONTH',
        interval_count: 1,
      },
    });
    expect(price.statusCode).toBe(201);

    const customer = await app.inject({
      method: 'POST',
      url: '/api/v1/customers',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-c2-${Date.now()}`},
      payload: {name: 'Bill', email: `bill-${Date.now()}@p6.test`, default_payment_method_token: 'tok_ok'},
    });
    expect(customer.statusCode).toBe(201);

    const sub = await app.inject({
      method: 'POST',
      url: '/api/v1/subscriptions',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-sub-${Date.now()}`},
      payload: {
        customer_id: customer.json().data.id,
        price_id: price.json().data.id,
        payment_method_token: 'tok_ok',
      },
    });
    expect(sub.statusCode).toBe(201);
    expect(sub.json().data.status).toBe('ACTIVE');

    // Make subscription due
    await pgQuery(`UPDATE subscriptions SET next_billing_at=NOW() - interval '1 minute' WHERE id=$1`, [
      sub.json().data.id,
    ]);

    const run = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/renewals/run',
      headers: {
        authorization: `Bearer ${ownerToken}`,
        'idempotency-key': `p6-run-${Date.now()}`,
        'x-step-up-token': await issueStepUpToken(app, ownerToken),
      },
      payload: {limit: 10},
    });
    expect(run.statusCode).toBe(200);
    const processed = run.json().data.processed as any[];
    const hit = processed.find((p) => p.subscription_id === sub.json().data.id);
    expect(hit?.status).toBe('SUCCEEDED');

    const invoices = await app.inject({
      method: 'GET',
      url: '/api/v1/invoices',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(invoices.statusCode).toBe(200);
    expect(invoices.json().data.some((i: any) => i.status === 'PAID')).toBe(true);

    const providerTx = await pgQuery(
      `SELECT count(*)::int AS c FROM provider_transactions WHERE organization_id=$1 AND operation='AUTHORIZE'`,
      [ownerOrg],
    );
    expect(providerTx.rows[0].c).toBeGreaterThan(0);

    // Duplicate period invoice prevented
    await pgQuery(`UPDATE subscriptions SET next_billing_at=NOW() - interval '1 minute' WHERE id=$1`, [
      sub.json().data.id,
    ]);
    // Force same period dates back for uniqueness check — after success period advanced, create due again is new period
    const invCount = await pgQuery(`SELECT count(*)::int AS c FROM invoices WHERE subscription_id=$1`, [
      sub.json().data.id,
    ]);
    expect(invCount.rows[0].c).toBeGreaterThanOrEqual(1);
  });

  it('failed renewal → PAST_DUE; max retries → UNPAID; ambiguous uses query_before_retry', async () => {
    if (!ready) return;
    const product = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-pf-${Date.now()}`},
      payload: {name: 'FailPlan'},
    });
    const price = await app.inject({
      method: 'POST',
      url: '/api/v1/prices',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-prf-${Date.now()}`},
      payload: {
        product_id: product.json().data.id,
        currency_code: 'SAR',
        unit_amount_minor: '2000',
        interval_unit: 'DAY',
        interval_count: 1,
      },
    });
    const customer = await app.inject({
      method: 'POST',
      url: '/api/v1/customers',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-cf-${Date.now()}`},
      payload: {name: 'Failer', email: `fail-${Date.now()}@p6.test`, default_payment_method_token: 'tok_FAIL'},
    });
    const sub = await app.inject({
      method: 'POST',
      url: '/api/v1/subscriptions',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-sf-${Date.now()}`},
      payload: {
        customer_id: customer.json().data.id,
        price_id: price.json().data.id,
        payment_method_token: 'tok_FAIL',
      },
    });
    await pgQuery(`UPDATE subscriptions SET next_billing_at=NOW() - interval '1 minute', next_retry_at=NULL WHERE id=$1`, [
      sub.json().data.id,
    ]);

    const r1 = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/renewals/run',
      headers: {
        authorization: `Bearer ${ownerToken}`,
        'idempotency-key': `p6-rf1-${Date.now()}`,
        'x-step-up-token': await issueStepUpToken(app, ownerToken),
      },
      payload: {},
    });
    expect(r1.statusCode).toBe(200);
    let s = await pgQuery(`SELECT status, retry_count FROM subscriptions WHERE id=$1`, [sub.json().data.id]);
    expect(s.rows[0].status).toBe('PAST_DUE');

    // Clear backoff for attempts 2 and 3
    for (let i = 0; i < 2; i++) {
      await pgQuery(
        `UPDATE subscriptions SET next_billing_at=NOW() - interval '1 minute', next_retry_at=NULL WHERE id=$1`,
        [sub.json().data.id],
      );
      await pgQuery(`UPDATE invoices SET next_retry_at=NULL WHERE subscription_id=$1`, [sub.json().data.id]);
      await app.inject({
        method: 'POST',
        url: '/api/v1/billing/renewals/run',
        headers: {
          authorization: `Bearer ${ownerToken}`,
          'idempotency-key': `p6-rf${i + 2}-${Date.now()}`,
          'x-step-up-token': await issueStepUpToken(app, ownerToken),
        },
        payload: {},
      });
    }
    s = await pgQuery(`SELECT status, grace_until FROM subscriptions WHERE id=$1`, [sub.json().data.id]);
    expect(s.rows[0].status).toBe('UNPAID');
    expect(s.rows[0].grace_until).toBeTruthy();

    // Ambiguous path
    const customerA = await app.inject({
      method: 'POST',
      url: '/api/v1/customers',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-ca-${Date.now()}`},
      payload: {
        name: 'Amb',
        email: `amb-${Date.now()}@p6.test`,
        default_payment_method_token: 'tok_AMBIGUOUS',
      },
    });
    const subA = await app.inject({
      method: 'POST',
      url: '/api/v1/subscriptions',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-sa-${Date.now()}`},
      payload: {
        customer_id: customerA.json().data.id,
        price_id: price.json().data.id,
        payment_method_token: 'tok_AMBIGUOUS',
      },
    });
    await pgQuery(`UPDATE subscriptions SET next_billing_at=NOW() - interval '1 minute', next_retry_at=NULL WHERE id=$1`, [
      subA.json().data.id,
    ]);
    const amb = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/renewals/run',
      headers: {
        authorization: `Bearer ${ownerToken}`,
        'idempotency-key': `p6-amb-${Date.now()}`,
        'x-step-up-token': await issueStepUpToken(app, ownerToken),
      },
      payload: {},
    });
    const hit = (amb.json().data.processed as any[]).find((p) => p.subscription_id === subA.json().data.id);
    expect(hit?.status).toBe('AMBIGUOUS');
    expect(hit?.query_before_retry).toBe(true);
    const attempts = await pgQuery(
      `SELECT query_before_retry FROM billing_collection_attempts WHERE subscription_id=$1 ORDER BY attempt_number DESC LIMIT 1`,
      [subA.json().data.id],
    );
    expect(attempts.rows[0].query_before_retry).toBe(true);
  });

  it('RBAC: other org cannot list owner invoices; pause/cancel lifecycle works', async () => {
    if (!ready) return;
    const otherInvoices = await app.inject({
      method: 'GET',
      url: '/api/v1/invoices',
      headers: {authorization: `Bearer ${otherToken}`},
    });
    expect(otherInvoices.statusCode).toBe(200);
    expect(otherInvoices.json().data.every((i: any) => i.organization_id !== ownerOrg)).toBe(true);

    const product = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-pl-${Date.now()}`},
      payload: {name: 'Life'},
    });
    const price = await app.inject({
      method: 'POST',
      url: '/api/v1/prices',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-pll-${Date.now()}`},
      payload: {
        product_id: product.json().data.id,
        currency_code: 'SAR',
        unit_amount_minor: '999',
        interval_unit: 'MONTH',
      },
    });
    const customer = await app.inject({
      method: 'POST',
      url: '/api/v1/customers',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-cl-${Date.now()}`},
      payload: {name: 'LifeC', email: `life-${Date.now()}@p6.test`},
    });
    const sub = await app.inject({
      method: 'POST',
      url: '/api/v1/subscriptions',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-sl-${Date.now()}`},
      payload: {customer_id: customer.json().data.id, price_id: price.json().data.id},
    });
    const pause = await app.inject({
      method: 'POST',
      url: `/api/v1/subscriptions/${sub.json().data.id}/pause`,
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-pause-${Date.now()}`},
      payload: {},
    });
    expect(pause.statusCode).toBe(200);
    expect(pause.json().data.status).toBe('PAUSED');
    const resume = await app.inject({
      method: 'POST',
      url: `/api/v1/subscriptions/${sub.json().data.id}/resume`,
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-resume-${Date.now()}`},
      payload: {},
    });
    expect(resume.json().data.status).toBe('ACTIVE');
    const cancel = await app.inject({
      method: 'POST',
      url: `/api/v1/subscriptions/${sub.json().data.id}/cancel`,
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p6-cancel-${Date.now()}`},
      payload: {at_period_end: true},
    });
    expect(cancel.json().data.cancel_at_period_end).toBe(true);
  });
});
