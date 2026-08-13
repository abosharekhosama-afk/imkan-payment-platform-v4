/**
 * Double-entry ledger (Financial Core).
 * Balances are derived from ledger entries — never from frontend sums.
 * Fee model: DEC-008 RESOLVED (see docs/decisions/DEC-008-FINANCIAL-MODEL.md).
 * FX: deferred — no conversion in this service.
 */
import {pgQuery, withPgTransaction, type PgClient} from '../infrastructure/db/postgres.js';
import {AppError} from '../foundation/errors.js';
import {LEDGER_ACCOUNT_CODES} from '../finance/financial-model.js';
import {
  BALANCE_FORMULAS,
  BALANCE_SEMANTICS,
  buildCurrencyBalance,
  pickPrimaryCurrency,
} from '../finance/balances.js';

const DEFAULT_ACCOUNTS = [
  {code: LEDGER_ACCOUNT_CODES.cash_provider, name: 'Provider receivable / cash', account_type: 'ASSET'},
  {code: LEDGER_ACCOUNT_CODES.pending_settlement, name: 'Pending settlement', account_type: 'ASSET'},
  {code: LEDGER_ACCOUNT_CODES.merchant_payable, name: 'Merchant payable', account_type: 'LIABILITY'},
  {code: LEDGER_ACCOUNT_CODES.platform_revenue, name: 'Platform revenue', account_type: 'REVENUE'},
  {code: LEDGER_ACCOUNT_CODES.refunds_expense, name: 'Refunds', account_type: 'EXPENSE'},
] as const;

/** Canonical journal source_type values (I4). */
export const LEDGER_SOURCE_TYPES = {
  payment_intent: 'payment_intent',
  refund: 'refund',
  settlement_finalize: 'settlement_finalize',
  payout: 'payout',
} as const;

export type LedgerSourceType = (typeof LEDGER_SOURCE_TYPES)[keyof typeof LEDGER_SOURCE_TYPES];

type JournalLine = {
  code: string;
  direction: 'DEBIT' | 'CREDIT';
  amountMinor: string;
};

async function getAccountId(
  client: PgClient,
  organizationId: string,
  code: string,
  currency: string,
  environment: string,
): Promise<string> {
  const r = await client.query(
    `SELECT id FROM ledger_accounts
     WHERE organization_id=$1 AND code=$2 AND currency_code=$3 AND environment=$4`,
    [organizationId, code, currency, environment],
  );
  if (!r.rows[0]) throw new AppError('LEDGER_ACCOUNT_MISSING', `Ledger account ${code} missing`, 500);
  return r.rows[0].id as string;
}

async function findJournalBySource(
  client: PgClient,
  organizationId: string,
  sourceType: string,
  sourceId: string,
): Promise<string | null> {
  const r = await client.query(
    `SELECT id FROM ledger_journals
     WHERE organization_id=$1 AND source_type=$2 AND source_id=$3`,
    [organizationId, sourceType, sourceId],
  );
  return (r.rows[0]?.id as string) || null;
}

function assertBalanced(lines: JournalLine[]) {
  const debit = lines
    .filter((l) => l.direction === 'DEBIT')
    .reduce((a, l) => a + BigInt(l.amountMinor), 0n);
  const credit = lines
    .filter((l) => l.direction === 'CREDIT')
    .reduce((a, l) => a + BigInt(l.amountMinor), 0n);
  if (debit !== credit) {
    throw new AppError('LEDGER_UNBALANCED', 'Journal debits must equal credits', 500, {
      debit: debit.toString(),
      credit: credit.toString(),
    });
  }
  if (debit <= 0n) throw new AppError('LEDGER_EMPTY', 'Journal must have positive amounts', 400);
  return debit;
}

/**
 * Insert a balanced journal. Caller must ensure source uniqueness / idempotency wrapper.
 */
async function insertBalancedJournal(
  client: PgClient,
  input: {
    organizationId: string;
    environment: string;
    memo: string;
    sourceType: string;
    sourceId: string;
    currency: string;
    lines: JournalLine[];
  },
): Promise<string> {
  assertBalanced(input.lines);

  const journal = await client.query(
    `INSERT INTO ledger_journals(organization_id, environment, memo, source_type, source_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [input.organizationId, input.environment, input.memo, input.sourceType, input.sourceId],
  );
  const journalId = journal.rows[0].id as string;

  for (const line of input.lines) {
    const accountId = await getAccountId(
      client,
      input.organizationId,
      line.code,
      input.currency,
      input.environment,
    );
    await client.query(
      `INSERT INTO ledger_entries(journal_id, organization_id, account_id, direction, amount_minor, currency_code)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [journalId, input.organizationId, accountId, line.direction, line.amountMinor, input.currency],
    );
  }
  return journalId;
}

