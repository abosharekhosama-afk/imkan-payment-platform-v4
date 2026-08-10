/**
 * P15.1-D — Settlement finalize / cancel lifecycle.
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
  const email = `p15d-${suffix}-${Date.now()}@example.test`;
  const reg = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email,
      password: PASSWORD,
      organization_name: `P15D ${suffix}`,
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

async function seedPayment(orgId: string, amountMinor: string) {
  const mp = await pgQuery(
    `INSERT INTO merchant_profiles(organization_id, trading_name)
     VALUES ($1,$2)
     ON CONFLICT (organization_id) DO UPDATE SET trading_name=EXCLUDED.trading_name
     RETURNING id`,
    [orgId, 'P15D Merchant'],
  );
  const merchantProfileId = mp.rows[0].id as string;
  const pi = await pgQuery(
    `INSERT INTO payment_intents(
       organization_id, merchant_profile_id, amount_minor, currency_code, status
     ) VALUES ($1,$2,$3,'SAR','SUCCEEDED') RETURNING id`,
    [orgId, merchantProfileId, amountMinor],
  );
  const piId = pi.rows[0].id as string;
  await ledgerService.postPaymentSucceeded(orgId, piId, amountMinor, 'SAR');
  return piId;
}

async function ensureVerifiedPayoutAccount(orgId: string) {
  const existing = await pgQuery(
    `SELECT id FROM payout_accounts WHERE organization_id=$1 AND status IN ('VERIFIED','ACTIVE') LIMIT 1`,
    [orgId],
  );
  if (existing.rows[0]) return existing.rows[0].id as string;
  const method = await pgQuery(`SELECT id FROM master_payout_methods LIMIT 1`);
  const country = await pgQuery(`SELECT id FROM master_countries WHERE code='SA' LIMIT 1`);
  const ins = await pgQuery(
    `INSERT INTO payout_accounts(
       organization_id, payout_method_id, currency_code, country_id, bank_name,
       account_holder_name, account_type, account_number_encrypted, account_last4,
       account_fingerprint, status
     ) VALUES ($1,$2,'SAR',$3,'Test Bank','Holder','IBAN','v1$test','1234',$4,'VERIFIED')
     RETURNING id`,
    [orgId, method.rows[0].id, country.rows[0].id, randomBytes(32).toString('hex')],
  );
  return ins.rows[0].id as string;
}

async function createDraftSettlement(app: FastifyInstance, token: string, providerFees = '500') {
  const step = await issueStepUpToken(app, token, 'settlements.manage');
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/settlements',
    headers: {
      authorization: `Bearer ${token}`,
      'idempotency-key': `settle-draft-${Date.now()}-${Math.random()}`,
      'x-step-up-token': step,
    },
    payload: {currency_code: 'SAR', provider_fees_minor: providerFees},
  });
  expect(res.statusCode).toBe(201);
  return res.json().data as {id: string; gross_minor: string; net_minor: string; status: string};
}

describe('P15.1-D settlement lifecycle', () => {
  let app: FastifyInstance;
  let ready = false;
  let owner: {orgId: string; token: string};

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
  }, 120_000);

  afterAll(async () => {
    outboxWorker.stop();
    if (app) await app.close();
    await pgPool.end().catch(() => undefined);
  });

  it('finalize posts fees, sets FINALIZED, clears pending balance semantics', async () => {
    if (!ready) return;
    await seedPayment(owner.orgId, '10000');
    const draft = await createDraftSettlement(app, owner.token);

    let bal = await ledgerService.getBalances(owner.orgId);
    expect(bal.pending_minor).toBe('10000');
    expect(bal.available_minor).toBe('10000');

    const step = await issueStepUpToken(app, owner.token, 'settlements.finalize');
    const fin = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${draft.id}/finalize`,
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `finalize-${draft.id}`,
        'x-step-up-token': step,
      },
    });
    expect(fin.statusCode).toBe(200);
    const finalized = fin.json().data;
    expect(finalized.status).toBe('FINALIZED');
    expect(finalized.finalized_at).toBeTruthy();
    expect(BigInt(finalized.gross_minor)).toBe(10000n);
    expect(BigInt(finalized.net_minor)).toBe(BigInt(draft.net_minor));

    const journals = await pgQuery(
      `SELECT id FROM ledger_journals
       WHERE organization_id=$1 AND source_type=$2 AND source_id=$3`,
      [owner.orgId, LEDGER_SOURCE_TYPES.settlement_finalize, draft.id],
    );
    expect(journals.rows.length).toBe(1);

    bal = await ledgerService.getBalances(owner.orgId);
    expect(bal.pending_minor).toBe('0');
    expect(bal.available_minor).toBe(String(finalized.net_minor));
    expect(bal.phase).toBe('P15.1-D');

    const outbox = await pgQuery(
      `SELECT event_type FROM outbox_events
       WHERE organization_id=$1 AND aggregate_id=$2 AND event_type='settlement.finalized'`,
      [owner.orgId, draft.id],
    );
    expect(outbox.rows.length).toBeGreaterThan(0);
  });

  it('finalize is idempotent; cancel releases PI; finalized is immutable', async () => {
    if (!ready) return;
    const piId = await seedPayment(owner.orgId, '5000');
    const draft = await createDraftSettlement(app, owner.token, '0');

    const stepFin = await issueStepUpToken(app, owner.token, 'settlements.finalize');
    const key = `finalize-idem-${draft.id}`;
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${draft.id}/finalize`,
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': key,
        'x-step-up-token': stepFin,
      },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().data.idempotent).toBe(false);
    const stepFin2 = await issueStepUpToken(app, owner.token, 'settlements.finalize');
    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${draft.id}/finalize`,
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `finalize-idem-2-${draft.id}`,
        'x-step-up-token': stepFin2,
      },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().data.idempotent).toBe(true);

    const cancelFin = await issueStepUpToken(app, owner.token, 'settlements.cancel');
    const cancelAttempt = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${draft.id}/cancel`,
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `cancel-fin-${draft.id}`,
        'x-step-up-token': cancelFin,
      },
    });
    expect(cancelAttempt.statusCode).toBe(409);
    expect(cancelAttempt.json().error.code).toBe('SETTLEMENT_IMMUTABLE');

    // New draft on another PI after cancel of unrelated draft
    const pi2 = await seedPayment(owner.orgId, '3000');
    const draft2 = await createDraftSettlement(app, owner.token, '0');
    const stepCancel = await issueStepUpToken(app, owner.token, 'settlements.cancel');
    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${draft2.id}/cancel`,
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `cancel-${draft2.id}`,
        'x-step-up-token': stepCancel,
      },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().data.status).toBe('CANCELLED');

    const active = await pgQuery(
      `SELECT COUNT(*)::int AS c FROM settlement_lines
       WHERE payment_intent_id=$1 AND inclusion_active=TRUE`,
      [pi2],
    );
    expect(active.rows[0].c).toBe(0);

    const outboxCancel = await pgQuery(
      `SELECT 1 FROM outbox_events
       WHERE organization_id=$1 AND aggregate_id=$2 AND event_type='settlement.cancelled'`,
      [owner.orgId, draft2.id],
    );
    expect(outboxCancel.rows.length).toBe(1);

    // PI can be included again after cancel
    const draft3 = await createDraftSettlement(app, owner.token, '0');
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/settlements/${draft3.id}`,
      headers: {authorization: `Bearer ${owner.token}`},
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.lines.length).toBeGreaterThan(0);
    expect(piId).toBeTruthy(); // used in first draft only
  });

  it('payout create requires FINALIZED settlement', async () => {
    if (!ready) return;
    const payoutAccountId = await ensureVerifiedPayoutAccount(owner.orgId);
    await seedPayment(owner.orgId, '2000');
    const draft = await createDraftSettlement(app, owner.token, '0');

    const stepPayout = await issueStepUpToken(app, owner.token, 'payouts.manage');
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/v1/payouts',
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `payout-block-${draft.id}`,
        'x-step-up-token': stepPayout,
      },
      payload: {settlement_id: draft.id, payout_account_id: payoutAccountId},
    });
    expect(blocked.statusCode).toBe(422);
    expect(blocked.json().error.code).toBe('SETTLEMENT_NOT_FINALIZED');

    const stepFin = await issueStepUpToken(app, owner.token, 'settlements.finalize');
    await app.inject({
      method: 'POST',
      url: `/api/v1/settlements/${draft.id}/finalize`,
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `fin-for-payout-${draft.id}`,
        'x-step-up-token': stepFin,
      },
    });

    const stepPayoutOk = await issueStepUpToken(app, owner.token, 'payouts.manage');
    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/payouts',
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `payout-ok-${draft.id}`,
        'x-step-up-token': stepPayoutOk,
      },
      payload: {settlement_id: draft.id, payout_account_id: payoutAccountId},
    });
    expect(ok.statusCode).toBe(201);
  });
});
