/**
 * Refunds — first-class payment operations (sandbox provider path).
 * Live provider refunds: BLOCKED BY DEC-009.
 *
 * Environment is NEVER taken from payment_intents (column does not exist) or from
 * client body. Sandbox is the only active rail until DEC-009 / DEC-012.
 */
import {pgQuery, withPgTransaction, type PgClient} from '../infrastructure/db/postgres.js';
import {AppError, notFound} from '../foundation/errors.js';
import {emitOutboxEvent, writeAuditEvent} from '../foundation/audit.js';
import {ledgerService} from '../ledger/ledger-service.js';
import {getProviderAdapter} from '../providers/registry.js';

function randomRef() {
  return `sbx_rf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Active payment rail environment — never client-supplied. LIVE blocked DEC-009. */
function resolveRefundEnvironment(): 'SANDBOX' | 'LIVE' {
  const env = (process.env.APP_ENV || process.env.NODE_ENV || 'sandbox').toLowerCase();
  if (env === 'production' || env === 'live') {
    if (process.env.ALLOW_LIVE_API_KEYS !== 'true') return 'SANDBOX';
    return 'LIVE';
  }
  return 'SANDBOX';
}

async function resolvePaymentProviderForRefund(
  client: PgClient,
  organizationId: string,
  paymentIntentId: string,
): Promise<{code: string; providerTransactionId: string}> {
  const txn = await client.query<{provider_code: string; provider_transaction_id: string | null}>(
    `SELECT provider_code, provider_transaction_id FROM payment_transactions
     WHERE payment_intent_id=$1 AND organization_id=$2 AND status='SUCCEEDED'
     ORDER BY captured_at DESC NULLS LAST, created_at DESC LIMIT 1`,
    [paymentIntentId, organizationId],
  );
  if (txn.rows[0]?.provider_code) {
    return {
      code: txn.rows[0].provider_code,
      providerTransactionId: txn.rows[0].provider_transaction_id || paymentIntentId,
    };
  }
  const att = await client.query<{provider_code: string | null}>(
    `SELECT provider_code FROM payment_attempts
     WHERE payment_intent_id=$1 AND organization_id=$2 AND status='SUCCEEDED'
     ORDER BY created_at DESC LIMIT 1`,
    [paymentIntentId, organizationId],
  );
  return {
    code: att.rows[0]?.provider_code || 'sandbox',
    providerTransactionId: paymentIntentId,
  };
}

export const refundsService = {
  async list(organizationId: string, limit = 50, offset = 0) {
    const r = await pgQuery(
      `SELECT * FROM refunds WHERE organization_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    );
    return r.rows;
  },

  async get(organizationId: string, id: string) {
    const r = await pgQuery(`SELECT * FROM refunds WHERE organization_id=$1 AND id=$2`, [
      organizationId,
      id,
    ]);
    if (!r.rows[0]) throw notFound('Refund not found');
    return r.rows[0];
  },

  async createRefund(input: {
    organizationId: string;
    paymentIntentId: string;
    amountMinor: string;
    currency: string;
    reason?: string | null;
    actorUserId?: string | null;
    idempotencyKey?: string | null;
    requestId?: string;
  }) {
    const amount = BigInt(input.amountMinor);
    if (amount <= 0n) throw new AppError('INVALID_AMOUNT', 'Refund amount must be positive', 400);
    const currency = input.currency.toUpperCase();
    const environment = resolveRefundEnvironment();

    return withPgTransaction(async (client) => {
      if (input.idempotencyKey) {
        const prior = await client.query(
          `SELECT * FROM refunds WHERE organization_id=$1 AND idempotency_key=$2`,
          [input.organizationId, input.idempotencyKey],
        );
        if (prior.rows[0]) return prior.rows[0];
      }

      // FOR UPDATE serializes concurrent refunds against the same PI.
      const pi = await client.query(
        `SELECT id, status, amount_minor, currency_code
         FROM payment_intents
         WHERE id=$1 AND organization_id=$2
         FOR UPDATE`,
        [input.paymentIntentId, input.organizationId],
      );
      if (!pi.rows[0]) throw notFound('Payment not found');
      const intent = pi.rows[0];
      if (intent.status !== 'SUCCEEDED') {
        throw new AppError('PAYMENT_NOT_REFUNDABLE', 'Only SUCCEEDED payments can be refunded', 422);
      }
      if (String(intent.currency_code).toUpperCase() !== currency) {
        throw new AppError('CURRENCY_MISMATCH', 'Refund currency must match payment', 400);
      }

      const summed = await client.query(
        `SELECT COALESCE(SUM(amount_minor),0)::text AS total
         FROM refunds
         WHERE payment_intent_id=$1 AND organization_id=$2 AND status IN ('PENDING','SUCCEEDED')`,
        [input.paymentIntentId, input.organizationId],
      );
      const already = BigInt(summed.rows[0].total);
      const capturable = BigInt(String(intent.amount_minor));
      if (already + amount > capturable) {
        throw new AppError(
          'REFUND_EXCEEDS_CAPTURED',
          'Total refunds cannot exceed captured amount',
          422,
          {
            captured_minor: capturable.toString(),
            already_refunded_minor: already.toString(),
            requested_minor: amount.toString(),
            remaining_minor: (capturable - already).toString(),
          },
        );
      }

      // Call provider adapter refund (SANDBOX rails only — LIVE blocked DEC-009).
      let providerRefundRef = randomRef();
      try {
        const providerInfo = await resolvePaymentProviderForRefund(client, input.organizationId, input.paymentIntentId);
        if (environment === 'SANDBOX' && !['sandbox', 'paytabs', 'stripe'].includes(providerInfo.code)) {
          throw new AppError(
            'PROVIDER_REFUND_BLOCKED',
            `Refund via provider '${providerInfo.code}' is not enabled in SANDBOX scope`,
            422,
          );
        }
        if (environment === 'LIVE' && !['paytabs', 'stripe'].includes(providerInfo.code)) {
          throw new AppError(
            'PROVIDER_REFUND_BLOCKED',
            `Live refunds are enabled for PayTabs and Stripe only (DEC-009)`,
            422,
          );
        }
        const adapter = getProviderAdapter(providerInfo.code);
        const providerResult = await adapter.refund({
          organizationId: input.organizationId,
          paymentTransactionId: providerInfo.providerTransactionId,
          amountMinor: input.amountMinor,
          currencyCode: currency,
          idempotencyKey: input.idempotencyKey || undefined,
        });
        if (providerResult.status === 'FAILED') {
          throw new AppError(
            'PROVIDER_REFUND_FAILED',
            providerResult.failureMessage || 'Provider refund failed',
            422,
            {provider_code: providerResult.failureCode},
          );
        }
        if (providerResult.providerReference) {
          providerRefundRef = providerResult.providerReference;
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        // Adapter missing refund method or unexpected — still block live; sandbox must work
        throw new AppError(
          'PROVIDER_REFUND_ERROR',
          err instanceof Error ? err.message : 'Provider refund error',
          502,
        );
      }

      const inserted = await client.query(
        `INSERT INTO refunds(
           organization_id, payment_intent_id, amount_minor, currency_code, status, reason,
           environment, provider_refund_ref, idempotency_key, created_by
         ) VALUES ($1,$2,$3,$4,'SUCCEEDED',$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          input.organizationId,
          input.paymentIntentId,
          input.amountMinor,
          currency,
          input.reason || null,
          environment,
          providerRefundRef,
          input.idempotencyKey || null,
          input.actorUserId || null,
        ],
      );
      const refund = inserted.rows[0];

      // Ledger compensating entry in the SAME transaction (not best-effort after commit).
      await ledgerService.postRefundWithClient(client, {
        organizationId: input.organizationId,
        refundId: refund.id,
        amountMinor: input.amountMinor,
        currencyCode: currency,
        environment,
      });

      await writeAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: 'refund.created',
          resourceType: 'refund',
          resourceId: refund.id,
          requestId: input.requestId,
          after: {
            payment_intent_id: input.paymentIntentId,
            amount_minor: input.amountMinor,
            currency,
            environment,
            provider_refund_ref: providerRefundRef,
          },
        },
        client,
      );
      await emitOutboxEvent(
        {
          organizationId: input.organizationId,
          eventType: 'refund.created',
          aggregateType: 'refund',
          aggregateId: refund.id,
          payload: {
            refund_id: refund.id,
            payment_intent_id: input.paymentIntentId,
            amount_minor: input.amountMinor,
            currency,
          },
          idempotencyKey: `refund.created:${refund.id}`,
        },
        client,
      );
      await emitOutboxEvent(
        {
          organizationId: input.organizationId,
          eventType: 'refund.succeeded',
          aggregateType: 'refund',
          aggregateId: refund.id,
          payload: {
            refund_id: refund.id,
            payment_intent_id: input.paymentIntentId,
            amount_minor: input.amountMinor,
            currency_code: currency,
            status: 'SUCCEEDED',
          },
          idempotencyKey: `refund.succeeded:${refund.id}`,
        },
        client,
      );
      const full = already + amount === capturable;
      await emitOutboxEvent(
        {
          organizationId: input.organizationId,
          eventType: full ? 'payment.refunded' : 'payment.partially_refunded',
          aggregateType: 'payment_intent',
          aggregateId: input.paymentIntentId,
          payload: {refund_id: refund.id, amount_minor: input.amountMinor},
          idempotencyKey: `payment.refunded:${refund.id}`,
        },
        client,
      );

      return refund;
    });
  },

  /** Used by webhook apply when provider emits a refund event for an existing PI. */
  async applyProviderRefundEvent(
    client: PgClient,
    input: {
      organizationId: string;
      paymentIntentId: string;
      amountMinor: string;
      currency: string;
      providerEventId: string;
      providerRefundRef?: string | null;
    },
  ) {
    const idem = `webhook-refund:${input.providerEventId}`;
    const prior = await client.query(
      `SELECT * FROM refunds WHERE organization_id=$1 AND idempotency_key=$2`,
      [input.organizationId, idem],
    );
    if (prior.rows[0]) return {refund: prior.rows[0], applied: false};

    // Re-enter create path via nested logic without opening a new transaction
    const amount = BigInt(input.amountMinor);
    const currency = input.currency.toUpperCase();
    const environment = resolveRefundEnvironment();

    const pi = await client.query(
      `SELECT id, status, amount_minor, currency_code
       FROM payment_intents WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
      [input.paymentIntentId, input.organizationId],
    );
    if (!pi.rows[0]) return {refund: null, applied: false, reason: 'payment_not_found'};
    if (pi.rows[0].status !== 'SUCCEEDED') {
      return {refund: null, applied: false, reason: 'payment_not_refundable'};
    }
    if (String(pi.rows[0].currency_code).toUpperCase() !== currency) {
      return {refund: null, applied: false, reason: 'currency_mismatch'};
    }
    const summed = await client.query(
      `SELECT COALESCE(SUM(amount_minor),0)::text AS total FROM refunds
       WHERE payment_intent_id=$1 AND organization_id=$2 AND status IN ('PENDING','SUCCEEDED')`,
      [input.paymentIntentId, input.organizationId],
    );
    const already = BigInt(summed.rows[0].total);
    const capturable = BigInt(String(pi.rows[0].amount_minor));
    if (already + amount > capturable) {
      return {refund: null, applied: false, reason: 'exceeds_captured'};
    }

    const inserted = await client.query(
      `INSERT INTO refunds(
         organization_id, payment_intent_id, amount_minor, currency_code, status, reason,
         environment, provider_refund_ref, idempotency_key
       ) VALUES ($1,$2,$3,$4,'SUCCEEDED','provider_webhook',$5,$6,$7)
       RETURNING *`,
      [
        input.organizationId,
        input.paymentIntentId,
        input.amountMinor,
        currency,
        environment,
        input.providerRefundRef || `wh_${input.providerEventId}`,
        idem,
      ],
    );
    const refund = inserted.rows[0];
    await ledgerService.postRefundWithClient(client, {
      organizationId: input.organizationId,
      refundId: refund.id,
      amountMinor: input.amountMinor,
      currencyCode: currency,
      environment,
    });
    await writeAuditEvent(
      {
        organizationId: input.organizationId,
        action: 'refund.webhook_applied',
        resourceType: 'refund',
        resourceId: refund.id,
        after: {provider_event_id: input.providerEventId},
      },
      client,
    );
    return {refund, applied: true};
  },
};
