/**
 * P15.1-B — Ledger hardening: unique source, fee/payout helpers, concurrency.
 */
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify, {type FastifyInstance} from 'fastify';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPool, pgPing, pgQuery, withPgTransaction} from '../apps/api/src/infrastructure/db/postgres.js';
import {outboxWorker} from '../apps/api/src/foundation/outbox-worker.js';
import {ledgerService, LEDGER_SOURCE_TYPES} from '../apps/api/src/ledger/ledger-service.js';

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
  const email = `p15b-${suffix}-${Date.now()}@example.test`;
  const reg = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email,
      password: PASSWORD,
      organization_name: `P15B ${suffix}`,
      name: suffix,
      country_code: 'SA',
    },
  });
  expect(reg.statusCode).toBe(201);
  const orgId = reg.json().data.organization_id as string;
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
  return {orgId, token: login.json().data.access_token as string};
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
      [orgId, 'P15B Merchant'],
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

describe('P15.1-B ledger hardening', () => {
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

  it('unique index ledger_journals_source_uq exists', async () => {
    if (!ready) return;
    const r = await pgQuery<{indexname: string}>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname='public' AND indexname='ledger_journals_source_uq'`,
    );
    expect(r.rows.length).toBe(1);
  });

  it('payment journal is idempotent under concurrent posts', async () => {
    if (!ready) return;
    const piId = await insertSucceededPi(owner.orgId, '10000');
    const results = await Promise.all(
      Array.from({length: 8}, () =>
        ledgerService.postPaymentSucceeded(owner.orgId, piId, '10000', 'SAR'),
      ),
    );
    const journalIds = new Set(results.map((r) => r.journal_id));
    expect(journalIds.size).toBe(1);
    expect(results.some((r) => r.idempotent)).toBe(true);

    const count = await pgQuery(
      `SELECT COUNT(*)::int AS c FROM ledger_journals
       WHERE organization_id=$1 AND source_type=$2 AND source_id=$3`,
      [owner.orgId, LEDGER_SOURCE_TYPES.payment_intent, piId],
    );
    expect(count.rows[0].c).toBe(1);

    const bal = await ledgerService.assertJournalBalanced(results[0].journal_id);
    expect(bal.balanced).toBe(true);
    expect(bal.debit).toBe('10000');
  });

  it('settlement finalize fee helper posts platform_revenue and is idempotent', async () => {
    if (!ready) return;
    const settlementId = randomUUID();
    await ledgerService.ensureDefaultAccounts(owner.orgId, 'SAR');

    const first = await ledgerService.postSettlementFinalizeFees(owner.orgId, settlementId, {
      platformFeesMinor: '300',
      providerFeesMinor: '500',
      currencyCode: 'SAR',
    });
    expect(first.skipped).toBe(false);
    expect(first.idempotent).toBe(false);
    expect(first.journal_id).toBeTruthy();

    const second = await ledgerService.postSettlementFinalizeFees(owner.orgId, settlementId, {
      platformFeesMinor: '300',
      providerFeesMinor: '500',
      currencyCode: 'SAR',
    });
    expect(second.idempotent).toBe(true);
    expect(second.journal_id).toBe(first.journal_id);

    const bal = await ledgerService.assertJournalBalanced(first.journal_id!);
    expect(bal.balanced).toBe(true);
    expect(bal.debit).toBe('800');

    const entries = await pgQuery<{account_code: string; direction: string; amount_minor: string}>(
      `SELECT a.code AS account_code, e.direction, e.amount_minor::text
       FROM ledger_entries e
       JOIN ledger_accounts a ON a.id = e.account_id
       WHERE e.journal_id=$1
       ORDER BY a.code, e.direction`,
      [first.journal_id],
    );
    const by = Object.fromEntries(
      entries.rows.map((row) => [`${row.account_code}:${row.direction}`, row.amount_minor]),
    );
    expect(by['merchant_payable:DEBIT']).toBe('800');
    expect(by['platform_revenue:CREDIT']).toBe('300');
    expect(by['cash_provider:CREDIT']).toBe('500');

    // Fee post reduces available (merchant_payable credit net)
    const piId = await insertSucceededPi(owner.orgId, '10000');
    await ledgerService.postPaymentSucceeded(owner.orgId, piId, '10000', 'SAR');
    // Use a fresh org slice: balances include all posts for owner — assert revenue account credited
    const rev = await pgQuery(
      `SELECT COALESCE(SUM(CASE WHEN e.direction='CREDIT' THEN e.amount_minor ELSE -e.amount_minor END),0)::text AS net
       FROM ledger_accounts a
       LEFT JOIN ledger_entries e ON e.account_id=a.id
       WHERE a.organization_id=$1 AND a.code='platform_revenue'`,
      [owner.orgId],
    );
    expect(BigInt(rev.rows[0].net) >= 300n).toBe(true);
  });

  it('zero fees skip journal; payout helper is idempotent and tenant-scoped', async () => {
    if (!ready) return;
    const settlementId = randomUUID();
    const skip = await ledgerService.postSettlementFinalizeFees(owner.orgId, settlementId, {
      platformFeesMinor: '0',
      providerFeesMinor: '0',
      currencyCode: 'SAR',
    });
    expect(skip.skipped).toBe(true);
    expect(skip.journal_id).toBeNull();

    const payoutId = randomUUID();
    const piId = await insertSucceededPi(owner.orgId, '5000');
    await ledgerService.postPaymentSucceeded(owner.orgId, piId, '5000', 'SAR');

    const p1 = await ledgerService.postPayoutPaid(owner.orgId, payoutId, '2000', 'SAR');
    const p2 = await ledgerService.postPayoutPaid(owner.orgId, payoutId, '2000', 'SAR');
    expect(p1.journal_id).toBe(p2.journal_id);
    expect(p2.idempotent).toBe(true);

    // Org B cannot see Org A journal via listEntries
    const otherEntries = await ledgerService.listEntries(other.orgId, 100, 0);
    expect(otherEntries.every((e: any) => e.organization_id === other.orgId)).toBe(true);
    expect(otherEntries.some((e: any) => e.journal_id === p1.journal_id)).toBe(false);

    // Concurrent payout posts collapse to one journal
    const payout2 = randomUUID();
    const concurrent = await Promise.all(
      Array.from({length: 6}, () => ledgerService.postPayoutPaid(owner.orgId, payout2, '100', 'SAR')),
    );
    expect(new Set(concurrent.map((c) => c.journal_id)).size).toBe(1);

    // SAVEPOINT path inside shared transaction
    const pi2 = await insertSucceededPi(owner.orgId, '1111');
    await withPgTransaction(async (client) => {
      const a = await ledgerService.postPaymentSucceededWithClient(client, {
        organizationId: owner.orgId,
        paymentIntentId: pi2,
        amountMinor: '1111',
        currencyCode: 'SAR',
      });
      const b = await ledgerService.postPaymentSucceededWithClient(client, {
        organizationId: owner.orgId,
        paymentIntentId: pi2,
        amountMinor: '1111',
        currencyCode: 'SAR',
      });
      expect(a.journal_id).toBe(b.journal_id);
      expect(b.idempotent).toBe(true);
    });
  });
});
