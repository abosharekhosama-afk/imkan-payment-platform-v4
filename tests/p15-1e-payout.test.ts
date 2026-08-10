/**
 * P15.1-E — Payout sandbox lifecycle.
 */
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify, {type FastifyInstance} from 'fastify';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPool, pgPing, pgQuery} from '../apps/api/src/infrastructure/db/postgres.js';
import {outboxWorker} from '../apps/api/src/foundation/outbox-worker.js';
import {ledgerService, LEDGER_SOURCE_TYPES} from '../apps/api/src/ledger/ledger-service.js';
import {issueStepUpToken} from './helpers/step-up.js';

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
  const email = `p15e-${suffix}-${Date.now()}@example.test`;
  const reg = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email,
      password: PASSWORD,
      organization_name: `P15E ${suffix}`,
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

async function ensureVerifiedPayoutAccount(orgId: string) {
  const existing = await pgQuery(
    `SELECT id FROM payout_accounts
     WHERE organization_id=$1 AND status IN ('VERIFIED','ACTIVE') LIMIT 1`,
    [orgId],
  );
  if (existing.rows[0]) return existing.rows[0].id as string;

  const method = await pgQuery(`SELECT id FROM master_payout_methods LIMIT 1`);
  const country = await pgQuery(`SELECT id FROM master_countries WHERE code='SA' LIMIT 1`);
  const fp = randomBytes(32).toString('hex');
  const ins = await pgQuery(
    `INSERT INTO payout_accounts(
       organization_id, payout_method_id, currency_code, country_id, bank_name,
       account_holder_name, account_type, account_number_encrypted, account_last4,
       account_fingerprint, status
     ) VALUES ($1,$2,'SAR',$3,'Test Bank','Holder','IBAN','v1$test','1234',$4,'VERIFIED')
     RETURNING id`,
    [orgId, method.rows[0].id, country.rows[0].id, fp],
  );
  return ins.rows[0].id as string;
}

async function seedPayment(orgId: string, amountMinor: string) {
  const mp = await pgQuery(
    `INSERT INTO merchant_profiles(organization_id, trading_name)
     VALUES ($1,$2)
     ON CONFLICT (organization_id) DO UPDATE SET trading_name=EXCLUDED.trading_name
     RETURNING id`,
    [orgId, 'P15E Merchant'],
  );
  const pi = await pgQuery(
    `INSERT INTO payment_intents(
       organization_id, merchant_profile_id, amount_minor, currency_code, status
     ) VALUES ($1,$2,$3,'SAR','SUCCEEDED') RETURNING id`,
    [orgId, mp.rows[0].id, amountMinor],
  );
  await ledgerService.postPaymentSucceeded(orgId, pi.rows[0].id, amountMinor, 'SAR');
}

