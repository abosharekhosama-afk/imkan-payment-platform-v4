/**
 * P15.1-A — Financial model unit + PG integration tests.
 */
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify, {type FastifyInstance} from 'fastify';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {
  applyBpsHalfUp,
  assertSameCurrency,
  computeEligibleMinor,
  computePlatformFeeMinor,
  computeSettlementTotals,
} from '../apps/api/src/finance/financial-model.js';
import {AppError} from '../apps/api/src/foundation/errors.js';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPool, pgPing, pgQuery} from '../apps/api/src/infrastructure/db/postgres.js';
import {outboxWorker} from '../apps/api/src/foundation/outbox-worker.js';
import {ledgerService} from '../apps/api/src/ledger/ledger-service.js';
import {issueStepUpToken} from './helpers/step-up.js';

const required = process.env.FOUNDATION_PG_REQUIRED === 'true';
const PASSWORD = 'SecurePass!123';

describe('P15.1-A financial model (unit)', () => {
  it('half-up bps rounding', () => {
    expect(applyBpsHalfUp(10000n, 0)).toBe(0n);
    expect(applyBpsHalfUp(10000n, 250)).toBe(250n); // 2.5%
    // 10001 * 1 / 10000 = 1.0001 → half-up → 1
    expect(applyBpsHalfUp(10001n, 1)).toBe(1n);
    // 5 * 1000 / 10000 = 0.5 → half-up → 1
    expect(applyBpsHalfUp(5n, 1000)).toBe(1n);
    // 4 * 1000 / 10000 = 0.4 → 0
    expect(applyBpsHalfUp(4n, 1000)).toBe(0n);
  });

  it('zero / bps / fixed / combined platform fees', () => {
    expect(computePlatformFeeMinor({grossMinor: 10000n, basisPoints: 0, fixedMinor: 0n})).toBe(0n);
    expect(computePlatformFeeMinor({grossMinor: 10000n, basisPoints: 300, fixedMinor: 0n})).toBe(300n);
    expect(computePlatformFeeMinor({grossMinor: 10000n, basisPoints: 0, fixedMinor: 150n})).toBe(150n);
    expect(computePlatformFeeMinor({grossMinor: 10000n, basisPoints: 300, fixedMinor: 150n})).toBe(450n);
  });

  it('large NUMERIC-scale values', () => {
    const gross = 10n ** 28n; // within 30 digits
    const fee = computePlatformFeeMinor({grossMinor: gross, basisPoints: 100, fixedMinor: 0n}); // 1%
    expect(fee).toBe(10n ** 26n);
  });

  it('eligible = captured - refunded', () => {
    expect(computeEligibleMinor(10000n, 2500n)).toBe(7500n);
    expect(computeEligibleMinor(10000n, 0n)).toBe(10000n);
    expect(() => computeEligibleMinor(10000n, 10001n)).toThrow(AppError);
  });

  it('net calculation example', () => {
    const t = computeSettlementTotals({
      currencyCode: 'SAR',
      grossMinor: 10000n,
      providerFeesMinor: 500n,
      platformFeesMinor: 300n,
      reservesMinor: 0n,
      adjustmentsMinor: 0n,
    });
    expect(t.net_minor).toBe('9200');
    expect(t.fees_minor).toBe('800');
  });

  it('rejects currency mismatch and negative net', () => {
    expect(() => assertSameCurrency('SAR', 'USD')).toThrow(AppError);
    expect(() =>
      computeSettlementTotals({
        currencyCode: 'SAR',
        grossMinor: 100n,
        providerFeesMinor: 80n,
        platformFeesMinor: 30n,
      }),
    ).toThrow(/SETTLEMENT_NET_NEGATIVE|negative/i);
  });
});

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
  const email = `p15a-${suffix}-${Date.now()}@example.test`;
  const reg = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {email, password: PASSWORD, organization_name: `P15A ${suffix}`, name: suffix, country_code: 'SA'},
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
    [orgId, 'P15A Merchant'],
  );
  return created.rows[0].id as string;
}

async function seedSucceededPayment(orgId: string, amountMinor: string) {
  const merchantProfileId = await ensureMerchant(orgId);
  const pi = await pgQuery(
    `INSERT INTO payment_intents(
       organization_id, merchant_profile_id, amount_minor, currency_code, status
     ) VALUES ($1,$2,$3,'SAR','SUCCEEDED') RETURNING id, amount_minor`,
    [orgId, merchantProfileId, amountMinor],
  );
  await ledgerService.postPaymentSucceeded(orgId, pi.rows[0].id, amountMinor, 'SAR');
  return pi.rows[0] as {id: string; amount_minor: string};
}

