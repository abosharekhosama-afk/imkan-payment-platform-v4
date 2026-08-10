/**
 * P15.0 — Security / tenant isolation / step-up / onboarding gate / URL safety.
 * Negative tests are mandatory: Viewer cannot mutate; Org A cannot read Org B.
 */
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify, {type FastifyInstance} from 'fastify';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {apiV1Routes} from '../../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPool, pgPing, pgQuery} from '../../apps/api/src/infrastructure/db/postgres.js';
import {outboxWorker} from '../../apps/api/src/foundation/outbox-worker.js';
import {assertSafePublicUrl} from '../../apps/api/src/security/url-safety.js';
import {
  assertMerchantPaymentsAllowed,
  getOnboardingGateState,
  setRequireKybForPaymentsOverride,
} from '../../apps/api/src/security/onboarding-gate.js';
import {applyProviderWebhookToPaymentIntent} from '../../apps/api/src/providers/webhook-state-apply.js';
import {ledgerService} from '../../apps/api/src/ledger/ledger-service.js';
import {withPgTransaction} from '../../apps/api/src/infrastructure/db/postgres.js';
import {issueStepUpToken} from '../helpers/step-up.js';
import {AppError} from '../../apps/api/src/foundation/errors.js';

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

async function registerOwner(app: FastifyInstance, suffix: string) {
  const email = `p15-${suffix}-${Date.now()}@example.test`;
  const reg = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {email, password: PASSWORD, organization_name: `P15 ${suffix}`, name: suffix, country_code: 'SA'},
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
    payload: {email, password: PASSWORD},
  });
  expect(login.statusCode).toBe(200);
  return {email, orgId, userId, token: login.json().data.access_token as string};
}

async function ensureMerchant(orgId: string) {
  const merchant = await pgQuery(`SELECT id FROM merchant_profiles WHERE organization_id=$1 LIMIT 1`, [orgId]);
  if (merchant.rows[0]) return merchant.rows[0].id as string;
  const created = await pgQuery(
    `INSERT INTO merchant_profiles(organization_id, trading_name) VALUES ($1,$2) RETURNING id`,
    [orgId, 'P15 Merchant'],
  );
  return created.rows[0].id as string;
}

