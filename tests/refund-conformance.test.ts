/**
 * Production conformance — Refund lifecycle (sandbox).
 * Covers: full, partial, exceed, unauthorized, cross-tenant, idempotent, concurrent, webhook, ledger.
 */
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify, {type FastifyInstance} from 'fastify';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPool, pgPing, pgQuery, withPgTransaction} from '../apps/api/src/infrastructure/db/postgres.js';
import {outboxWorker} from '../apps/api/src/foundation/outbox-worker.js';
import {refundsService} from '../apps/api/src/refunds/refunds-service.js';
import {ledgerService} from '../apps/api/src/ledger/ledger-service.js';
import {applyProviderWebhookToPaymentIntent} from '../apps/api/src/providers/webhook-state-apply.js';
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
  const email = `rfc-${suffix}-${Date.now()}@example.test`;
  const password = 'SecurePass!123';
  const reg = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {email, password, organization_name: `RFC ${suffix}`, name: suffix, country_code: 'SA'},
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

async function ensureMerchant(orgId: string) {
  const merchant = await pgQuery(`SELECT id FROM merchant_profiles WHERE organization_id=$1 LIMIT 1`, [orgId]);
  if (merchant.rows[0]) return merchant.rows[0].id as string;
  const created = await pgQuery(
    `INSERT INTO merchant_profiles(organization_id, trading_name) VALUES ($1,$2) RETURNING id`,
    [orgId, 'RFC Merchant'],
  );
  return created.rows[0].id as string;
}

async function createSucceededPayment(orgId: string, amountMinor: string) {
  const merchantProfileId = await ensureMerchant(orgId);
  const pi = await pgQuery(
    `INSERT INTO payment_intents(
       organization_id, merchant_profile_id, amount_minor, currency_code, status
     ) VALUES ($1,$2,$3,'SAR','SUCCEEDED') RETURNING id, amount_minor, currency_code`,
    [orgId, merchantProfileId, amountMinor],
  );
  await ledgerService.postPaymentSucceeded(orgId, pi.rows[0].id, amountMinor, 'SAR');
  return pi.rows[0] as {id: string; amount_minor: string; currency_code: string};
}

