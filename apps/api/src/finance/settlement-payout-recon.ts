import {pgQuery, withPgTransaction, type PgClient} from '../infrastructure/db/postgres.js';
import {AppError, conflict, notFound} from '../foundation/errors.js';
import {writeAuditEvent, emitOutboxEvent} from '../foundation/audit.js';
import {
  assertSameCurrency,
  computeEligibleMinor,
  computePlatformFeeMinor,
  computeSettlementTotals,
} from './financial-model.js';
import {feeScheduleService} from './fee-schedules-service.js';
import {ledgerService} from '../ledger/ledger-service.js';

async function recomputeSettlementTotals(
  client: PgClient,
  settlement: {
    id: string;
    organization_id: string;
    environment: string;
    currency_code: string;
    provider_fees_minor?: string;
    adjustments_minor?: string;
  },
) {
  const lines = await client.query<{net_minor: string}>(
    `SELECT net_minor::text FROM settlement_lines
     WHERE settlement_id=$1 AND organization_id=$2 AND inclusion_active=TRUE`,
    [settlement.id, settlement.organization_id],
  );
  let gross = 0n;
  for (const line of lines.rows) {
    gross += BigInt(String(line.net_minor || '0'));
  }
  const schedule = await feeScheduleService.resolveActivePlatformFee(
    client,
    settlement.organization_id,
    settlement.environment,
    settlement.currency_code,
  );
  const providerFees = BigInt(String(settlement.provider_fees_minor || '0'));
  const adjustments = BigInt(String(settlement.adjustments_minor || '0'));
  const platformFees =
    gross === 0n
      ? 0n
      : computePlatformFeeMinor({
          grossMinor: gross,
          basisPoints: schedule.basisPoints,
          fixedMinor: schedule.fixedMinor,
        });
  const effectiveProviderFees = gross === 0n ? 0n : providerFees;
  const reserves = 0n;
  const totals = computeSettlementTotals({
    currencyCode: settlement.currency_code,
    grossMinor: gross,
    providerFeesMinor: effectiveProviderFees,
    platformFeesMinor: platformFees,
    reservesMinor: reserves,
    adjustmentsMinor: gross === 0n ? 0n : adjustments,
  });
  return {totals, scheduleId: schedule.scheduleId, lineCount: lines.rows.length};
}

