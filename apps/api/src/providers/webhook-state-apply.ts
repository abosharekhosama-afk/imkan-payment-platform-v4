/**
 * Apply verified provider webhook events to Payment Intent state (BG-W1).
 * Idempotent: terminal intents are left unchanged; invalid transitions skipped.
 * On SUCCEEDED: posts ledger entry in the same DB transaction.
 * On refund.*: creates refund + compensating ledger entry (sandbox).
 */
import {emitOutboxEvent, writeAuditEvent} from '../foundation/audit.js';
import type {PgClient} from '../infrastructure/db/postgres.js';
import {
  type PaymentIntentStatus,
  transitionPaymentIntent,
} from '../payments/payment-state-machine.js';
import {ledgerService} from '../ledger/ledger-service.js';
import {refundsService} from '../refunds/refunds-service.js';

function isRefundEvent(eventType: string): boolean {
  return /refund/i.test(eventType);
}

function mapEventToStatus(eventType: string): PaymentIntentStatus | null {
  const t = eventType.toLowerCase();
  // Refund events must NOT be treated as payment.succeeded (substring "success").
  if (isRefundEvent(t)) return null;
  if (/(succeeded|captured|paid|success)/.test(t)) return 'SUCCEEDED';
  if (/(failed|declined|failure)/.test(t)) return 'FAILED';
  if (/(cancel)/.test(t)) return 'CANCELLED';
  return null;
}

export async function applyProviderWebhookToPaymentIntent(
  client: PgClient,
  input: {
    organizationId: string | null;
    paymentIntentId: string | null;
    eventType: string;
    providerEventId: string;
    providerReference?: string | null;
    amountMinor?: string | null;
    currencyCode?: string | null;
  },
): Promise<{applied: boolean; reason: string; status?: string}> {
  if (!input.paymentIntentId || !input.organizationId) {
    return {applied: false, reason: 'missing_payment_or_org'};
  }

  if (isRefundEvent(input.eventType)) {
    const pi = await client.query(
      `SELECT id, amount_minor, currency_code, status FROM payment_intents
       WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
      [input.paymentIntentId, input.organizationId],
    );
    if (!pi.rows[0]) return {applied: false, reason: 'payment_not_found'};
    const amountMinor = input.amountMinor || String(pi.rows[0].amount_minor);
    const currencyCode = (input.currencyCode || pi.rows[0].currency_code || 'SAR').toUpperCase();
    const result = await refundsService.applyProviderRefundEvent(client, {
      organizationId: input.organizationId,
      paymentIntentId: input.paymentIntentId,
      amountMinor,
      currency: currencyCode,
      providerEventId: input.providerEventId,
      providerRefundRef: input.providerReference,
    });
    return {
      applied: !!result.applied,
      reason: result.applied ? 'refund_applied' : result.reason || 'refund_not_applied',
      status: pi.rows[0].status,
    };
  }

  const target = mapEventToStatus(input.eventType);
  if (!target) return {applied: false, reason: 'unmapped_event_type'};

  const r = await client.query(
    `SELECT id, organization_id, status, version, amount_minor, currency_code
     FROM payment_intents WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
    [input.paymentIntentId, input.organizationId],
  );
  if (!r.rows[0]) return {applied: false, reason: 'payment_not_found'};

  const intent = r.rows[0] as {
    id: string;
    organization_id: string;
    status: PaymentIntentStatus;
    version: number;
    amount_minor: string;
    currency_code: string;
  };

  if (intent.status === target) return {applied: false, reason: 'already_in_target_status', status: intent.status};
  if (['SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(intent.status)) {
    return {applied: false, reason: 'terminal_status', status: intent.status};
  }

  let current = intent;
  if (current.status === 'CREATED' || current.status === 'REQUIRES_PAYMENT') {
    current = await transitionPaymentIntent(
      client,
      current,
      'PROCESSING',
      {type: 'PROVIDER'},
      `Webhook ${input.providerEventId} → PROCESSING`,
    );
  }
  if (current.status === 'PROCESSING' && (target === 'SUCCEEDED' || target === 'FAILED')) {
    const extraSets =
      target === 'SUCCEEDED'
        ? ['succeeded_at=NOW()']
        : target === 'FAILED'
          ? ['failed_at=NOW()', 'failure_code=$5', 'failure_message=$6']
          : [];
    const extraParams =
      target === 'FAILED' ? ['WEBHOOK_FAILED', `Provider webhook ${input.providerEventId}`] : [];
    const updated = await transitionPaymentIntent(
      client,
      current,
      target,
      {type: 'PROVIDER'},
      `Webhook ${input.providerEventId} → ${target}`,
      extraSets,
      extraParams,
    );
    if (target === 'SUCCEEDED') {
      await ledgerService.postPaymentSucceededWithClient(client, {
        organizationId: input.organizationId,
        paymentIntentId: input.paymentIntentId,
        amountMinor: String(intent.amount_minor),
        currencyCode: String(intent.currency_code),
        environment: 'SANDBOX',
      });
    }
    await writeAuditEvent(
      {
        organizationId: input.organizationId,
        action: 'payment.webhook_applied',
        resourceType: 'payment_intent',
        resourceId: input.paymentIntentId,
        after: {status: target, provider_event_id: input.providerEventId},
      },
      client,
    );
    await emitOutboxEvent(
      {
        organizationId: input.organizationId,
        eventType: target === 'SUCCEEDED' ? 'payment.succeeded' : 'payment.failed',
        aggregateType: 'payment_intent',
        aggregateId: input.paymentIntentId,
        payload: {
          payment_intent_id: input.paymentIntentId,
          status: target,
          provider_event_id: input.providerEventId,
        },
        idempotencyKey: `webhook-apply:${input.providerEventId}:${target}`,
      },
      client,
    );
    return {applied: true, reason: 'transitioned', status: updated.status};
  }

  return {applied: false, reason: 'no_applicable_transition', status: current.status};
}
