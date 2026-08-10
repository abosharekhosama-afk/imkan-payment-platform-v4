/**
 * P15.1-C — Balance derivation unit + PG integration.
 */
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify, {type FastifyInstance} from 'fastify';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {
  buildCurrencyBalance,
  deriveAvailableFromPayableNet,
  derivePendingFromPendingSettlementNet,
  floorNonNegativeMinor,
  pickPrimaryCurrency,
} from '../apps/api/src/finance/balances.js';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPool, pgPing, pgQuery} from '../apps/api/src/infrastructure/db/postgres.js';
import {outboxWorker} from '../apps/api/src/foundation/outbox-worker.js';
import {ledgerService} from '../apps/api/src/ledger/ledger-service.js';

const required = process.env.FOUNDATION_PG_REQUIRED === 'true';
const PASSWORD = 'SecurePass!123';

describe('P15.1-C balances (unit)', () => {
  it('floors negatives and derives pending/available', () => {
    expect(floorNonNegativeMinor(-5n)).toBe('0');
    expect(derivePendingFromPendingSettlementNet(10000n)).toBe('10000');
    expect(derivePendingFromPendingSettlementNet(-1n)).toBe('0');
    expect(deriveAvailableFromPayableNet(-10000n)).toBe('10000'); // credit-heavy payable
    expect(deriveAvailableFromPayableNet(500n)).toBe('0');
  });

  it('picks primary currency by preference then activity', () => {
    expect(pickPrimaryCurrency(['USD', 'SAR'], 'USD')).toBe('USD');
    expect(pickPrimaryCurrency(['USD', 'EUR'], null, {USD: 10n, EUR: 100n})).toBe('EUR');
    expect(pickPrimaryCurrency(['USD', 'SAR'], null, {USD: 0n, SAR: 0n})).toBe('SAR');
  });

  it('buildCurrencyBalance bundles buckets', () => {
    const row = buildCurrencyBalance({
      currencyCode: 'SAR',
      pendingSettlementNet: 10000n,
      merchantPayableNet: -9200n,
      finalizedGrossMinor: 10000n,
      reservedMinor: 0n,
      settledMinor: 800n,
    });
    expect(row).toEqual({
      currency_code: 'SAR',
      pending_minor: '0',
      available_minor: '9200',
      reserved_minor: '0',
      settled_minor: '800',
    });
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
  const email = `p15c-${suffix}-${Date.now()}@example.test`;
  const reg = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email,
      password: PASSWORD,
      organization_name: `P15C ${suffix}`,
      name: suffix,
      country_code: 'SA',
    },
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
  return {orgId: reg.json().data.organization_id as string, token: login.json().data.access_token as string};
}

async function insertSucceededPi(orgId: string, amountMinor: string) {
  const existing = await pgQuery(
    `SELECT id FROM merchant_profiles WHERE organization_id=$1 LIMIT 1`,
    [orgId],
  );
  let merchantProfileId = existing.rows[0]?.id as string | undefined;
  if (!merchantProfileId) {
    const created = await pgQuery(
      `INSERT INTO merchant_profiles(organization_id, trading_name) VALUES ($1,$2) RETURNING id`,
      [orgId, 'P15C Merchant'],
    );
    merchantProfileId = created.rows[0].id as string;
  }
  const pi = await pgQuery(
    `INSERT INTO payment_intents(
       organization_id, merchant_profile_id, amount_minor, currency_code, status
     ) VALUES ($1,$2,$3,'SAR','SUCCEEDED') RETURNING id`,
    [orgId, merchantProfileId, amountMinor],
  );
  return pi.rows[0].id as string;
}

describe('P15.1-C balances (pg)', () => {
  let app: FastifyInstance;
  let ready = false;
  let owner: {orgId: string; token: string};
  let other: {orgId: string; token: string};

  beforeAll(async () => {
    ready = await pgPing();
    if (!ready) {
      if (required) throw new Error('PostgreSQL required');
      return;
    }
    await ensureMigrations();
    outboxWorker.start();
    app = Fastify({logger: false});
    await app.register(apiV1Routes, {prefix: '/api/v1'});
    await app.ready();
    owner = await registerOwner(app, 'owner');
    other = await registerOwner(app, 'other');
  }, 120_000);

  afterAll(async () => {
    outboxWorker.stop();
    if (app) await app.close();
    await pgPool.end().catch(() => undefined);
  });

  it('payment → pending/available; payout → settled; fees reduce available; reserved=0', async () => {
    if (!ready) return;
    const piId = await insertSucceededPi(owner.orgId, '10000');
    await ledgerService.postPaymentSucceeded(owner.orgId, piId, '10000', 'SAR');

    let bal = await ledgerService.getBalances(owner.orgId);
    expect(bal.source).toBe('financial_core');
    expect(bal.phase).toBe('P15.1-D');
    expect(bal.pending_minor).toBe('10000');
    expect(bal.available_minor).toBe('10000');
    expect(bal.reserved_minor).toBe('0');
    expect(bal.settled_minor).toBe('0');
    expect(bal.formulas).toBeTruthy();
    expect(bal.semantics).toBeTruthy();

    await ledgerService.postSettlementFinalizeFees(owner.orgId, randomUUID(), {
      platformFeesMinor: '300',
      providerFeesMinor: '200',
      currencyCode: 'SAR',
    });
    bal = await ledgerService.getBalances(owner.orgId);
    expect(bal.available_minor).toBe('9500'); // 10000 - 500 fees
    expect(bal.pending_minor).toBe('10000'); // pending uncleared until D
    expect(bal.settled_minor).toBe('0');
    expect(bal.reserved_minor).toBe('0');

    const payoutId = randomUUID();
    await ledgerService.postPayoutPaid(owner.orgId, payoutId, '4000', 'SAR');
    bal = await ledgerService.getBalances(owner.orgId);
    expect(bal.settled_minor).toBe('4000');
    expect(bal.available_minor).toBe('5500'); // 9500 - 4000
    expect(bal.currencies.some((c) => c.currency_code === 'SAR' && c.settled_minor === '4000')).toBe(
      true,
    );

    // Idempotent payout does not double settled
    await ledgerService.postPayoutPaid(owner.orgId, payoutId, '4000', 'SAR');
    bal = await ledgerService.getBalances(owner.orgId);
    expect(bal.settled_minor).toBe('4000');
  });

  it('API contract + tenant isolation', async () => {
    if (!ready) return;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/balances?environment=SANDBOX&currency_code=SAR',
      headers: {authorization: `Bearer ${owner.token}`},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.phase).toBe('P15.1-D');
    expect(body.source).toBe('financial_core');
    expect(body.currency_code).toBe('SAR');
    expect(body.formulas.settled).toMatch(/payout/i);
    expect(Array.isArray(body.currencies)).toBe(true);

    const otherRes = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: {authorization: `Bearer ${other.token}`},
    });
    expect(otherRes.statusCode).toBe(200);
    const otherBody = otherRes.json().data;
    // Other org must not inherit owner settled balance
    expect(otherBody.settled_minor).toBe('0');
    expect(BigInt(otherBody.available_minor)).toBe(0n);
  });
});