export const settlementService = {
  async list(organizationId: string, limit = 50, offset = 0) {
    const r = await pgQuery(
      `SELECT * FROM settlements WHERE organization_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    );
    return r.rows;
  },

  async get(organizationId: string, id: string) {
    const r = await pgQuery(`SELECT * FROM settlements WHERE organization_id=$1 AND id=$2`, [
      organizationId,
      id,
    ]);
    if (!r.rows[0]) throw notFound('Settlement not found');
    const lines = await pgQuery(
      `SELECT * FROM settlement_lines WHERE settlement_id=$1 AND organization_id=$2`,
      [id, organizationId],
    );
    return {...r.rows[0], lines: lines.rows};
  },

  /**
   * Create DRAFT settlement using DEC-008 financial model:
   * eligible = captured - refunds; exclude already-included PIs; apply fee schedule.
   * Does NOT finalize or post ledger (P15.1-B/D).
   */
  async createDraft(input: {
    organizationId: string;
    currency: string;
    periodStart?: string | null;
    periodEnd?: string | null;
    environment?: string;
    providerFeesMinor?: string | null;
    adjustmentsMinor?: string | null;
    actorUserId?: string | null;
    requestId?: string;
  }) {
    const currency = input.currency.toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new AppError('INVALID_CURRENCY', 'currency_code must be CHAR(3)', 400);
    }
    const environment = (input.environment || 'SANDBOX').toUpperCase();
    if (environment !== 'SANDBOX' && environment !== 'LIVE') {
      throw new AppError('INVALID_ENVIRONMENT', 'environment must be SANDBOX or LIVE', 400);
    }
    const providerFees = BigInt(input.providerFeesMinor || '0');
    if (providerFees < 0n) throw new AppError('INVALID_FEE', 'provider_fees_minor must be >= 0', 400);
    const adjustments = BigInt(input.adjustmentsMinor || '0');

    return withPgTransaction(async (client) => {
      // Serialize draft creation per org+currency+env to reduce concurrent double-include races
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `settlement-draft:${input.organizationId}:${environment}:${currency}`,
      ]);

      const payments = await client.query<{
        id: string;
        amount_minor: string;
        currency_code: string;
        refunded_minor: string;
      }>(
        `SELECT pi.id, pi.amount_minor::text AS amount_minor, pi.currency_code,
                COALESCE((
                  SELECT SUM(r.amount_minor)
                  FROM refunds r
                  WHERE r.payment_intent_id = pi.id
                    AND r.organization_id = pi.organization_id
                    AND r.status IN ('PENDING','SUCCEEDED')
                ), 0)::text AS refunded_minor
         FROM payment_intents pi
         WHERE pi.organization_id=$1
           AND pi.status='SUCCEEDED'
           AND pi.currency_code=$2
           AND ($3::timestamptz IS NULL OR pi.created_at >= $3)
           AND ($4::timestamptz IS NULL OR pi.created_at <= $4)
           AND NOT EXISTS (
             SELECT 1 FROM settlement_lines sl
             WHERE sl.payment_intent_id = pi.id
               AND sl.inclusion_active = TRUE
           )
         ORDER BY pi.created_at ASC
         LIMIT 500`,
        [input.organizationId, currency, input.periodStart || null, input.periodEnd || null],
      );

      const lines: Array<{
        paymentIntentId: string;
        gross: bigint;
        refunded: bigint;
        eligible: bigint;
      }> = [];
      let gross = 0n;
      for (const p of payments.rows) {
        assertSameCurrency(currency, p.currency_code);
        const captured = BigInt(String(p.amount_minor));
        const refunded = BigInt(String(p.refunded_minor || '0'));
        const eligible = computeEligibleMinor(captured, refunded);
        if (eligible <= 0n) continue;
        lines.push({paymentIntentId: p.id, gross: captured, refunded, eligible});
        gross += eligible;
      }

      const schedule = await feeScheduleService.resolveActivePlatformFee(
        client,
        input.organizationId,
        environment,
        currency,
      );
      // No eligible volume → no fees on empty draft (fixed fee must not create negative net)
      const platformFees =
        gross === 0n
          ? 0n
          : computePlatformFeeMinor({
              grossMinor: gross,
              basisPoints: schedule.basisPoints,
              fixedMinor: schedule.fixedMinor,
            });
      const effectiveProviderFees = gross === 0n ? 0n : providerFees;
      // Reserves logic deferred (DEC-008.3) — amount field = 0
      const reserves = 0n;
      const totals = computeSettlementTotals({
        currencyCode: currency,
        grossMinor: gross,
        providerFeesMinor: effectiveProviderFees,
        platformFeesMinor: platformFees,
        reservesMinor: reserves,
        adjustmentsMinor: gross === 0n ? 0n : adjustments,
      });

      const s = await client.query(
        `INSERT INTO settlements(
           organization_id, environment, status, currency_code,
           gross_minor, fees_minor, provider_fees_minor, platform_fees_minor,
           reserves_minor, adjustments_minor, net_minor,
           period_start, period_end, fee_schedule_id
         ) VALUES ($1,$2,'DRAFT',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          input.organizationId,
          environment,
          totals.currency_code,
          totals.gross_minor,
          totals.fees_minor,
          totals.provider_fees_minor,
          totals.platform_fees_minor,
          totals.reserves_minor,
          totals.adjustments_minor,
          totals.net_minor,
          input.periodStart || null,
          input.periodEnd || null,
          schedule.scheduleId,
        ],
      );
      const settlement = s.rows[0];

      for (const line of lines) {
        try {
          await client.query(
            `INSERT INTO settlement_lines(
               settlement_id, organization_id, payment_intent_id, amount_minor, currency_code,
               gross_minor, refunded_minor, net_minor, inclusion_active
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)`,
            [
              settlement.id,
              input.organizationId,
              line.paymentIntentId,
              line.eligible.toString(), // amount_minor = eligible (net for settlement)
              currency,
              line.gross.toString(),
              line.refunded.toString(),
              line.eligible.toString(),
            ],
          );
        } catch (err: any) {
          if (String(err?.code) === '23505') {
            throw new AppError(
              'SETTLEMENT_DOUBLE_INCLUSION',
              'Payment intent already included in another active settlement',
              409,
              {payment_intent_id: line.paymentIntentId},
            );
          }
          throw err;
        }
      }

      await writeAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: 'settlement.created',
          resourceType: 'settlement',
          resourceId: settlement.id,
          requestId: input.requestId,
          after: {
            ...totals,
            line_count: lines.length,
            fee_schedule_id: schedule.scheduleId,
            rounding: 'HALF_UP',
          },
        },
        client,
      );
      return settlement;
    });
  },

  /**
   * DRAFT → FINALIZED: recompute totals, post fee ledger, emit outbox.
   * Idempotent when already FINALIZED.
   */
  async finalize(input: {
    organizationId: string;
    settlementId: string;
    actorUserId?: string | null;
    requestId?: string;
    idempotencyKey?: string;
  }) {
    return withPgTransaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `settlement-finalize:${input.organizationId}:${input.settlementId}`,
      ]);

      const locked = await client.query(
        `SELECT * FROM settlements WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
        [input.settlementId, input.organizationId],
      );
      if (!locked.rows[0]) throw notFound('Settlement not found');
      const existing = locked.rows[0];

      if (existing.status === 'FINALIZED') {
        return {...existing, idempotent: true};
      }
      if (existing.status === 'CANCELLED') {
        throw new AppError('SETTLEMENT_CANCELLED', 'Cannot finalize a cancelled settlement', 409);
      }
      if (existing.status !== 'DRAFT') {
        throw conflict(`Settlement status ${existing.status} cannot be finalized`);
      }

      const {totals, scheduleId, lineCount} = await recomputeSettlementTotals(client, existing);

      const updated = await client.query(
        `UPDATE settlements SET
           status='FINALIZED',
           gross_minor=$3,
           fees_minor=$4,
           provider_fees_minor=$5,
           platform_fees_minor=$6,
           reserves_minor=$7,
           adjustments_minor=$8,
           net_minor=$9,
           fee_schedule_id=$10,
           finalized_at=NOW(),
           finalized_by=$11,
           updated_at=NOW()
         WHERE id=$1 AND organization_id=$2 AND status='DRAFT'
         RETURNING *`,
        [
          input.settlementId,
          input.organizationId,
          totals.gross_minor,
          totals.fees_minor,
          totals.provider_fees_minor,
          totals.platform_fees_minor,
          totals.reserves_minor,
          totals.adjustments_minor,
          totals.net_minor,
          scheduleId,
          input.actorUserId || null,
        ],
      );
      if (!updated.rows[0]) {
        throw conflict('Settlement finalize race; retry');
      }
      const settlement = updated.rows[0];

      await ledgerService.postSettlementFinalizeFeesWithClient(client, {
        organizationId: input.organizationId,
        settlementId: input.settlementId,
        platformFeesMinor: totals.platform_fees_minor,
        providerFeesMinor: totals.provider_fees_minor,
        currencyCode: settlement.currency_code,
        environment: settlement.environment,
      });

      await emitOutboxEvent(
        {
          organizationId: input.organizationId,
          eventType: 'settlement.finalized',
          aggregateType: 'settlement',
          aggregateId: input.settlementId,
          idempotencyKey: input.idempotencyKey || `settlement.finalized:${input.settlementId}`,
          payload: {
            settlement_id: input.settlementId,
            organization_id: input.organizationId,
            environment: settlement.environment,
            currency_code: settlement.currency_code,
            ...totals,
            line_count: lineCount,
            finalized_at: settlement.finalized_at,
          },
        },
        client,
      );

      await writeAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: 'settlement.finalized',
          resourceType: 'settlement',
          resourceId: input.settlementId,
          requestId: input.requestId,
          after: {...totals, line_count: lineCount, status: 'FINALIZED'},
        },
        client,
      );

      return {...settlement, idempotent: false};
    });
  },

  /**
   * DRAFT → CANCELLED: release PI inclusions (inclusion_active=FALSE). No ledger posts.
   */
  async cancel(input: {
    organizationId: string;
    settlementId: string;
    actorUserId?: string | null;
    requestId?: string;
    idempotencyKey?: string;
  }) {
    return withPgTransaction(async (client) => {
      const locked = await client.query(
        `SELECT * FROM settlements WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
        [input.settlementId, input.organizationId],
      );
      if (!locked.rows[0]) throw notFound('Settlement not found');
      const existing = locked.rows[0];

      if (existing.status === 'CANCELLED') {
        return {...existing, idempotent: true};
      }
      if (existing.status === 'FINALIZED') {
        throw new AppError('SETTLEMENT_IMMUTABLE', 'Finalized settlements cannot be cancelled', 409);
      }
      if (existing.status !== 'DRAFT') {
        throw conflict(`Settlement status ${existing.status} cannot be cancelled`);
      }

      const updated = await client.query(
        `UPDATE settlements SET
           status='CANCELLED',
           cancelled_at=NOW(),
           cancelled_by=$3,
           updated_at=NOW()
         WHERE id=$1 AND organization_id=$2 AND status='DRAFT'
         RETURNING *`,
        [input.settlementId, input.organizationId, input.actorUserId || null],
      );
      if (!updated.rows[0]) {
        throw conflict('Settlement cancel race; retry');
      }

      await client.query(
        `UPDATE settlement_lines SET inclusion_active=FALSE
         WHERE settlement_id=$1 AND organization_id=$2 AND inclusion_active=TRUE`,
        [input.settlementId, input.organizationId],
      );

      await emitOutboxEvent(
        {
          organizationId: input.organizationId,
          eventType: 'settlement.cancelled',
          aggregateType: 'settlement',
          aggregateId: input.settlementId,
          idempotencyKey: input.idempotencyKey || `settlement.cancelled:${input.settlementId}`,
          payload: {
            settlement_id: input.settlementId,
            organization_id: input.organizationId,
            cancelled_at: updated.rows[0].cancelled_at,
          },
        },
        client,
      );

      await writeAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: 'settlement.cancelled',
          resourceType: 'settlement',
          resourceId: input.settlementId,
          requestId: input.requestId,
          after: {status: 'CANCELLED'},
        },
        client,
      );

      return {...updated.rows[0], idempotent: false};
    });
  },
};

