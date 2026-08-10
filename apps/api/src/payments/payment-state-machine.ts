import {conflict} from '../foundation/errors.js';
import type {PgClient} from '../infrastructure/db/postgres.js';

export type PaymentIntentStatus =
  | 'CREATED'
  | 'REQUIRES_PAYMENT'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

/**
 * Allowed transitions (Phase 4 brief + checkout-necessary extensions).
 * Core path: CREATED → REQUIRES_PAYMENT → PROCESSING → SUCCEEDED
 * Failure:   PROCESSING → FAILED
 * Cancel/expire from CREATED or REQUIRES_PAYMENT (checkout must be abortable).
 */
export const PAYMENT_INTENT_TRANSITIONS: Record<PaymentIntentStatus, PaymentIntentStatus[]> = {
  CREATED: ['REQUIRES_PAYMENT', 'CANCELLED', 'EXPIRED'],
  REQUIRES_PAYMENT: ['PROCESSING', 'CANCELLED', 'EXPIRED'],
  PROCESSING: ['SUCCEEDED', 'FAILED'],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function assertPaymentTransition(from: PaymentIntentStatus, to: PaymentIntentStatus) {
  if (!PAYMENT_INTENT_TRANSITIONS[from].includes(to)) {
    throw conflict(`Invalid payment transition ${from} → ${to}`, 'PAYMENT_INVALID_TRANSITION');
  }
}

export async function recordIntentTransition(
  client: PgClient,
  input: {
    paymentIntentId: string;
    organizationId: string;
    fromStatus: string | null;
    toStatus: string;
    actorUserId?: string | null;
    actorType: 'MERCHANT' | 'CUSTOMER' | 'SYSTEM' | 'PROVIDER';
    reason?: string | null;
  },
) {
  await client.query(
    `INSERT INTO payment_intent_transitions (
       payment_intent_id, organization_id, from_status, to_status, actor_user_id, actor_type, reason
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.paymentIntentId,
      input.organizationId,
      input.fromStatus,
      input.toStatus,
      input.actorUserId || null,
      input.actorType,
      input.reason || null,
    ],
  );
}

/**
 * Status+version guarded transition. Concurrent modification → 409.
 */
export async function transitionPaymentIntent(
  client: PgClient,
  intent: {id: string; organization_id: string; status: PaymentIntentStatus; version: number},
  toStatus: PaymentIntentStatus,
  actor: {userId?: string | null; type: 'MERCHANT' | 'CUSTOMER' | 'SYSTEM' | 'PROVIDER'},
  reason?: string,
  extraSets: string[] = [],
  extraParams: unknown[] = [],
) {
  assertPaymentTransition(intent.status, toStatus);
  const params: unknown[] = [intent.id, intent.status, intent.version, toStatus, ...extraParams];
  const r = await client.query(
    `UPDATE payment_intents
     SET status=$4, version=version+1, updated_at=NOW()${extraSets.length ? ', ' + extraSets.join(', ') : ''}
     WHERE id=$1 AND status=$2 AND version=$3
     RETURNING *`,
    params,
  );
  if (!r.rows[0]) {
    throw conflict('Payment intent was modified concurrently', 'PAYMENT_CONCURRENT_MODIFICATION');
  }
  await recordIntentTransition(client, {
    paymentIntentId: intent.id,
    organizationId: intent.organization_id,
    fromStatus: intent.status,
    toStatus,
    actorUserId: actor.userId,
    actorType: actor.type,
    reason: reason || null,
  });
  return r.rows[0];
}