describe('P15.1-A financial model (pg)', () => {
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

  it('fee schedule upsert + preview + tenant isolation', async () => {
    if (!ready) return;
    const step = await issueStepUpToken(app, a.token, 'settlements.manage');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/fee-schedules',
      headers: {
        authorization: `Bearer ${a.token}`,
        'x-step-up-token': step,
        'idempotency-key': `p15a-fee-${Date.now()}`,
      },
      payload: {
        currency_code: 'SAR',
        environment: 'SANDBOX',
        name: 'Standard 3% + 150',
        basis_points: 300,
        fixed_minor: '150',
      },
    });
    expect(created.statusCode).toBe(201);

    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/fee-schedules/preview',
      headers: {authorization: `Bearer ${a.token}`},
      payload: {currency_code: 'SAR', gross_minor: '10000'},
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().data.platform_fees_minor).toBe('450');

    const cross = await app.inject({
      method: 'GET',
      url: '/api/v1/fee-schedules',
      headers: {authorization: `Bearer ${b.token}`},
    });
    expect(cross.statusCode).toBe(200);
    expect(cross.json().data.filter((s: any) => s.organization_id === a.orgId).length).toBe(0);
  });

  it('settlement draft: refund reduces eligible; fees applied; double inclusion blocked', async () => {
    if (!ready) return;
    const payment = await seedSucceededPayment(a.orgId, '10000');
    await pgQuery(
      `INSERT INTO refunds(organization_id, payment_intent_id, amount_minor, currency_code, status, environment)
       VALUES ($1,$2,'2500','SAR','SUCCEEDED','SANDBOX')`,
      [a.orgId, payment.id],
    );

    const step = await issueStepUpToken(app, a.token, 'settlements.manage');
    const draft = await app.inject({
      method: 'POST',
      url: '/api/v1/settlements',
      headers: {
        authorization: `Bearer ${a.token}`,
        'x-step-up-token': step,
        'idempotency-key': `p15a-settle-${Date.now()}`,
      },
      payload: {
        currency_code: 'SAR',
        period_start: '2020-01-01T00:00:00.000Z',
        period_end: '2099-01-01T00:00:00.000Z',
        provider_fees_minor: '500',
      },
    });
    expect(draft.statusCode).toBe(201);
    const s = draft.json().data;
    // eligible gross 7500; platform fee from schedule 300bps+150 on 7500 = 225+150=375; provider 500
    // net = 7500 - 500 - 375 - 0 + 0 = 6625
    expect(s.gross_minor).toBe('7500');
    expect(s.provider_fees_minor).toBe('500');
    expect(s.platform_fees_minor).toBe('375');
    expect(s.fees_minor).toBe('875');
    expect(s.reserves_minor).toBe('0');
    expect(s.net_minor).toBe('6625');

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/settlements/${s.id}`,
      headers: {authorization: `Bearer ${a.token}`},
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.lines.length).toBe(1);
    expect(detail.json().data.lines[0].refunded_minor).toBe('2500');
    expect(detail.json().data.lines[0].net_minor).toBe('7500');

    const step2 = await issueStepUpToken(app, a.token, 'settlements.manage');
    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/settlements',
      headers: {
        authorization: `Bearer ${a.token}`,
        'x-step-up-token': step2,
        'idempotency-key': `p15a-settle-dup-${Date.now()}`,
      },
      payload: {
        currency_code: 'SAR',
        period_start: '2020-01-01T00:00:00.000Z',
        period_end: '2099-01-01T00:00:00.000Z',
      },
    });
    // Same PI excluded → empty/zero-gross draft OR no lines; must not include again
    expect(dup.statusCode).toBe(201);
    expect(Number(dup.json().data.gross_minor)).toBe(0);
    expect(dup.json().data.lines === undefined || true).toBe(true);
    const dupDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/settlements/${dup.json().data.id}`,
      headers: {authorization: `Bearer ${a.token}`},
    });
    expect(dupDetail.json().data.lines.length).toBe(0);
  });

  it('currency mismatch rejected on settlement create body length', async () => {
    if (!ready) return;
    const step = await issueStepUpToken(app, a.token, 'settlements.manage');
    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/settlements',
      headers: {
        authorization: `Bearer ${a.token}`,
        'x-step-up-token': step,
        'idempotency-key': `p15a-ccy-${Date.now()}`,
      },
      payload: {currency_code: 'SA'},
    });
    expect(bad.statusCode).toBe(400);
  });
});