export const payoutService = {
  async list(organizationId: string, limit = 50, offset = 0) {
    const r = await pgQuery(
      `SELECT * FROM payouts WHERE organization_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    );
    return r.rows;
  },

  async get(organizationId: string, id: string) {
    const r = await pgQuery(`SELECT * FROM payouts WHERE organization_id=$1 AND id=$2`, [
      organizationId,
      id,
    ]);
    if (!r.rows[0]) throw notFound('Payout not found');
    return r.rows[0];
  },

  async create(input: {
    organizationId: string;
    settlementId: string;
    payoutAccountId: string;
    amountMinor?: string | null;
    actorUserId?: string | null;
    requestId?: string;
    idempotencyKey?: string;
  }) {
    return withPgTransaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `payout-create:${input.organizationId}:${input.settlementId}`,
      ]);

      const s = await client.query(
        `SELECT * FROM settlements WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
        [input.settlementId, input.organizationId],
      );
      if (!s.rows[0]) throw notFound('Settlement not found');
      const settlement = s.rows[0];
      if (settlement.status !== 'FINALIZED') {
        throw new AppError(
          'SETTLEMENT_NOT_FINALIZED',
          'Payout requires a FINALIZED settlement',
          422,
          {status: settlement.status},
        );
      }
      if (BigInt(String(settlement.net_minor)) <= 0n) {
        throw new AppError('PAYOUT_AMOUNT_INVALID', 'Settlement net must be positive', 422);
      }

      await assertVerifiedPayoutAccount(
        client,
        input.organizationId,
        input.payoutAccountId,
        String(settlement.currency_code),
      );

      const committed = await sumCommittedPayoutMinor(client, input.organizationId, input.settlementId);
      const net = BigInt(String(settlement.net_minor));
      const remaining = net - committed;
      if (remaining <= 0n) {
        throw new AppError(
          'PAYOUT_EXCEEDS_UNPAID',
          'No remaining unpaid net on this settlement',
          422,
          {net_minor: net.toString(), committed_minor: committed.toString()},
        );
      }

      const amount = input.amountMinor != null ? BigInt(input.amountMinor) : remaining;
      if (amount <= 0n) {
        throw new AppError('PAYOUT_AMOUNT_INVALID', 'Payout amount must be positive', 422);
      }
      if (amount > remaining) {
        throw new AppError(
          'PAYOUT_EXCEEDS_UNPAID',
          'Payout amount exceeds remaining unpaid settlement net',
          422,
          {remaining_minor: remaining.toString(), requested_minor: amount.toString()},
        );
      }

      const p = await client.query(
        `INSERT INTO payouts(
           organization_id, settlement_id, payout_account_id, environment,
           status, amount_minor, currency_code
         ) VALUES ($1,$2,$3,$4,'PENDING',$5,$6) RETURNING *`,
        [
          input.organizationId,
          settlement.id,
          input.payoutAccountId,
          settlement.environment,
          amount.toString(),
          settlement.currency_code,
        ],
      );

      await emitOutboxEvent(
        {
          organizationId: input.organizationId,
          eventType: 'payout.created',
          aggregateType: 'payout',
          aggregateId: p.rows[0].id,
          idempotencyKey: input.idempotencyKey || `payout.created:${p.rows[0].id}`,
          payload: {
            payout_id: p.rows[0].id,
            settlement_id: settlement.id,
            payout_account_id: input.payoutAccountId,
            amount_minor: amount.toString(),
            currency_code: settlement.currency_code,
          },
        },
        client,
      );

      await writeAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: 'payout.created',
          resourceType: 'payout',
          resourceId: p.rows[0].id,
          requestId: input.requestId,
          after: {
            settlement_id: settlement.id,
            amount_minor: amount.toString(),
            payout_account_id: input.payoutAccountId,
          },
        },
        client,
      );
      return p.rows[0];
    });
  },

  /** @deprecated use create — kept for internal callers */
  async createFromSettlement(input: {
    organizationId: string;
    settlementId: string;
    payoutAccountId: string;
    amountMinor?: string | null;
    actorUserId?: string | null;
    requestId?: string;
  }) {
    return payoutService.create(input);
  },

  async submit(input: {
    organizationId: string;
    payoutId: string;
    actorUserId?: string | null;
    requestId?: string;
    idempotencyKey?: string;
  }) {
    return transitionPayout(clientWrap(input, async (client) => {
      const row = await lockPayout(client, input.organizationId, input.payoutId);
      if (row.status === 'SUBMITTED') return {...row, idempotent: true};
      if (row.status !== 'PENDING') {
        throw conflict(`Payout status ${row.status} cannot be submitted`);
      }
      const updated = await client.query(
        `UPDATE payouts SET status='SUBMITTED', submitted_at=NOW(), updated_at=NOW()
         WHERE id=$1 AND organization_id=$2 AND status='PENDING' RETURNING *`,
        [input.payoutId, input.organizationId],
      );
      if (!updated.rows[0]) throw conflict('Payout submit race; retry');
      return updated.rows[0];
    }), input, 'payout.submitted', 'payouts.submit');
  },

  async markPaid(input: {
    organizationId: string;
    payoutId: string;
    actorUserId?: string | null;
    requestId?: string;
    idempotencyKey?: string;
  }) {
    return transitionPayout(clientWrap(input, async (client) => {
      const row = await lockPayout(client, input.organizationId, input.payoutId);
      if (row.status === 'PAID') return {...row, idempotent: true};
      if (row.status !== 'SUBMITTED') {
        throw new AppError(
          'PAYOUT_INVALID_STATE',
          'Only SUBMITTED payouts can be marked PAID',
          409,
          {status: row.status},
        );
      }
      const updated = await client.query(
        `UPDATE payouts SET status='PAID', paid_at=NOW(), updated_at=NOW()
         WHERE id=$1 AND organization_id=$2 AND status='SUBMITTED' RETURNING *`,
        [input.payoutId, input.organizationId],
      );
      if (!updated.rows[0]) throw conflict('Payout mark-paid race; retry');
      const payout = updated.rows[0];

      await ledgerService.postPayoutPaidWithClient(client, {
        organizationId: input.organizationId,
        payoutId: input.payoutId,
        amountMinor: String(payout.amount_minor),
        currencyCode: String(payout.currency_code),
        environment: String(payout.environment),
      });

      if (payout.settlement_id) {
        await maybeMarkSettlementFullyPaid(client, input.organizationId, payout.settlement_id);
      }
      return payout;
    }), input, 'payout.paid', 'payouts.mark_paid');
  },

  async fail(input: {
    organizationId: string;
    payoutId: string;
    reason?: string | null;
    actorUserId?: string | null;
    requestId?: string;
    idempotencyKey?: string;
  }) {
    return transitionPayout(clientWrap(input, async (client) => {
      const row = await lockPayout(client, input.organizationId, input.payoutId);
      if (row.status === 'FAILED') return {...row, idempotent: true};
      if (row.status !== 'PENDING' && row.status !== 'SUBMITTED') {
        throw conflict(`Payout status ${row.status} cannot be failed`);
      }
      const updated = await client.query(
        `UPDATE payouts SET status='FAILED', failure_reason=$3, updated_at=NOW()
         WHERE id=$1 AND organization_id=$2 AND status IN ('PENDING','SUBMITTED') RETURNING *`,
        [input.payoutId, input.organizationId, input.reason || 'sandbox_failure'],
      );
      if (!updated.rows[0]) throw conflict('Payout fail race; retry');
      return updated.rows[0];
    }), input, 'payout.failed', 'payouts.fail');
  },

  async cancel(input: {
    organizationId: string;
    payoutId: string;
    actorUserId?: string | null;
    requestId?: string;
    idempotencyKey?: string;
  }) {
    return transitionPayout(clientWrap(input, async (client) => {
      const row = await lockPayout(client, input.organizationId, input.payoutId);
      if (row.status === 'CANCELLED') return {...row, idempotent: true};
      if (row.status !== 'PENDING') {
        throw new AppError(
          'PAYOUT_INVALID_STATE',
          'Only PENDING payouts can be cancelled',
          409,
          {status: row.status},
        );
      }
      const updated = await client.query(
        `UPDATE payouts SET status='CANCELLED', cancelled_at=NOW(), updated_at=NOW()
         WHERE id=$1 AND organization_id=$2 AND status='PENDING' RETURNING *`,
        [input.payoutId, input.organizationId],
      );
      if (!updated.rows[0]) throw conflict('Payout cancel race; retry');
      return updated.rows[0];
    }), input, 'payout.cancelled', 'payouts.cancel');
  },
};