/**
 * Idempotent post: SELECT → INSERT under SAVEPOINT so 23505 does not abort outer TX.
 * Unique index ledger_journals_source_uq is the DB guarantee (P15.1-B).
 */
async function postBalancedJournalIdempotent(
  client: PgClient,
  input: {
    organizationId: string;
    environment: string;
    memo: string;
    sourceType: string;
    sourceId: string;
    currency: string;
    lines: JournalLine[];
  },
): Promise<{journal_id: string; idempotent: boolean}> {
  const existing = await findJournalBySource(
    client,
    input.organizationId,
    input.sourceType,
    input.sourceId,
  );
  if (existing) return {journal_id: existing, idempotent: true};

  await client.query('SAVEPOINT ledger_journal_post');
  try {
    const journalId = await insertBalancedJournal(client, input);
    await client.query('RELEASE SAVEPOINT ledger_journal_post');
    return {journal_id: journalId, idempotent: false};
  } catch (err: any) {
    await client.query('ROLLBACK TO SAVEPOINT ledger_journal_post');
    if (String(err?.code) === '23505') {
      const again = await findJournalBySource(
        client,
        input.organizationId,
        input.sourceType,
        input.sourceId,
      );
      if (again) return {journal_id: again, idempotent: true};
      throw new AppError(
        'LEDGER_DUPLICATE_SOURCE',
        'Duplicate ledger journal source but existing row not found',
        409,
        {source_type: input.sourceType, source_id: input.sourceId},
      );
    }
    throw err;
  }
}

function buildSettlementFinalizeLines(
  platformFeesMinor: bigint,
  providerFeesMinor: bigint,
): JournalLine[] {
  if (platformFeesMinor < 0n || providerFeesMinor < 0n) {
    throw new AppError('INVALID_FEE', 'Fee amounts must be >= 0', 400);
  }
  const total = platformFeesMinor + providerFeesMinor;
  if (total <= 0n) return [];

  const lines: JournalLine[] = [
    {
      code: LEDGER_ACCOUNT_CODES.merchant_payable,
      direction: 'DEBIT',
      amountMinor: total.toString(),
    },
  ];
  if (platformFeesMinor > 0n) {
    lines.push({
      code: LEDGER_ACCOUNT_CODES.platform_revenue,
      direction: 'CREDIT',
      amountMinor: platformFeesMinor.toString(),
    });
  }
  if (providerFeesMinor > 0n) {
    lines.push({
      code: LEDGER_ACCOUNT_CODES.cash_provider,
      direction: 'CREDIT',
      amountMinor: providerFeesMinor.toString(),
    });
  }
  return lines;
}