async function finalizeSettlement(app: FastifyInstance, token: string, settlementId: string) {
  const step = await issueStepUpToken(app, token, 'settlements.finalize');
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/settlements/${settlementId}/finalize`,
    headers: {
      authorization: `Bearer ${token}`,
      'idempotency-key': `fin-${settlementId}`,
      'x-step-up-token': step,
    },
  });
  expect(res.statusCode).toBe(200);
}

describe('P15.1-E payout lifecycle', () => {
  let app: FastifyInstance;
  let ready = false;
  let owner: {orgId: string; token: string};
  let payoutAccountId: string;

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
    payoutAccountId = await ensureVerifiedPayoutAccount(owner.orgId);
  }, 120_000);

  afterAll(async () => {
    outboxWorker.stop();
    if (app) await app.close();
    await pgPool.end().catch(() => undefined);
  });

  it('full sandbox flow: create → submit → mark-paid → ledger settled', async () => {
    if (!ready) return;
    await seedPayment(owner.orgId, '10000');

    const stepSettle = await issueStepUpToken(app, owner.token, 'settlements.manage');
    const draft = await app.inject({
      method: 'POST',
      url: '/api/v1/settlements',
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `settle-${Date.now()}`,
        'x-step-up-token': stepSettle,
      },
      payload: {currency_code: 'SAR', provider_fees_minor: '500'},
    });
    expect(draft.statusCode).toBe(201);
    const settlementId = draft.json().data.id as string;
    await finalizeSettlement(app, owner.token, settlementId);

    const stepCreate = await issueStepUpToken(app, owner.token, 'payouts.manage');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/payouts',
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `payout-create-${Date.now()}`,
        'x-step-up-token': stepCreate,
      },
      payload: {
        settlement_id: settlementId,
        payout_account_id: payoutAccountId,
      },
    });
    expect(created.statusCode).toBe(201);
    const payoutId = created.json().data.id as string;
    expect(created.json().data.status).toBe('PENDING');

    const stepSubmit = await issueStepUpToken(app, owner.token, 'payouts.submit');
    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/payouts/${payoutId}/submit`,
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `submit-${payoutId}`,
        'x-step-up-token': stepSubmit,
      },
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json().data.status).toBe('SUBMITTED');

    const balBefore = await ledgerService.getBalances(owner.orgId);
    const stepPaid = await issueStepUpToken(app, owner.token, 'payouts.mark_paid');
    const paid = await app.inject({
      method: 'POST',
      url: `/api/v1/payouts/${payoutId}/mark-paid`,
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `paid-${payoutId}`,
        'x-step-up-token': stepPaid,
      },
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json().data.status).toBe('PAID');

    const journal = await pgQuery(
      `SELECT id FROM ledger_journals
       WHERE organization_id=$1 AND source_type=$2 AND source_id=$3`,
      [owner.orgId, LEDGER_SOURCE_TYPES.payout, payoutId],
    );
    expect(journal.rows.length).toBe(1);

    const balAfter = await ledgerService.getBalances(owner.orgId);
    expect(BigInt(balAfter.settled_minor)).toBeGreaterThan(BigInt(balBefore.settled_minor));

    const settlement = await pgQuery(
      `SELECT status FROM settlements WHERE id=$1`,
      [settlementId],
    );
    expect(settlement.rows[0].status).toBe('PAID');
  });

  it('rejects unverified account and over-cap amount; cancel releases cap', async () => {
    if (!ready) return;
    await seedPayment(owner.orgId, '8000');
    const stepSettle = await issueStepUpToken(app, owner.token, 'settlements.manage');
    const draft = await app.inject({
      method: 'POST',
      url: '/api/v1/settlements',
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `settle2-${Date.now()}`,
        'x-step-up-token': stepSettle,
      },
      payload: {currency_code: 'SAR', provider_fees_minor: '0'},
    });
    const settlementId = draft.json().data.id as string;
    await finalizeSettlement(app, owner.token, settlementId);
    const net = BigInt(draft.json().data.net_minor);

    const pendingAcct = await pgQuery(
      `INSERT INTO payout_accounts(
         organization_id, payout_method_id, currency_code, country_id, bank_name,
         account_holder_name, account_type, account_number_encrypted, account_last4,
         account_fingerprint, status
       ) SELECT $1, id, 'SAR', (SELECT id FROM master_countries WHERE code='SA'), 'X','H','IBAN','v1$x','9999',$2,'PENDING_VERIFICATION'
       FROM master_payout_methods LIMIT 1 RETURNING id`,
      [owner.orgId, randomBytes(32).toString('hex')],
    );

    const stepCreate = await issueStepUpToken(app, owner.token, 'payouts.manage');
    const badAcct = await app.inject({
      method: 'POST',
      url: '/api/v1/payouts',
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `bad-acct-${Date.now()}`,
        'x-step-up-token': stepCreate,
      },
      payload: {
        settlement_id: settlementId,
        payout_account_id: pendingAcct.rows[0].id,
      },
    });
    expect(badAcct.statusCode).toBe(422);
    expect(badAcct.json().error.code).toBe('PAYOUT_ACCOUNT_NOT_VERIFIED');

    const stepCreate2 = await issueStepUpToken(app, owner.token, 'payouts.manage');
    const over = await app.inject({
      method: 'POST',
      url: '/api/v1/payouts',
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `over-${Date.now()}`,
        'x-step-up-token': stepCreate2,
      },
      payload: {
        settlement_id: settlementId,
        payout_account_id: payoutAccountId,
        amount_minor: (net + 1n).toString(),
      },
    });
    expect(over.statusCode).toBe(422);
    expect(over.json().error.code).toBe('PAYOUT_EXCEEDS_UNPAID');

    const stepCreate3 = await issueStepUpToken(app, owner.token, 'payouts.manage');
    const partial = await app.inject({
      method: 'POST',
      url: '/api/v1/payouts',
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `partial-${Date.now()}`,
        'x-step-up-token': stepCreate3,
      },
      payload: {
        settlement_id: settlementId,
        payout_account_id: payoutAccountId,
        amount_minor: '1000',
      },
    });
    expect(partial.statusCode).toBe(201);

    const stepCancel = await issueStepUpToken(app, owner.token, 'payouts.cancel');
    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/v1/payouts/${partial.json().data.id}/cancel`,
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `cancel-po-${partial.json().data.id}`,
        'x-step-up-token': stepCancel,
      },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().data.status).toBe('CANCELLED');

    const stepCreate4 = await issueStepUpToken(app, owner.token, 'payouts.manage');
    const full = await app.inject({
      method: 'POST',
      url: '/api/v1/payouts',
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `full-${Date.now()}`,
        'x-step-up-token': stepCreate4,
      },
      payload: {
        settlement_id: settlementId,
        payout_account_id: payoutAccountId,
      },
    });
    expect(full.statusCode).toBe(201);
    expect(BigInt(full.json().data.amount_minor)).toBe(net);
  });
});