async function sumCommittedPayoutMinor(
  client: PgClient,
  organizationId: string,
  settlementId: string,
): Promise<bigint> {
  const r = await client.query<{total: string}>(
    `SELECT COALESCE(SUM(amount_minor), 0)::text AS total
     FROM payouts
     WHERE organization_id=$1 AND settlement_id=$2
       AND status IN ('PENDING','SUBMITTED','PAID')`,
    [organizationId, settlementId],
  );
  return BigInt(r.rows[0]?.total || '0');
}

async function assertVerifiedPayoutAccount(
  client: PgClient,
  organizationId: string,
  payoutAccountId: string,
  currencyCode: string,
) {
  const r = await client.query(
    `SELECT id, status, currency_code FROM payout_accounts
     WHERE id=$1 AND organization_id=$2`,
    [payoutAccountId, organizationId],
  );
  if (!r.rows[0]) throw notFound('Payout account not found');
  const acct = r.rows[0];
  if (acct.status !== 'VERIFIED' && acct.status !== 'ACTIVE') {
    throw new AppError(
      'PAYOUT_ACCOUNT_NOT_VERIFIED',
      'Payout account must be VERIFIED or ACTIVE',
      422,
      {status: acct.status},
    );
  }
  if (String(acct.currency_code).toUpperCase() !== currencyCode.toUpperCase()) {
    throw new AppError(
      'PAYOUT_CURRENCY_MISMATCH',
      'Payout account currency must match settlement currency',
      422,
    );
  }
}