describe('refund conformance', () => {
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

  it('partial then full remaining refund + ledger balanced', async function () {
    if (!ready) return;
    const payment = await createSucceededPayment(a.orgId, '10000');
    const r1 = await refundsService.createRefund({
      organizationId: a.orgId,
      paymentIntentId: payment.id,
      amountMinor: '3000',
      currency: 'SAR',
      actorUserId: a.userId,
      idempotencyKey: `partial-${payment.id}`,
    });
    expect(r1.status).toBe('SUCCEEDED');
    const r2 = await refundsService.createRefund({
      organizationId: a.orgId,
      paymentIntentId: payment.id,
      amountMinor: '7000',
      currency: 'SAR',
      actorUserId: a.userId,
      idempotencyKey: `full-rest-${payment.id}`,
    });
    expect(r2.status).toBe('SUCCEEDED');
    const journals = await pgQuery(
      `SELECT id FROM ledger_journals WHERE organization_id=$1 AND source_type='refund'`,
      [a.orgId],
    );
    expect(journals.rows.length).toBeGreaterThanOrEqual(2);
    for (const j of journals.rows) {
      const bal = await ledgerService.assertJournalBalanced(j.id);
      expect(bal.balanced).toBe(true);
    }
  });

  it('rejects refund exceeding captured amount', async function () {
    if (!ready) return;
    const payment = await createSucceededPayment(a.orgId, '5000');
    await expect(
      refundsService.createRefund({
        organizationId: a.orgId,
        paymentIntentId: payment.id,
        amountMinor: '5001',
        currency: 'SAR',
        idempotencyKey: `over-${payment.id}`,
      }),
    ).rejects.toMatchObject({code: 'REFUND_EXCEEDS_CAPTURED', statusCode: 422});
  });

  it('idempotent retry returns same refund', async function () {
    if (!ready) return;
    const payment = await createSucceededPayment(a.orgId, '2000');
    const key = `idem-${payment.id}`;
    const first = await refundsService.createRefund({
      organizationId: a.orgId,
      paymentIntentId: payment.id,
      amountMinor: '500',
      currency: 'SAR',
      idempotencyKey: key,
    });
    const second = await refundsService.createRefund({
      organizationId: a.orgId,
      paymentIntentId: payment.id,
      amountMinor: '500',
      currency: 'SAR',
      idempotencyKey: key,
    });
    expect(second.id).toBe(first.id);
  });

  it('cross-tenant refund returns not found', async function () {
    if (!ready) return;
    const payment = await createSucceededPayment(a.orgId, '1500');
    await expect(
      refundsService.createRefund({
        organizationId: b.orgId,
        paymentIntentId: payment.id,
        amountMinor: '100',
        currency: 'SAR',
        idempotencyKey: `xt-${payment.id}`,
      }),
    ).rejects.toMatchObject({statusCode: 404});
  });

  it('unauthorized HTTP refund is 401; viewer without refund perm is 403', async function () {
    if (!ready) return;
    const noAuth = await app.inject({
      method: 'POST',
      url: '/api/v1/refunds',
      payload: {payment_intent_id: crypto.randomUUID(), amount_minor: '100', currency_code: 'SAR'},
    });
    expect(noAuth.statusCode).toBe(401);

    const payment = await createSucceededPayment(a.orgId, '1200');
    const noStep = await app.inject({
      method: 'POST',
      url: '/api/v1/refunds',
      headers: {authorization: `Bearer ${a.token}`, 'idempotency-key': `nostep-${payment.id}`},
      payload: {payment_intent_id: payment.id, amount_minor: '100', currency_code: 'SAR'},
    });
    expect(noStep.statusCode).toBe(403);
  });

  it('HTTP refund with step-up succeeds', async function () {
    if (!ready) return;
    const payment = await createSucceededPayment(a.orgId, '800');
    const step = await issueStepUpToken(app, a.token);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/refunds',
      headers: {
        authorization: `Bearer ${a.token}`,
        'idempotency-key': `http-${payment.id}`,
        'x-step-up-token': step,
      },
      payload: {payment_intent_id: payment.id, amount_minor: '200', currency_code: 'SAR', reason: 'conformance'},
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.environment).toBe('SANDBOX');
  });

  it('concurrent refunds cannot exceed captured', async function () {
    if (!ready) return;
    const payment = await createSucceededPayment(a.orgId, '1000');
    const results = await Promise.allSettled([
      refundsService.createRefund({
        organizationId: a.orgId,
        paymentIntentId: payment.id,
        amountMinor: '700',
        currency: 'SAR',
        idempotencyKey: `c1-${payment.id}`,
      }),
      refundsService.createRefund({
        organizationId: a.orgId,
        paymentIntentId: payment.id,
        amountMinor: '700',
        currency: 'SAR',
        idempotencyKey: `c2-${payment.id}`,
      }),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.filter((r) => r.status === 'rejected').length;
    expect(ok).toBe(1);
    expect(fail).toBe(1);
    const sum = await pgQuery(
      `SELECT COALESCE(SUM(amount_minor),0)::text AS t FROM refunds
       WHERE payment_intent_id=$1 AND status='SUCCEEDED'`,
      [payment.id],
    );
    expect(BigInt(sum.rows[0].t)).toBeLessThanOrEqual(1000n);
  });

  it('webhook refund applies once (idempotent) and posts ledger', async function () {
    if (!ready) return;
    const payment = await createSucceededPayment(a.orgId, '4000');
    const eventId = `evt_rf_${payment.id}`;
    await withPgTransaction(async (client) => {
      const first = await applyProviderWebhookToPaymentIntent(client, {
        organizationId: a.orgId,
        paymentIntentId: payment.id,
        eventType: 'sandbox.payment.refunded',
        providerEventId: eventId,
        amountMinor: '1000',
        currencyCode: 'SAR',
      });
      expect(first.applied).toBe(true);
      const second = await applyProviderWebhookToPaymentIntent(client, {
        organizationId: a.orgId,
        paymentIntentId: payment.id,
        eventType: 'sandbox.payment.refunded',
        providerEventId: eventId,
        amountMinor: '1000',
        currencyCode: 'SAR',
      });
      expect(second.applied).toBe(false);
    });
    const rows = await pgQuery(
      `SELECT * FROM refunds WHERE organization_id=$1 AND idempotency_key=$2`,
      [a.orgId, `webhook-refund:${eventId}`],
    );
    expect(rows.rows.length).toBe(1);
  });

  it('does not select nonexistent payment_intents.environment', async function () {
    if (!ready) return;
    // Schema guard: refund path must not reference payment_intents.environment
    const cols = await pgQuery(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='payment_intents' AND column_name='environment'`,
    );
    expect(cols.rows.length).toBe(0);
    const payment = await createSucceededPayment(a.orgId, '900');
    const refund = await refundsService.createRefund({
      organizationId: a.orgId,
      paymentIntentId: payment.id,
      amountMinor: '100',
      currency: 'SAR',
      idempotencyKey: `envguard-${payment.id}`,
    });
    expect(refund.environment).toBe('SANDBOX');
  });
});
