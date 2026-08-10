import {pgQuery, withPgTransaction} from '../infrastructure/db/postgres.js';
import {AppError, notFound} from '../foundation/errors.js';
import {emitOutboxEvent, writeAuditEvent} from '../foundation/audit.js';
import {nextBillingDate} from './billing-policy.js';
import {
  recordSubscriptionTransition,
  transitionSubscription,
  type SubscriptionStatus,
} from './subscription-state-machine.js';

export const subscriptionService = {
  async create(
    organizationId: string,
    input: {
      customerId: string;
      priceId: string;
      trialDays?: number;
      paymentMethodToken?: string | null;
      cancelAtPeriodEnd?: boolean;
      actorUserId?: string | null;
      requestId?: string;
    },
  ) {
    return withPgTransaction(async (client) => {
      const customer = await client.query(
        `SELECT * FROM customers WHERE id=$1 AND organization_id=$2 AND status='ACTIVE'`,
        [input.customerId, organizationId],
      );
      if (!customer.rows[0]) throw notFound('Customer not found', 'CUSTOMER_NOT_FOUND');

      const price = await client.query(
        `SELECT * FROM prices WHERE id=$1 AND organization_id=$2 AND status='ACTIVE'`,
        [input.priceId, organizationId],
      );
      if (!price.rows[0]) throw notFound('Price not found', 'PRICE_NOT_FOUND');

      const trialDays = Math.max(0, Number(input.trialDays || 0));
      const now = new Date();
      const periodStart = now;
      const periodEnd =
        trialDays > 0
          ? nextBillingDate(now, 'DAY', trialDays)
          : nextBillingDate(now, price.rows[0].interval_unit, Number(price.rows[0].interval_count));
      const status: SubscriptionStatus = trialDays > 0 ? 'TRIALING' : 'ACTIVE';
      const token = input.paymentMethodToken || customer.rows[0].default_payment_method_token || null;

      const r = await client.query(
        `INSERT INTO subscriptions (
           organization_id, customer_id, price_id, status, trial_days,
           current_period_start, current_period_end, next_billing_at,
           cancel_at_period_end, payment_method_token
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          organizationId,
          input.customerId,
          input.priceId,
          status,
          trialDays,
          periodStart.toISOString(),
          periodEnd.toISOString(),
          periodEnd.toISOString(),
          input.cancelAtPeriodEnd === true,
          token,
        ],
      );
      await client.query(
        `INSERT INTO subscription_items (organization_id, subscription_id, price_id, quantity)
         VALUES ($1,$2,$3,1)`,
        [organizationId, r.rows[0].id, input.priceId],
      );
      await recordSubscriptionTransition(client, {
        subscriptionId: r.rows[0].id,
        organizationId,
        fromStatus: null,
        toStatus: status,
        actorType: 'MERCHANT',
        actorUserId: input.actorUserId,
        reason: 'Subscription created',
      });
      await writeAuditEvent(
        {
          organizationId,
          actorUserId: input.actorUserId,
          action: 'subscription.created',
          resourceType: 'subscription',
          resourceId: r.rows[0].id,
          requestId: input.requestId,
        },
        client,
      );
      await emitOutboxEvent(
        {
          organizationId,
          eventType: 'billing.subscription.created',
          aggregateType: 'subscription',
          aggregateId: r.rows[0].id,
          payload: {
            subscription_id: r.rows[0].id,
            customer_id: input.customerId,
            price_id: input.priceId,
            status,
          },
          idempotencyKey: `subscription-created-${r.rows[0].id}`,
        },
        client,
      );
      return r.rows[0];
    });
  },

  async list(organizationId: string, limit = 50, offset = 0) {
    const r = await pgQuery(
      `SELECT s.*, p.currency_code, p.unit_amount_minor::text AS unit_amount_minor,
              p.interval_unit, p.interval_count, c.name AS customer_name, c.email AS customer_email
       FROM subscriptions s
       JOIN prices p ON p.id = s.price_id
       JOIN customers c ON c.id = s.customer_id
       WHERE s.organization_id=$1
       ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    );
    return r.rows;
  },

  async get(organizationId: string, subscriptionId: string) {
    const r = await pgQuery(
      `SELECT s.*, p.currency_code, p.unit_amount_minor::text AS unit_amount_minor,
              p.interval_unit, p.interval_count
       FROM subscriptions s
       JOIN prices p ON p.id = s.price_id
       WHERE s.id=$1 AND s.organization_id=$2`,
      [subscriptionId, organizationId],
    );
    if (!r.rows[0]) throw notFound('Subscription not found', 'SUBSCRIPTION_NOT_FOUND');
    return r.rows[0];
  },

  async pause(organizationId: string, subscriptionId: string, actorUserId?: string | null) {
    return withPgTransaction(async (client) => {
      const r = await client.query(`SELECT * FROM subscriptions WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [
        subscriptionId,
        organizationId,
      ]);
      if (!r.rows[0]) throw notFound('Subscription not found', 'SUBSCRIPTION_NOT_FOUND');
      const updated = await transitionSubscription(
        client,
        r.rows[0],
        'PAUSED',
        {type: 'MERCHANT', userId: actorUserId},
        'Paused by merchant',
      );
      await writeAuditEvent(
        {
          organizationId,
          actorUserId,
          action: 'subscription.paused',
          resourceType: 'subscription',
          resourceId: subscriptionId,
          after: {status: 'PAUSED'},
        },
        client,
      );
      await emitOutboxEvent(
        {
          organizationId,
          eventType: 'billing.subscription.updated',
          aggregateType: 'subscription',
          aggregateId: subscriptionId,
          payload: {subscription_id: subscriptionId, status: 'PAUSED'},
        },
        client,
      );
      return updated;
    });
  },

  async resume(organizationId: string, subscriptionId: string, actorUserId?: string | null) {
    return withPgTransaction(async (client) => {
      const r = await client.query(`SELECT * FROM subscriptions WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [
        subscriptionId,
        organizationId,
      ]);
      if (!r.rows[0]) throw notFound('Subscription not found', 'SUBSCRIPTION_NOT_FOUND');
      if (r.rows[0].status !== 'PAUSED') {
        throw new AppError('SUBSCRIPTION_NOT_PAUSED', 'Only PAUSED subscriptions can be resumed', 409);
      }
      const updated = await transitionSubscription(
        client,
        r.rows[0],
        'ACTIVE',
        {type: 'MERCHANT', userId: actorUserId},
        'Resumed by merchant',
      );
      await writeAuditEvent(
        {
          organizationId,
          actorUserId,
          action: 'subscription.resumed',
          resourceType: 'subscription',
          resourceId: subscriptionId,
          after: {status: 'ACTIVE'},
        },
        client,
      );
      return updated;
    });
  },

  async cancel(
    organizationId: string,
    subscriptionId: string,
    input: {atPeriodEnd?: boolean; actorUserId?: string | null},
  ) {
    return withPgTransaction(async (client) => {
      const r = await client.query(`SELECT * FROM subscriptions WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [
        subscriptionId,
        organizationId,
      ]);
      if (!r.rows[0]) throw notFound('Subscription not found', 'SUBSCRIPTION_NOT_FOUND');
      const sub = r.rows[0];
      if (['CANCELLED', 'EXPIRED'].includes(sub.status)) {
        throw new AppError('SUBSCRIPTION_ALREADY_TERMINAL', `Subscription is ${sub.status}`, 409);
      }

      if (input.atPeriodEnd !== false && sub.cancel_at_period_end !== true) {
        // Default: cancel at period end — flag only; status unchanged until period ends
        const updated = await client.query(
          `UPDATE subscriptions
           SET cancel_at_period_end=TRUE, version=version+1, updated_at=NOW()
           WHERE id=$1 AND version=$2
           RETURNING *`,
          [subscriptionId, sub.version],
        );
        if (!updated.rows[0]) throw new AppError('SUBSCRIPTION_VERSION_CONFLICT', 'Concurrent modification', 409);
        await writeAuditEvent(
          {
            organizationId,
            actorUserId: input.actorUserId,
            action: 'subscription.cancel_at_period_end',
            resourceType: 'subscription',
            resourceId: subscriptionId,
          },
          client,
        );
        await emitOutboxEvent(
          {
            organizationId,
            eventType: 'billing.subscription.updated',
            aggregateType: 'subscription',
            aggregateId: subscriptionId,
            payload: {subscription_id: subscriptionId, cancel_at_period_end: true},
          },
          client,
        );
        return updated.rows[0];
      }

      const updated = await transitionSubscription(
        client,
        sub,
        'CANCELLED',
        {type: 'MERCHANT', userId: input.actorUserId},
        'Cancelled by merchant',
        ['cancelled_at=NOW()', 'next_billing_at=NULL', 'cancel_at_period_end=FALSE'],
      );
      await emitOutboxEvent(
        {
          organizationId,
          eventType: 'billing.subscription.cancelled',
          aggregateType: 'subscription',
          aggregateId: subscriptionId,
          payload: {subscription_id: subscriptionId, status: 'CANCELLED'},
          idempotencyKey: `subscription-cancelled-${subscriptionId}`,
        },
        client,
      );
      return updated;
    });
  },
};