async function lockPayout(client: PgClient, organizationId: string, payoutId: string) {
  const r = await client.query(
    `SELECT * FROM payouts WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
    [payoutId, organizationId],
  );
  if (!r.rows[0]) throw notFound('Payout not found');
  return r.rows[0];
}

async function maybeMarkSettlementFullyPaid(
  client: PgClient,
  organizationId: string,
  settlementId: string,
) {
  const s = await client.query(
    `SELECT net_minor, status FROM settlements WHERE id=$1 AND organization_id=$2`,
    [settlementId, organizationId],
  );
  if (!s.rows[0] || s.rows[0].status !== 'FINALIZED') return;
  const net = BigInt(String(s.rows[0].net_minor));
  const paid = await client.query<{total: string}>(
    `SELECT COALESCE(SUM(amount_minor), 0)::text AS total
     FROM payouts WHERE settlement_id=$1 AND organization_id=$2 AND status='PAID'`,
    [settlementId, organizationId],
  );
  if (BigInt(paid.rows[0]?.total || '0') >= net) {
    await client.query(
      `UPDATE settlements SET status='PAID', updated_at=NOW()
       WHERE id=$1 AND organization_id=$2 AND status='FINALIZED'`,
      [settlementId, organizationId],
    );
  }
}

function clientWrap<T extends {organizationId: string; payoutId: string}>(
  input: T,
  fn: (client: PgClient) => Promise<Record<string, unknown> & {idempotent?: boolean}>,
) {
  return (client: PgClient) => fn(client);
}

async function transitionPayout(
  run: (client: PgClient) => Promise<Record<string, unknown> & {idempotent?: boolean}>,
  input: {
    organizationId: string;
    payoutId: string;
    actorUserId?: string | null;
    requestId?: string;
    idempotencyKey?: string;
  },
  eventType: string,
  auditAction: string,
) {
  return withPgTransaction(async (client) => {
    const result = await run(client);
    const idempotent = result.idempotent === true;
    if (!idempotent) {
      await emitOutboxEvent(
        {
          organizationId: input.organizationId,
          eventType,
          aggregateType: 'payout',
          aggregateId: input.payoutId,
          idempotencyKey: input.idempotencyKey || `${eventType}:${input.payoutId}`,
          payload: {
            payout_id: input.payoutId,
            organization_id: input.organizationId,
            status: result.status,
            amount_minor: result.amount_minor,
            currency_code: result.currency_code,
            settlement_id: result.settlement_id,
          },
        },
        client,
      );
      await writeAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: auditAction,
          resourceType: 'payout',
          resourceId: input.payoutId,
          requestId: input.requestId,
          after: {status: result.status},
        },
        client,
      );
    }
    return {...result, idempotent};
  });
}

export const reconciliationService = {
  async listRuns(organizationId: string, limit = 50, offset = 0) {
    const r = await pgQuery(
      `SELECT * FROM reconciliation_runs WHERE organization_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    );
    return r.rows;
  },

  async run(organizationId: string, environment = 'SANDBOX') {
    return withPgTransaction(async (client) => {
      const payments = await client.query(
        `SELECT COUNT(*)::int AS c FROM payment_intents
         WHERE organization_id=$1 AND status='SUCCEEDED'`,
        [organizationId],
      );
      let providerCount = 0;
      try {
        const pt = await client.query(
          `SELECT COUNT(*)::int AS c FROM provider_transactions WHERE organization_id=$1`,
          [organizationId],
        );
        providerCount = pt.rows[0]?.c || 0;
      } catch {
        providerCount = 0;
      }
      const paymentCount = payments.rows[0].c as number;
      const mismatch = Math.abs(providerCount - paymentCount);
      const run = await client.query(
        `INSERT INTO reconciliation_runs(
           organization_id, environment, status, provider_txn_count, payment_count, mismatch_count
         ) VALUES ($1,$2,'COMPLETED',$3,$4,$5) RETURNING *`,
        [organizationId, environment, providerCount, paymentCount, mismatch],
      );
      if (mismatch > 0) {
        await client.query(
          `INSERT INTO reconciliation_discrepancies(run_id, organization_id, discrepancy_type, details_json)
           VALUES ($1,$2,'COUNT_MISMATCH',$3)`,
          [
            run.rows[0].id,
            organizationId,
            JSON.stringify({provider_txn_count: providerCount, payment_count: paymentCount}),
          ],
        );
      }
      return run.rows[0];
    });
  },
};
