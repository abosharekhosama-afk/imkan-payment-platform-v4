/**
 * Apply Stripe operational webhooks (disputes, Radar, payout notices)
 * without changing Payment Core capture/ledger transitions.
 */
import {emitOutboxEvent, writeAuditEvent} from '../../foundation/audit.js';
import type {PgClient} from '../../infrastructure/db/postgres.js';
import {isStripeAuxiliaryEvent} from './mappers.js';

function mapDisputeStatus(stripeStatus: string | undefined): 'OPEN' | 'EVIDENCE_REQUIRED' | 'WON' | 'LOST' | 'CANCELLED' {
  const s = String(stripeStatus || '').toLowerCase();
  if (s === 'won') return 'WON';
  if (s === 'lost') return 'LOST';
  if (s === 'warning_closed' || s === 'prevented' || s === 'charge_refunded') return 'CANCELLED';
  if (s.includes('needs_response')) return 'EVIDENCE_REQUIRED';
  return 'OPEN';
}

export async function applyStripeAuxiliaryWebhook(
  client: PgClient,
  input: {
    organizationId: string | null;
    paymentIntentId: string | null;
    eventType: string;
    providerEventId: string;
    providerReference?: string | null;
    amountMinor?: string | null;
    currencyCode?: string | null;
    payload?: Record<string, unknown> | null;
  },
): Promise<{applied: boolean; reason: string}> {
  if (!isStripeAuxiliaryEvent(input.eventType)) {
    return {applied: false, reason: 'not_auxiliary'};
  }
  if (!input.organizationId) {
    return {applied: false, reason: 'missing_org'};
  }

  const obj = (input.payload?.stripe_object || input.payload?.data || input.payload || {}) as Record<string, unknown>;
  const type = input.eventType.toLowerCase();

  if (type.includes('dispute')) {
    const ref = String(obj.id || input.providerReference || input.providerEventId);
    const amount = input.amountMinor || String(obj.amount || '0');
    const currency = String(input.currencyCode || obj.currency || 'USD').toUpperCase().slice(0, 3);
    const status = mapDisputeStatus(typeof obj.status === 'string' ? obj.status : undefined);
    const reason = typeof obj.reason === 'string' ? obj.reason : input.eventType;
    const due =
      obj.evidence_details && typeof obj.evidence_details === 'object'
        ? Number((obj.evidence_details as {due_by?: number}).due_by)
        : NaN;
    const evidenceDue = Number.isFinite(due) && due > 0 ? new Date(due * 1000).toISOString() : null;

    const existing = await client.query(
      `SELECT id FROM disputes WHERE organization_id=$1 AND provider_dispute_ref=$2 LIMIT 1`,
      [input.organizationId, ref],
    );
    let disputeId: string;
    if (existing.rows[0]) {
      const updated = await client.query(
        `UPDATE disputes
         SET status=$3, reason=$4, amount_minor=$5, currency_code=$6, evidence_due_at=COALESCE($7::timestamptz, evidence_due_at),
             payment_intent_id=COALESCE($8::uuid, payment_intent_id), updated_at=NOW()
         WHERE id=$1 AND organization_id=$2
         RETURNING id`,
        [
          existing.rows[0].id,
          input.organizationId,
          status,
          reason,
          amount,
          currency,
          evidenceDue,
          input.paymentIntentId || null,
        ],
      );
      disputeId = updated.rows[0].id;
    } else {
      const inserted = await client.query(
        `INSERT INTO disputes(
           organization_id, payment_intent_id, amount_minor, currency_code, status, reason,
           provider_dispute_ref, evidence_due_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          input.organizationId,
          input.paymentIntentId || null,
          amount,
          currency,
          status,
          reason,
          ref,
          evidenceDue,
        ],
      );
      disputeId = inserted.rows[0].id;
    }
    await writeAuditEvent(
      {
        organizationId: input.organizationId,
        action: existing.rows[0] ? 'dispute.updated' : 'dispute.created',
        resourceType: 'dispute',
        resourceId: disputeId,
        after: {provider_event_id: input.providerEventId, status, reason},
      },
      client,
    );
    await emitOutboxEvent(
      {
        organizationId: input.organizationId,
        eventType: 'dispute.updated',
        aggregateType: 'dispute',
        aggregateId: disputeId,
        payload: {status, provider_event_id: input.providerEventId, stripe_event: input.eventType},
        idempotencyKey: `stripe-dispute:${input.providerEventId}`,
      },
      client,
    );
    return {applied: true, reason: existing.rows[0] ? 'dispute_updated' : 'dispute_created'};
  }

  if (type.startsWith('radar.') || type.includes('early_fraud')) {
    const decision = type.includes('fraud') ? 'REVIEW' : 'REVIEW';
    const inserted = await client.query(
      `INSERT INTO risk_signals(
         organization_id, payment_intent_id, signal_type, score, decision, details_json
       ) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [
        input.organizationId,
        input.paymentIntentId || null,
        input.eventType,
        null,
        decision,
        JSON.stringify({
          provider_event_id: input.providerEventId,
          provider_reference: input.providerReference,
          stripe_object_id: obj.id || null,
        }),
      ],
    );
    await writeAuditEvent(
      {
        organizationId: input.organizationId,
        action: 'risk.signal.created',
        resourceType: 'risk_signal',
        resourceId: inserted.rows[0].id,
        after: {signal_type: input.eventType, provider_event_id: input.providerEventId},
      },
      client,
    );
    return {applied: true, reason: 'risk_signal_created'};
  }

  if (type.startsWith('payout.') || type.startsWith('balance.')) {
    await emitOutboxEvent(
      {
        organizationId: input.organizationId,
        eventType: 'provider.payout.notice',
        aggregateType: 'provider_webhook_event',
        aggregateId: input.providerEventId,
        payload: {
          stripe_event: input.eventType,
          provider_reference: input.providerReference,
          amount_minor: input.amountMinor,
          currency_code: input.currencyCode,
          stripe_status: obj.status || null,
        },
        idempotencyKey: `stripe-payout:${input.providerEventId}`,
      },
      client,
    );
    return {applied: true, reason: 'payout_notice'};
  }

  return {applied: false, reason: 'unmapped_auxiliary'};
}
