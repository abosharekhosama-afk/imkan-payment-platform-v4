import {AppError, conflict} from '../foundation/errors.js';
import type {PgClient} from '../infrastructure/db/postgres.js';

export type SubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'PAUSED'
  | 'CANCELLED'
  | 'UNPAID'
  | 'EXPIRED';

export const SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  TRIALING: ['ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED'],
  ACTIVE: ['PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED'],
  PAST_DUE: ['ACTIVE', 'UNPAID', 'PAUSED', 'CANCELLED', 'EXPIRED'],
  PAUSED: ['ACTIVE', 'CANCELLED', 'EXPIRED'],
  UNPAID: ['ACTIVE', 'EXPIRED', 'CANCELLED'],
  CANCELLED: [],
  EXPIRED: [],
};

/** Statuses eligible for renewal due processing (DEC-007). */
export const RENEWAL_ELIGIBLE_STATUSES: SubscriptionStatus[] = ['TRIALING', 'ACTIVE', 'PAST_DUE'];

export function assertSubscriptionTransition(from: SubscriptionStatus, to: SubscriptionStatus) {
  const allowed = SUBSCRIPTION_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw conflict(`Invalid subscription transition ${from} -> ${to}`, 'SUBSCRIPTION_INVALID_TRANSITION');
  }
}

export async function recordSubscriptionTransition(
  client: PgClient,
  input: {
    subscriptionId: string;
    organizationId: string;
    fromStatus: SubscriptionStatus | null;
    toStatus: SubscriptionStatus;
    actorType: 'MERCHANT' | 'CUSTOMER' | 'SYSTEM' | 'PROVIDER';
    actorUserId?: string | null;
    reason?: string;
  },
) {
  await client.query(
    `INSERT INTO subscription_transitions (
       subscription_id, organization_id, from_status, to_status, actor_user_id, actor_type, reason
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.subscriptionId,
      input.organizationId,
      input.fromStatus,
      input.toStatus,
      input.actorUserId || null,
      input.actorType,
      input.reason || null,
    ],
  );
}

export async function transitionSubscription(
  client: PgClient,
  sub: {id: string; organization_id: string; status: SubscriptionStatus; version: number},
  toStatus: SubscriptionStatus,
  actor: {type: 'MERCHANT' | 'CUSTOMER' | 'SYSTEM' | 'PROVIDER'; userId?: string | null},
  reason?: string,
  extraSets: string[] = [],
  extraParams: unknown[] = [],
) {
  assertSubscriptionTransition(sub.status, toStatus);
  const params: unknown[] = [sub.id, sub.status, sub.version, toStatus, ...extraParams];
  const r = await client.query(
    `UPDATE subscriptions
     SET status=$4, version=version+1, updated_at=NOW()${extraSets.length ? ', ' + extraSets.join(', ') : ''}
     WHERE id=$1 AND status=$2 AND version=$3
     RETURNING *`,
    params,
  );
  if (!r.rows[0]) {
    throw new AppError('SUBSCRIPTION_VERSION_CONFLICT', 'Subscription was modified concurrently', 409);
  }
  await recordSubscriptionTransition(client, {
    subscriptionId: sub.id,
    organizationId: sub.organization_id,
    fromStatus: sub.status,
    toStatus,
    actorType: actor.type,
    actorUserId: actor.userId,
    reason,
  });
  return r.rows[0];
}