export const ledgerService = {
  async ensureDefaultAccounts(organizationId: string, currencyCode: string, environment = 'SANDBOX') {
    const currency = currencyCode.toUpperCase();
    return withPgTransaction(async (client) => {
      await ensureAccountsOnClient(client, organizationId, currency, environment);
      return {ok: true, currency, environment};
    });
  },

  async postPaymentSucceeded(
    organizationId: string,
    paymentIntentId: string,
    amountMinor: string,
    currencyCode: string,
    environment = 'SANDBOX',
  ) {
    return withPgTransaction(async (client) =>
      ledgerService.postPaymentSucceededWithClient(client, {
        organizationId,
        paymentIntentId,
        amountMinor,
        currencyCode,
        environment,
      }),
    );
  },

  async postPaymentSucceededWithClient(
    client: PgClient,
    input: {
      organizationId: string;
      paymentIntentId: string;
      amountMinor: string;
      currencyCode: string;
      environment?: string;
      platformFeesMinor?: string;
      providerFeesMinor?: string;
      netToMerchantMinor?: string;
    },
  ) {
    const currency = input.currencyCode.toUpperCase();
    const environment = input.environment || 'SANDBOX';
    await ensureAccountsOnClient(client, input.organizationId, currency, environment);

    const gross = BigInt(input.amountMinor);
    const platformFees = BigInt(input.platformFeesMinor || '0');
    const providerFees = BigInt(input.providerFeesMinor || '0');
    const net =
      input.netToMerchantMinor !== undefined
        ? BigInt(input.netToMerchantMinor)
        : gross - platformFees - providerFees;

    if (net < 0n || platformFees + providerFees > gross) {
      throw new AppError('INVALID_FEE_SPLIT', 'Fee split does not match gross amount', 422);
    }

    const lines: JournalLine[] = [
      {
        code: LEDGER_ACCOUNT_CODES.pending_settlement,
        direction: 'DEBIT',
        amountMinor: gross.toString(),
      },
    ];
    if (net > 0n) {
      lines.push({
        code: LEDGER_ACCOUNT_CODES.merchant_payable,
        direction: 'CREDIT',
        amountMinor: net.toString(),
      });
    }
    if (platformFees > 0n) {
      lines.push({
        code: LEDGER_ACCOUNT_CODES.platform_revenue,
        direction: 'CREDIT',
        amountMinor: platformFees.toString(),
      });
    }
    if (providerFees > 0n) {
      lines.push({
        code: LEDGER_ACCOUNT_CODES.cash_provider,
        direction: 'CREDIT',
        amountMinor: providerFees.toString(),
      });
    }

    return postBalancedJournalIdempotent(client, {
      organizationId: input.organizationId,
      environment,
      memo: `Payment succeeded ${input.paymentIntentId}`,
      sourceType: LEDGER_SOURCE_TYPES.payment_intent,
      sourceId: input.paymentIntentId,
      currency,
      lines,
    });
  },

  async postRefund(
    organizationId: string,
    refundId: string,
    amountMinor: string,
    currencyCode: string,
    environment = 'SANDBOX',
  ) {
    return withPgTransaction(async (client) =>
      ledgerService.postRefundWithClient(client, {
        organizationId,
        refundId,
        amountMinor,
        currencyCode,
        environment,
      }),
    );
  },

  async postRefundWithClient(
    client: PgClient,
    input: {
      organizationId: string;
      refundId: string;
      amountMinor: string;
      currencyCode: string;
      environment?: string;
    },
  ) {
    const currency = input.currencyCode.toUpperCase();
    const environment = input.environment || 'SANDBOX';
    await ensureAccountsOnClient(client, input.organizationId, currency, environment);
    return postBalancedJournalIdempotent(client, {
      organizationId: input.organizationId,
      environment,
      memo: `Refund ${input.refundId}`,
      sourceType: LEDGER_SOURCE_TYPES.refund,
      sourceId: input.refundId,
      currency,
      lines: [
        {
          code: LEDGER_ACCOUNT_CODES.merchant_payable,
          direction: 'DEBIT',
          amountMinor: input.amountMinor,
        },
        {
          code: LEDGER_ACCOUNT_CODES.pending_settlement,
          direction: 'CREDIT',
          amountMinor: input.amountMinor,
        },
      ],
    });
  },

  /**
   * P15.1-B helper — post settlement fee recognition (idempotent).
   * Does NOT change settlements.status (finalize API lifecycle = P15.1-D).
   *
   * DR merchant_payable (platform + provider fees)
   * CR platform_revenue (platform fees)
   * CR cash_provider (provider fees)
   *
   * Skips when both fee amounts are 0.
   */
  async postSettlementFinalizeFees(
    organizationId: string,
    settlementId: string,
    input: {
      platformFeesMinor: string;
      providerFeesMinor?: string;
      currencyCode: string;
      environment?: string;
    },
  ) {
    return withPgTransaction(async (client) =>
      ledgerService.postSettlementFinalizeFeesWithClient(client, {
        organizationId,
        settlementId,
        ...input,
      }),
    );
  },

  async postSettlementFinalizeFeesWithClient(
    client: PgClient,
    input: {
      organizationId: string;
      settlementId: string;
      platformFeesMinor: string;
      providerFeesMinor?: string;
      currencyCode: string;
      environment?: string;
    },
  ) {
    const currency = input.currencyCode.toUpperCase();
    const environment = input.environment || 'SANDBOX';
    const platformFees = BigInt(input.platformFeesMinor || '0');
    const providerFees = BigInt(input.providerFeesMinor || '0');
    const lines = buildSettlementFinalizeLines(platformFees, providerFees);
    if (lines.length === 0) {
      return {journal_id: null as string | null, idempotent: true, skipped: true as const};
    }
    await ensureAccountsOnClient(client, input.organizationId, currency, environment);
    const result = await postBalancedJournalIdempotent(client, {
      organizationId: input.organizationId,
      environment,
      memo: `Settlement finalize fees ${input.settlementId}`,
      sourceType: LEDGER_SOURCE_TYPES.settlement_finalize,
      sourceId: input.settlementId,
      currency,
      lines,
    });
    return {...result, skipped: false as const};
  },

  /**
   * P15.1-B helper for P15.1-E — post payout paid (idempotent).
   * DR merchant_payable / CR cash_provider.
   * Does NOT mutate payouts.status.
   */
  async postPayoutPaid(
    organizationId: string,
    payoutId: string,
    amountMinor: string,
    currencyCode: string,
    environment = 'SANDBOX',
  ) {
    return withPgTransaction(async (client) =>
      ledgerService.postPayoutPaidWithClient(client, {
        organizationId,
        payoutId,
        amountMinor,
        currencyCode,
        environment,
      }),
    );
  },

  async postPayoutPaidWithClient(
    client: PgClient,
    input: {
      organizationId: string;
      payoutId: string;
      amountMinor: string;
      currencyCode: string;
      environment?: string;
    },
  ) {
    const currency = input.currencyCode.toUpperCase();
    const environment = input.environment || 'SANDBOX';
    if (BigInt(input.amountMinor) <= 0n) {
      throw new AppError('LEDGER_EMPTY', 'Payout ledger amount must be positive', 400);
    }
    await ensureAccountsOnClient(client, input.organizationId, currency, environment);
    return postBalancedJournalIdempotent(client, {
      organizationId: input.organizationId,
      environment,
      memo: `Payout paid ${input.payoutId}`,
      sourceType: LEDGER_SOURCE_TYPES.payout,
      sourceId: input.payoutId,
      currency,
      lines: [
        {
          code: LEDGER_ACCOUNT_CODES.merchant_payable,
          direction: 'DEBIT',
          amountMinor: input.amountMinor,
        },
        {
          code: LEDGER_ACCOUNT_CODES.cash_provider,
          direction: 'CREDIT',
          amountMinor: input.amountMinor,
        },
      ],
    });
  },

  async assertJournalBalanced(journalId: string): Promise<{debit: string; credit: string; balanced: boolean}> {
    const r = await pgQuery<{debit: string; credit: string}>(
      `SELECT
         COALESCE(SUM(CASE WHEN direction='DEBIT' THEN amount_minor ELSE 0 END),0)::text AS debit,
         COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount_minor ELSE 0 END),0)::text AS credit
       FROM ledger_entries WHERE journal_id=$1`,
      [journalId],
    );
    const debit = r.rows[0]?.debit || '0';
    const credit = r.rows[0]?.credit || '0';
    return {debit, credit, balanced: debit === credit};
  },

  async listAccounts(organizationId: string, environment = 'SANDBOX') {
    const r = await pgQuery(
      `SELECT * FROM ledger_accounts WHERE organization_id=$1 AND environment=$2 ORDER BY code`,
      [organizationId, environment],
    );
    return r.rows;
  },

  async listEntries(organizationId: string, limit = 50, offset = 0) {
    const r = await pgQuery(
      `SELECT e.*, a.code AS account_code
       FROM ledger_entries e
       JOIN ledger_accounts a ON a.id = e.account_id
       WHERE e.organization_id=$1
       ORDER BY e.created_at DESC
       LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    );
    return r.rows;
  },

  /**
   * P15.1-C balance contract (Financial Core SoT):
   * - pending / available from ledger account nets (per currency)
   * - reserved from FINALIZED settlements.reserves_minor (0 while DEC-008.3 deferred)
   * - settled from payout journals (source_type = payout)
   */
  async getBalances(
    organizationId: string,
    environment = 'SANDBOX',
    options?: {currencyCode?: string | null},
  ) {
    const env = (environment || 'SANDBOX').toUpperCase();
    const accountNets = await pgQuery<{code: string; currency_code: string; net: string}>(
      `SELECT a.code, a.currency_code,
              COALESCE(SUM(CASE WHEN e.direction='DEBIT' THEN e.amount_minor ELSE -e.amount_minor END), 0)::text AS net
       FROM ledger_accounts a
       LEFT JOIN ledger_entries e ON e.account_id = a.id
       WHERE a.organization_id=$1 AND a.environment=$2
       GROUP BY a.code, a.currency_code`,
      [organizationId, env],
    );

    const settledRows = await pgQuery<{currency_code: string; settled: string}>(
      `SELECT a.currency_code,
              COALESCE(SUM(e.amount_minor), 0)::text AS settled
       FROM ledger_journals j
       JOIN ledger_entries e ON e.journal_id = j.id AND e.organization_id = j.organization_id
       JOIN ledger_accounts a ON a.id = e.account_id
       WHERE j.organization_id=$1
         AND j.environment=$2
         AND j.source_type=$3
         AND a.code='merchant_payable'
         AND e.direction='DEBIT'
       GROUP BY a.currency_code`,
      [organizationId, env, LEDGER_SOURCE_TYPES.payout],
    );

    const reservedRows = await pgQuery<{currency_code: string; reserved: string}>(
      `SELECT currency_code,
              COALESCE(SUM(reserves_minor), 0)::text AS reserved
       FROM settlements
       WHERE organization_id=$1
         AND environment=$2
         AND status='FINALIZED'
       GROUP BY currency_code`,
      [organizationId, env],
    );

    const finalizedGrossRows = await pgQuery<{currency_code: string; gross: string}>(
      `SELECT currency_code,
              COALESCE(SUM(gross_minor), 0)::text AS gross
       FROM settlements
       WHERE organization_id=$1
         AND environment=$2
         AND status='FINALIZED'
       GROUP BY currency_code`,
      [organizationId, env],
    );

    const settledBy = Object.fromEntries(settledRows.rows.map((r) => [r.currency_code, BigInt(r.settled)]));
    const reservedBy = Object.fromEntries(reservedRows.rows.map((r) => [r.currency_code, BigInt(r.reserved)]));
    const finalizedGrossBy = Object.fromEntries(
      finalizedGrossRows.rows.map((r) => [r.currency_code, BigInt(r.gross)]),
    );

    type Acc = {pending: bigint; payable: bigint};
    const byCurrency = new Map<string, Acc>();
    for (const row of accountNets.rows) {
      const cur = row.currency_code;
      const acc = byCurrency.get(cur) || {pending: 0n, payable: 0n};
      const net = BigInt(row.net || '0');
      if (row.code === 'pending_settlement') acc.pending = net;
      if (row.code === 'merchant_payable') acc.payable = net;
      byCurrency.set(cur, acc);
    }

    for (const cur of Object.keys(settledBy)) {
      if (!byCurrency.has(cur)) byCurrency.set(cur, {pending: 0n, payable: 0n});
    }
    for (const cur of Object.keys(reservedBy)) {
      if (!byCurrency.has(cur)) byCurrency.set(cur, {pending: 0n, payable: 0n});
    }
    for (const cur of Object.keys(finalizedGrossBy)) {
      if (!byCurrency.has(cur)) byCurrency.set(cur, {pending: 0n, payable: 0n});
    }

    const currencyCodes = [...byCurrency.keys()].sort();
    if (currencyCodes.length === 0) currencyCodes.push('SAR');

    const activity: Record<string, bigint> = {};
    const currencies = currencyCodes.map((currencyCode) => {
      const acc = byCurrency.get(currencyCode) || {pending: 0n, payable: 0n};
      const row = buildCurrencyBalance({
        currencyCode,
        pendingSettlementNet: acc.pending,
        merchantPayableNet: acc.payable,
        finalizedGrossMinor: finalizedGrossBy[currencyCode] ?? 0n,
        reservedMinor: reservedBy[currencyCode] ?? 0n,
        settledMinor: settledBy[currencyCode] ?? 0n,
      });
      activity[currencyCode] =
        BigInt(row.pending_minor) +
        BigInt(row.available_minor) +
        BigInt(row.reserved_minor) +
        BigInt(row.settled_minor);
      return row;
    });

    const primaryCode = pickPrimaryCurrency(currencyCodes, options?.currencyCode, activity);
    const primary = currencies.find((c) => c.currency_code === primaryCode) || currencies[0];

    return {
      environment: env,
      currency_code: primary.currency_code,
      available_minor: primary.available_minor,
      pending_minor: primary.pending_minor,
      reserved_minor: primary.reserved_minor,
      settled_minor: primary.settled_minor,
      currencies,
      formulas: BALANCE_FORMULAS,
      semantics: BALANCE_SEMANTICS,
      source: 'financial_core',
      phase: 'P15.1-D',
      updated_at: new Date().toISOString(),
      note:
        'Balances derived by Financial Core only. Pending excludes FINALIZED settlement gross; reserved=0 until reserve logic.',
    };
  },
};

async function ensureAccountsOnClient(
  client: PgClient,
  organizationId: string,
  currency: string,
  environment: string,
) {
  for (const a of DEFAULT_ACCOUNTS) {
    await client.query(
      `INSERT INTO ledger_accounts(organization_id, code, name, account_type, currency_code, environment)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (organization_id, code, environment, currency_code) DO NOTHING`,
      [organizationId, a.code, a.name, a.account_type, currency, environment],
    );
  }
}