async function seedSucceededPayment(orgId: string, amountMinor = '5000') {
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

describe('P15.0 security matrix', () => {
  const app = Fastify({logger: false});
  let ready = false;
  let a: Awaited<ReturnType<typeof registerOwner>>;
  let b: Awaited<ReturnType<typeof registerOwner>>;
  let paymentA: {id: string; amount_minor: string; currency_code: string};

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
    paymentA = await seedSucceededPayment(a.orgId);
  }, 180_000);

  afterAll(async () => {
    setRequireKybForPaymentsOverride(null);
    outboxWorker.stop();
    await app.close().catch(() => undefined);
    await pgPool.end().catch(() => undefined);
  });

  it('unauthenticated sensitive routes → 401', async () => {
    if (!ready) return;
    const paths = [
      {method: 'GET', url: '/api/v1/merchant/payments'},
      {method: 'GET', url: `/api/v1/merchant/payments/${paymentA.id}`},
      {method: 'POST', url: '/api/v1/merchant/payment-links'},
      {method: 'GET', url: '/api/v1/merchant/onboarding-gate'},
    ] as const;
    for (const p of paths) {
      const res = await app.inject({method: p.method, url: p.url, payload: p.method === 'POST' ? {} : undefined});
      expect(res.statusCode, p.url).toBe(401);
    }
  });

  it('invalid / expired session → 401', async () => {
    if (!ready) return;
    const bad = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/onboarding-gate',
      headers: {authorization: 'Bearer totally-invalid-session-token'},
    });
    expect(bad.statusCode).toBe(401);
  });

  it('URL safety rejects localhost / private networks', () => {
    expect(() => assertSafePublicUrl('http://127.0.0.1/ok', 'success_url')).toThrow(AppError);
    expect(() => assertSafePublicUrl('http://localhost/ok', 'success_url')).toThrow(AppError);
    expect(() => assertSafePublicUrl('http://192.168.1.10/ok', 'success_url')).toThrow(AppError);
    expect(() => assertSafePublicUrl('http://10.0.0.5/ok', 'success_url')).toThrow(AppError);
    expect(() => assertSafePublicUrl('https://169.254.169.254/latest', 'success_url')).toThrow(AppError);
    expect(assertSafePublicUrl('https://merchant.example.com/success', 'success_url')).toContain('https://');
    expect(assertSafePublicUrl(null)).toBeNull();
  });

  it('onboarding: frontend skip ≠ backend bypass', async () => {
    if (!ready) return;
    setRequireKybForPaymentsOverride(true);
    try {
      await expect(assertMerchantPaymentsAllowed(a.orgId)).rejects.toMatchObject({
        code: 'ONBOARDING_INCOMPLETE',
        statusCode: 403,
      });
      const gate = await getOnboardingGateState(a.orgId);
      expect(gate.payments_allowed).toBe(false);
      expect(gate.require_kyb_for_payments).toBe(true);

      const create = await app.inject({
        method: 'POST',
        url: '/api/v1/merchant/payment-links',
        headers: {authorization: `Bearer ${a.token}`, 'idempotency-key': `p15-onboard-${Date.now()}`},
        payload: {
          title: 'blocked',
          amount_mode: 'FIXED',
          amount_minor: '100',
          currency_code: 'SAR',
          success_url: 'https://example.test/ok',
        },
      });
      expect(create.statusCode).toBe(403);
      expect(create.json()?.error?.code).toBe('ONBOARDING_INCOMPLETE');

      await pgQuery(
        `INSERT INTO verification_cases (organization_id, case_type, status)
         VALUES ($1,'KYB','SUBMITTED')
         ON CONFLICT DO NOTHING`,
        [a.orgId],
      ).catch(() => undefined);
      await pgQuery(
        `UPDATE verification_cases SET status='SUBMITTED', updated_at=NOW()
         WHERE organization_id=$1 AND case_type='KYB' AND status <> 'REJECTED'`,
        [a.orgId],
      );
      const kyb = await pgQuery(
        `SELECT status FROM verification_cases WHERE organization_id=$1 AND case_type='KYB' ORDER BY created_at DESC LIMIT 1`,
        [a.orgId],
      );
      if (!kyb.rows[0]) {
        await pgQuery(`INSERT INTO verification_cases (organization_id, case_type, status) VALUES ($1,'KYB','SUBMITTED')`, [
          a.orgId,
        ]);
      } else if (!['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(kyb.rows[0].status)) {
        await pgQuery(
          `UPDATE verification_cases SET status='SUBMITTED', updated_at=NOW() WHERE organization_id=$1 AND case_type='KYB'`,
          [a.orgId],
        );
      }

      await expect(assertMerchantPaymentsAllowed(a.orgId)).resolves.toBeUndefined();
      const gate2 = await getOnboardingGateState(a.orgId);
      expect(gate2.payments_allowed).toBe(true);
    } finally {
      setRequireKybForPaymentsOverride(null);
    }
  });

  it('GET onboarding-gate returns persisted backend state', async () => {
    if (!ready) return;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/onboarding-gate',
      headers: {authorization: `Bearer ${a.token}`},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveProperty('kyb_status');
    expect(res.json().data).toHaveProperty('payments_allowed');
    expect(res.json().data).toHaveProperty('require_kyb_for_payments');
  });

  it('cross-tenant: Org B cannot read Org A payment (IDOR)', async () => {
    if (!ready) return;
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/merchant/payments/${paymentA.id}`,
      headers: {authorization: `Bearer ${b.token}`},
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it('cross-tenant: Org B cannot refund Org A payment', async () => {
    if (!ready) return;
    const step = await issueStepUpToken(app, b.token, 'payments.refund');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/refunds`,
      headers: {
        authorization: `Bearer ${b.token}`,
        'x-step-up-token': step,
        'idempotency-key': `p15-xrefund-${Date.now()}`,
      },
      payload: {payment_intent_id: paymentA.id, amount_minor: '100', currency_code: 'SAR', reason: 'idor'},
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it('viewer cannot create payment links or refund', async () => {
    if (!ready) return;
    await pgQuery(
      `UPDATE user_roles
       SET role_id = (SELECT id FROM roles WHERE code='MERCHANT_VIEWER' AND organization_id IS NULL)
       WHERE user_id=$1 AND organization_id=$2`,
      [a.userId, a.orgId],
    );
    // refresh session by re-login
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {email: a.email, password: PASSWORD},
    });
    expect(login.statusCode).toBe(200);
    const viewerToken = login.json().data.access_token as string;

    const link = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/payment-links',
      headers: {authorization: `Bearer ${viewerToken}`, 'idempotency-key': `p15-view-link-${Date.now()}`},
      payload: {title: 'x', amount_mode: 'FIXED', amount_minor: '100', currency_code: 'SAR'},
    });
    expect(link.statusCode).toBe(403);

    const refund = await app.inject({
      method: 'POST',
      url: `/api/v1/refunds`,
      headers: {
        authorization: `Bearer ${viewerToken}`,
        'idempotency-key': `p15-view-refund-${Date.now()}`,
      },
      payload: {payment_intent_id: paymentA.id, amount_minor: '100', currency_code: 'SAR'},
    });
    expect([401, 403]).toContain(refund.statusCode);

    // restore owner for later tests + refresh session permissions
    await pgQuery(
      `UPDATE user_roles
       SET role_id = (SELECT id FROM roles WHERE code='MERCHANT_OWNER' AND organization_id IS NULL)
       WHERE user_id=$1 AND organization_id=$2`,
      [a.userId, a.orgId],
    );
    const restore = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {email: a.email, password: PASSWORD},
    });
    expect(restore.statusCode).toBe(200);
    a.token = restore.json().data.access_token as string;
  });

  it('step-up purpose mismatch fails; matching purpose passes settlement create', async () => {
    if (!ready) return;
    const wrong = await issueStepUpToken(app, a.token, 'payments.refund');
    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/settlements',
      headers: {
        authorization: `Bearer ${a.token}`,
        'x-step-up-token': wrong,
        'idempotency-key': `p15-settle-bad-${Date.now()}`,
      },
      payload: {
        currency_code: 'SAR',
        period_start: '2026-01-01T00:00:00.000Z',
        period_end: '2026-01-31T23:59:59.000Z',
      },
    });
    expect([401, 403]).toContain(bad.statusCode);

    const right = await issueStepUpToken(app, a.token, 'settlements.manage');
    const okSettle = await app.inject({
      method: 'POST',
      url: '/api/v1/settlements',
      headers: {
        authorization: `Bearer ${a.token}`,
        'x-step-up-token': right,
        'idempotency-key': `p15-settle-ok-${Date.now()}`,
      },
      payload: {
        currency_code: 'SAR',
        period_start: '2026-01-01T00:00:00.000Z',
        period_end: '2026-01-31T23:59:59.000Z',
      },
    });
    // May be 200/201 or domain 4xx if settlement prerequisites missing — must not be purpose mismatch
    expect(okSettle.json()?.error?.code).not.toBe('STEP_UP_PURPOSE_MISMATCH');
    expect(okSettle.statusCode).not.toBe(401);
  });

  it('webhook apply ignores forged organization and scopes by PI org', async () => {
    if (!ready) return;
    const paymentB = await seedSucceededPayment(b.orgId, '2500');
    const result = await withPgTransaction(async (client) =>
      applyProviderWebhookToPaymentIntent(client, {
        // Attacker claims org A while targeting org B payment
        organizationId: a.orgId,
        paymentIntentId: paymentB.id,
        eventType: 'payment.succeeded',
        providerEventId: `p15-forge-${Date.now()}`,
      }),
    );
    // Org mismatch on WHERE organization_id=$2 → payment_not_found (no cross-tenant mutate)
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('payment_not_found');
  });

  it('ledger journals/entries are immutable at DB layer', async () => {
    if (!ready) return;
    const j = await pgQuery(`SELECT id, memo FROM ledger_journals WHERE organization_id=$1 LIMIT 1`, [a.orgId]);
    if (!j.rows[0]) return;
    await expect(
      pgQuery(`UPDATE ledger_journals SET memo='tamper' WHERE id=$1`, [j.rows[0].id]),
    ).rejects.toThrow(/immutable/i);
    const e = await pgQuery(`SELECT id FROM ledger_entries WHERE organization_id=$1 LIMIT 1`, [a.orgId]);
    if (!e.rows[0]) return;
    await expect(pgQuery(`DELETE FROM ledger_entries WHERE id=$1`, [e.rows[0].id])).rejects.toThrow(/immutable/i);
  });

  it('payment-link create rejects unsafe success_url', async () => {
    if (!ready) return;
    setRequireKybForPaymentsOverride(false);
    await pgQuery(
      `UPDATE verification_cases SET status='SUBMITTED', updated_at=NOW()
       WHERE organization_id=$1 AND case_type='KYB'`,
      [a.orgId],
    );
    // Reuse existing session token (MFA may be enabled — avoid password login without TOTP).
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/payment-links',
      headers: {authorization: `Bearer ${a.token}`, 'idempotency-key': `p15-ssrf-${Date.now()}`},
      payload: {
        title: 'ssrf',
        amount_mode: 'FIXED',
        amount_minor: '100',
        currency_code: 'SAR',
        success_url: 'http://127.0.0.1/steal',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()?.error?.code).toBe('UNSAFE_URL');
  });
});
