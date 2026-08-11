import {pgQuery, withPgTransaction} from '../infrastructure/db/postgres.js';
import {AppError} from '../foundation/errors.js';
import {emitOutboxEvent, writeSecurityEvent} from '../foundation/audit.js';
import {paymentCoreService} from '../payments/payment-core-service.js';
import {allowSandboxPaymentTokens} from '../platform/runtime-config.js';
import {assertProductionPaymentMethodAllowed} from '../platform/sandbox-token-guard.js';
import {
  advanceSubscriptionPeriod,
  canCollectAttempt,
  graceUntilFrom,
  MAX_COLLECTION_ATTEMPTS,
  retryDelaySecondsAfterAttempt,
} from './billing-policy.js';
import {RENEWAL_ELIGIBLE_STATUSES, transitionSubscription} from './subscription-state-machine.js';
import {config} from '../config.js';

function moneyInvoice(row: any) {
  if (!row) return row;
  return {
    ...row,
    subtotal_minor: String(row.subtotal_minor),
    tax_minor: String(row.tax_minor),
    total_minor: String(row.total_minor),
  };
}

async function ensureInvoiceForPeriod(client: any, sub: any, price: any) {
  const existing = await client.query(
    `SELECT * FROM invoices
     WHERE subscription_id=$1 AND period_start=$2 AND period_end=$3 AND status <> 'VOID'`,
    [sub.id, sub.current_period_start, sub.current_period_end],
  );
  if (existing.rows[0]) return existing.rows[0];

  const number = `INV-${sub.id.replace(/-/g, '').slice(0, 8)}-${Date.parse(sub.current_period_start)}`;
  const amount = String(price.unit_amount_minor);
  try {
    const inv = await client.query(
      `INSERT INTO invoices (
         organization_id, customer_id, subscription_id, number, status,
         currency_code, subtotal_minor, tax_minor, total_minor,
         period_start, period_end, due_at
       ) VALUES ($1,$2,$3,$4,'OPEN',$5,$6,0,$6,$7,$8,$8)
       RETURNING *`,
      [
        sub.organization_id,
        sub.customer_id,
        sub.id,
        number,
        price.currency_code,
        amount,
        sub.current_period_start,
        sub.current_period_end,
      ],
    );
    await client.query(
      `INSERT INTO invoice_items (
         organization_id, invoice_id, price_id, description, quantity, unit_amount_minor, amount_minor
       ) VALUES ($1,$2,$3,$4,1,$5,$5)`,
      [
        sub.organization_id,
        inv.rows[0].id,
        price.id,
        `Subscription renewal ${price.interval_unit}/${price.interval_count}`,
        amount,
      ],
    );
    await emitOutboxEvent(
      {
        organizationId: sub.organization_id,
        eventType: 'billing.invoice.created',
        aggregateType: 'invoice',
        aggregateId: inv.rows[0].id,
        payload: {
          invoice_id: inv.rows[0].id,
          subscription_id: sub.id,
          total_minor: amount,
          currency_code: price.currency_code,
        },
        idempotencyKey: `invoice-created-${inv.rows[0].id}`,
      },
      client,
    );
    return inv.rows[0];
  } catch (error: any) {
    if (error?.code === '23505') {
      const again = await client.query(
        `SELECT * FROM invoices
         WHERE subscription_id=$1 AND period_start=$2 AND period_end=$3 AND status <> 'VOID'`,
        [sub.id, sub.current_period_start, sub.current_period_end],
      );
      if (again.rows[0]) return again.rows[0];
    }
    throw error;
  }
}

export const renewalService = {
  /** Process grace expirations and cancel_at_period_end completions. */
  async processTerminalTransitions(limit = 50, organizationId?: string | null) {
    const now = new Date();
    const unpaid = organizationId
      ? await pgQuery(
          `SELECT * FROM subscriptions
           WHERE organization_id=$3 AND status='UNPAID' AND grace_until IS NOT NULL AND grace_until <= $1
           ORDER BY grace_until ASC
           LIMIT $2`,
          [now.toISOString(), limit, organizationId],
        )
      : await pgQuery(
          `SELECT * FROM subscriptions
           WHERE status='UNPAID' AND grace_until IS NOT NULL AND grace_until <= $1
           ORDER BY grace_until ASC
           LIMIT $2`,
          [now.toISOString(), limit],
        );
    for (const sub of unpaid.rows) {
      await withPgTransaction(async (client) => {
        const locked = await client.query(`SELECT * FROM subscriptions WHERE id=$1 FOR UPDATE`, [sub.id]);
        if (!locked.rows[0] || locked.rows[0].status !== 'UNPAID') return;
        await transitionSubscription(
          client,
          locked.rows[0],
          'EXPIRED',
          {type: 'SYSTEM'},
          'Grace period expired without payment',
          ['next_billing_at=NULL'],
        );
        await emitOutboxEvent(
          {
            organizationId: sub.organization_id,
            eventType: 'billing.subscription.expired',
            aggregateType: 'subscription',
            aggregateId: sub.id,
            payload: {subscription_id: sub.id, status: 'EXPIRED'},
            idempotencyKey: `subscription-expired-${sub.id}`,
          },
          client,
        );
      });
    }

    const cancelDue = organizationId
      ? await pgQuery(
          `SELECT * FROM subscriptions
           WHERE organization_id=$3
             AND cancel_at_period_end=TRUE
             AND status IN ('ACTIVE','TRIALING','PAST_DUE','PAUSED')
             AND current_period_end <= $1
           ORDER BY current_period_end ASC
           LIMIT $2`,
          [now.toISOString(), limit, organizationId],
        )
      : await pgQuery(
          `SELECT * FROM subscriptions
           WHERE cancel_at_period_end=TRUE
             AND status IN ('ACTIVE','TRIALING','PAST_DUE','PAUSED')
             AND current_period_end <= $1
           ORDER BY current_period_end ASC
           LIMIT $2`,
          [now.toISOString(), limit],
        );
    for (const sub of cancelDue.rows) {
      await withPgTransaction(async (client) => {
        const locked = await client.query(`SELECT * FROM subscriptions WHERE id=$1 FOR UPDATE`, [sub.id]);
        if (!locked.rows[0] || !locked.rows[0].cancel_at_period_end) return;
        if (['CANCELLED', 'EXPIRED'].includes(locked.rows[0].status)) return;
        await transitionSubscription(
          client,
          locked.rows[0],
          'CANCELLED',
          {type: 'SYSTEM'},
          'Cancelled at period end',
          ['cancelled_at=NOW()', 'next_billing_at=NULL', 'cancel_at_period_end=FALSE'],
        );
        await emitOutboxEvent(
          {
            organizationId: sub.organization_id,
            eventType: 'billing.subscription.cancelled',
            aggregateType: 'subscription',
            aggregateId: sub.id,
            payload: {subscription_id: sub.id, status: 'CANCELLED', reason: 'cancel_at_period_end'},
            idempotencyKey: `subscription-cancelled-period-${sub.id}`,
          },
          client,
        );
      });
    }
  },

  /**
   * Process due subscriptions.
   * When organizationId is provided, ONLY that tenant is processed (merchant-safe).
   * When omitted, processes all tenants — platform/worker use only.
   */
  async processDueSubscriptions(limit = 25, organizationId?: string | null) {
    await this.processTerminalTransitions(limit, organizationId);
    const now = new Date();
    const due = organizationId
      ? await pgQuery(
          `SELECT s.id
           FROM subscriptions s
           WHERE s.organization_id = $4
             AND s.status = ANY($1::text[])
             AND s.next_billing_at IS NOT NULL
             AND s.next_billing_at <= $2
             AND (s.next_retry_at IS NULL OR s.next_retry_at <= $2)
             AND s.cancel_at_period_end = FALSE
           ORDER BY s.next_billing_at ASC
           LIMIT $3`,
          [RENEWAL_ELIGIBLE_STATUSES, now.toISOString(), limit, organizationId],
        )
      : await pgQuery(
          `SELECT s.id
           FROM subscriptions s
           WHERE s.status = ANY($1::text[])
             AND s.next_billing_at IS NOT NULL
             AND s.next_billing_at <= $2
             AND (s.next_retry_at IS NULL OR s.next_retry_at <= $2)
             AND s.cancel_at_period_end = FALSE
           ORDER BY s.next_billing_at ASC
           LIMIT $3`,
          [RENEWAL_ELIGIBLE_STATUSES, now.toISOString(), limit],
        );

    const results: Array<Record<string, unknown>> = [];
    for (const row of due.rows) {
      try {
        results.push(await this.processOneSubscription(row.id));
      } catch (error: any) {
        results.push({subscription_id: row.id, error: error?.message || String(error)});
      }
    }
    return results;
  },

  async processOneSubscription(subscriptionId: string) {
    // Phase 1 inside TX: lock + invoice
    const prepared = await withPgTransaction(async (client) => {
      const locked = await client.query(`SELECT * FROM subscriptions WHERE id=$1 FOR UPDATE`, [subscriptionId]);
      const sub = locked.rows[0];
      if (!sub) throw new AppError('SUBSCRIPTION_NOT_FOUND', 'Subscription not found', 404);
      if (!RENEWAL_ELIGIBLE_STATUSES.includes(sub.status)) {
        return {skip: true as const, reason: 'status_not_eligible'};
      }
      if (sub.cancel_at_period_end) {
        return {skip: true as const, reason: 'cancel_at_period_end'};
      }
      const now = Date.now();
      if (!sub.next_billing_at || new Date(sub.next_billing_at).getTime() > now) {
        return {skip: true as const, reason: 'not_due'};
      }
      if (sub.next_retry_at && new Date(sub.next_retry_at).getTime() > now) {
        return {skip: true as const, reason: 'retry_not_due'};
      }

      const price = await client.query(`SELECT * FROM prices WHERE id=$1`, [sub.price_id]);
      if (!price.rows[0]) throw new AppError('PRICE_NOT_FOUND', 'Price missing', 404);

      const invoice = await ensureInvoiceForPeriod(client, sub, price.rows[0]);
      if (invoice.status === 'PAID') {
        // Period already paid — advance if still due on same period
        return {skip: true as const, reason: 'invoice_already_paid', invoice_id: invoice.id};
      }
      if (!canCollectAttempt(Number(invoice.collection_attempt_count))) {
        return {skip: true as const, reason: 'max_attempts', invoice_id: invoice.id};
      }
      if (invoice.next_retry_at && new Date(invoice.next_retry_at).getTime() > now) {
        return {skip: true as const, reason: 'invoice_retry_not_due', invoice_id: invoice.id};
      }

      const attemptNumber = Number(invoice.collection_attempt_count) + 1;
      const idempotencyKey = `billing-collect:${invoice.id}:${attemptNumber}`;
      return {
        skip: false as const,
        sub,
        price: price.rows[0],
        invoice,
        attemptNumber,
        idempotencyKey,
      };
    });

    if (prepared.skip) return prepared;

    const {sub, price, invoice, attemptNumber, idempotencyKey} = prepared;
    const token = sub.payment_method_token || (allowSandboxPaymentTokens() ? 'tok_billing_ok' : null);

    // Ambiguous prior attempt: query-before-retry — do not create a new charge blindly.
    // For sandbox, status lookup via router if provider_reference exists on last AMBIGUOUS attempt.
    if (attemptNumber > 1) {
      const last = await pgQuery(
        `SELECT * FROM billing_collection_attempts
         WHERE invoice_id=$1 AND attempt_number=$2`,
        [invoice.id, attemptNumber - 1],
      );
      if (last.rows[0]?.status === 'AMBIGUOUS' && last.rows[0].query_before_retry) {
        // Record that we are querying; sandbox getStatus for known refs
        // If still ambiguous, do not increment a new charge — leave for next cycle after delay
        // Phase 6 sandbox: treat AMBIGUOUS previous as requiring manual/ops — schedule retry without new authorize if same key would re-run
        // Policy: create next attempt only after backoff; still uses new attempt number + new idempotency key but Payment Core uses that key.
        // Query step: if previous provider_reference resolves SUCCEEDED, mark paid without new charge.
        if (last.rows[0].provider_reference) {
          const {providerRouter, resolvePaymentEnvironment} = await import('../providers/router.js');
          const resolved = await providerRouter.resolve({
            organizationId: sub.organization_id,
            environment: resolvePaymentEnvironment(),
            requiredCapability: 'payment.status',
          });
          const status = await providerRouter.run({
            resolved,
            operation: 'STATUS',
            idempotencyKey: `billing-status:${invoice.id}:${attemptNumber - 1}`,
            fn: () =>
              resolved.adapter.getStatus({
                organizationId: sub.organization_id,
                providerReference: last.rows[0].provider_reference,
              }),
          });
          if (status.status === 'SUCCEEDED') {
            return this.markInvoicePaidAndAdvance(sub.id, invoice.id, null, {
              recovered_from_ambiguous: true,
              provider_reference: last.rows[0].provider_reference,
            });
          }
        }
      }
    }

    if (!token) {
      throw new AppError(
        'PAYMENT_METHOD_REQUIRED',
        'Subscription renewal requires a stored payment method in production',
        422,
      );
    }
    assertProductionPaymentMethodAllowed(token);

    const collection = await paymentCoreService.collectForBilling(sub.organization_id, {
      amountMinor: String(price.unit_amount_minor),
      currencyCode: String(price.currency_code).trim(),
      customerEmail: null,
      description: `Invoice ${invoice.number}`,
      reference: invoice.number,
      paymentMethodToken: token,
      idempotencyKey,
      metadata: {invoice_id: invoice.id, subscription_id: sub.id, attempt_number: attemptNumber},
    });

    return withPgTransaction(async (client) => {
      const lockedSub = await client.query(`SELECT * FROM subscriptions WHERE id=$1 FOR UPDATE`, [sub.id]);
      const lockedInv = await client.query(`SELECT * FROM invoices WHERE id=$1 FOR UPDATE`, [invoice.id]);
      if (!lockedSub.rows[0] || !lockedInv.rows[0]) {
        throw new AppError('BILLING_STATE_MISSING', 'Subscription or invoice missing', 409);
      }

      await client.query(
        `INSERT INTO billing_collection_attempts (
           organization_id, invoice_id, subscription_id, payment_intent_id, attempt_number,
           status, provider_code, provider_reference, provider_transaction_id,
           failure_code, failure_message, query_before_retry, request_idempotency_key, metadata_json
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (organization_id, request_idempotency_key) DO NOTHING`,
        [
          sub.organization_id,
          invoice.id,
          sub.id,
          collection.intent?.id || null,
          attemptNumber,
          collection.status === 'SUCCEEDED' ? 'SUCCEEDED' : collection.status === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'FAILED',
          collection.provider_code || null,
          collection.provider_reference || null,
          collection.provider_transaction_id || null,
          collection.failure_code || null,
          collection.failure_message || null,
          collection.query_before_retry === true,
          idempotencyKey,
          JSON.stringify({payment_intent_id: collection.intent?.id}),
        ],
      );

      if (collection.status === 'SUCCEEDED') {
        await client.query(
          `UPDATE invoices
           SET status='PAID', paid_at=NOW(), payment_intent_id=$2,
               collection_attempt_count=$3, next_retry_at=NULL, updated_at=NOW()
           WHERE id=$1`,
          [invoice.id, collection.intent.id, attemptNumber],
        );
        const period = advanceSubscriptionPeriod({
          currentPeriodEnd: new Date(lockedSub.rows[0].current_period_end),
          intervalUnit: price.interval_unit,
          intervalCount: Number(price.interval_count),
        });
        let nextSub = lockedSub.rows[0];
        if (nextSub.status !== 'ACTIVE') {
          nextSub = await transitionSubscription(
            client,
            nextSub,
            'ACTIVE',
            {type: 'SYSTEM'},
            'Renewal payment succeeded',
          );
        }
        await client.query(
          `UPDATE subscriptions
           SET current_period_start=$2, current_period_end=$3, next_billing_at=$4,
               retry_count=0, next_retry_at=NULL, grace_until=NULL,
               version=version+1, updated_at=NOW()
           WHERE id=$1`,
          [
            sub.id,
            period.currentPeriodStart.toISOString(),
            period.currentPeriodEnd.toISOString(),
            period.nextBillingAt.toISOString(),
          ],
        );
        await emitOutboxEvent(
          {
            organizationId: sub.organization_id,
            eventType: 'billing.invoice.paid',
            aggregateType: 'invoice',
            aggregateId: invoice.id,
            payload: {
              invoice_id: invoice.id,
              subscription_id: sub.id,
              payment_intent_id: collection.intent.id,
            },
            idempotencyKey: `invoice-paid-${invoice.id}`,
          },
          client,
        );
        await emitOutboxEvent(
          {
            organizationId: sub.organization_id,
            eventType: 'billing.collection.succeeded',
            aggregateType: 'invoice',
            aggregateId: invoice.id,
            payload: {invoice_id: invoice.id, attempt_number: attemptNumber},
            idempotencyKey: `collection-succeeded-${invoice.id}-${attemptNumber}`,
          },
          client,
        );
        return {
          subscription_id: sub.id,
          invoice_id: invoice.id,
          status: 'SUCCEEDED',
          attempt_number: attemptNumber,
        };
      }

      // Failed or ambiguous
      const delay = retryDelaySecondsAfterAttempt(attemptNumber);
      const nextRetry =
        attemptNumber < MAX_COLLECTION_ATTEMPTS && delay > 0
          ? new Date(Date.now() + delay * 1000).toISOString()
          : null;
      const invStatus = attemptNumber >= MAX_COLLECTION_ATTEMPTS ? 'OVERDUE' : 'OPEN';

      await client.query(
        `UPDATE invoices
         SET status=$2, collection_attempt_count=$3, next_retry_at=$4,
             payment_intent_id=$5, updated_at=NOW()
         WHERE id=$1`,
        [invoice.id, invStatus, attemptNumber, nextRetry, collection.intent?.id || null],
      );

      let nextSub = lockedSub.rows[0];
      if (collection.status === 'AMBIGUOUS') {
        await writeSecurityEvent(
          {
            organizationId: sub.organization_id,
            eventType: 'billing.collection.ambiguous',
            success: false,
            metadata: {invoice_id: invoice.id, attempt_number: attemptNumber, query_before_retry: true},
          },
          client,
        );
        await emitOutboxEvent(
          {
            organizationId: sub.organization_id,
            eventType: 'billing.collection.ambiguous',
            aggregateType: 'invoice',
            aggregateId: invoice.id,
            payload: {invoice_id: invoice.id, attempt_number: attemptNumber, query_before_retry: true},
            idempotencyKey: `collection-ambiguous-${invoice.id}-${attemptNumber}`,
          },
          client,
        );
        // Keep PAST_DUE path similar to failure for subscription visibility
        if (nextSub.status === 'ACTIVE' || nextSub.status === 'TRIALING') {
          nextSub = await transitionSubscription(
            client,
            nextSub,
            'PAST_DUE',
            {type: 'SYSTEM'},
            'Ambiguous collection outcome — query before retry',
            ['retry_count=$5', 'next_retry_at=$6'],
            [attemptNumber, nextRetry],
          );
        } else {
          await client.query(
            `UPDATE subscriptions
             SET retry_count=$2, next_retry_at=$3, version=version+1, updated_at=NOW()
             WHERE id=$1`,
            [sub.id, attemptNumber, nextRetry],
          );
        }
        return {
          subscription_id: sub.id,
          invoice_id: invoice.id,
          status: 'AMBIGUOUS',
          query_before_retry: true,
          attempt_number: attemptNumber,
        };
      }

      // FAILED
      await emitOutboxEvent(
        {
          organizationId: sub.organization_id,
          eventType: 'billing.collection.failed',
          aggregateType: 'invoice',
          aggregateId: invoice.id,
          payload: {
            invoice_id: invoice.id,
            attempt_number: attemptNumber,
            failure_code: collection.failure_code,
          },
          idempotencyKey: `collection-failed-${invoice.id}-${attemptNumber}`,
        },
        client,
      );

      if (attemptNumber >= MAX_COLLECTION_ATTEMPTS) {
        const grace = graceUntilFrom();
        if (nextSub.status !== 'UNPAID') {
          const from = nextSub.status === 'PAST_DUE' || nextSub.status === 'ACTIVE' || nextSub.status === 'TRIALING'
            ? nextSub
            : nextSub;
          if (from.status === 'ACTIVE' || from.status === 'TRIALING') {
            nextSub = await transitionSubscription(
              client,
              from,
              'PAST_DUE',
              {type: 'SYSTEM'},
              'Renewal payment failed',
            );
          }
          if (nextSub.status === 'PAST_DUE') {
            nextSub = await transitionSubscription(
              client,
              nextSub,
              'UNPAID',
              {type: 'SYSTEM'},
              'Max collection attempts exhausted',
              ['retry_count=$5', 'next_retry_at=NULL', 'grace_until=$6', 'next_billing_at=NULL'],
              [attemptNumber, grace.toISOString()],
            );
          }
        }
        await client.query(
          `UPDATE invoices SET status='UNCOLLECTIBLE', updated_at=NOW() WHERE id=$1`,
          [invoice.id],
        );
        await emitOutboxEvent(
          {
            organizationId: sub.organization_id,
            eventType: 'billing.invoice.uncollectible',
            aggregateType: 'invoice',
            aggregateId: invoice.id,
            payload: {invoice_id: invoice.id, subscription_id: sub.id},
            idempotencyKey: `invoice-uncollectible-${invoice.id}`,
          },
          client,
        );
        return {
          subscription_id: sub.id,
          invoice_id: invoice.id,
          status: 'UNPAID',
          attempt_number: attemptNumber,
          grace_until: grace.toISOString(),
        };
      }

      if (nextSub.status === 'ACTIVE' || nextSub.status === 'TRIALING') {
        await transitionSubscription(
          client,
          nextSub,
          'PAST_DUE',
          {type: 'SYSTEM'},
          'Renewal payment failed',
          ['retry_count=$5', 'next_retry_at=$6'],
          [attemptNumber, nextRetry],
        );
      } else {
        await client.query(
          `UPDATE subscriptions
           SET retry_count=$2, next_retry_at=$3, version=version+1, updated_at=NOW()
           WHERE id=$1`,
          [sub.id, attemptNumber, nextRetry],
        );
      }
      await emitOutboxEvent(
        {
          organizationId: sub.organization_id,
          eventType: 'billing.subscription.past_due',
          aggregateType: 'subscription',
          aggregateId: sub.id,
          payload: {subscription_id: sub.id, invoice_id: invoice.id, attempt_number: attemptNumber},
          idempotencyKey: `subscription-past-due-${sub.id}-${attemptNumber}`,
        },
        client,
      );
      return {
        subscription_id: sub.id,
        invoice_id: invoice.id,
        status: 'PAST_DUE',
        attempt_number: attemptNumber,
        next_retry_at: nextRetry,
      };
    });
  },

  async markInvoicePaidAndAdvance(
    subscriptionId: string,
    invoiceId: string,
    paymentIntentId: string | null,
    meta: Record<string, unknown>,
  ) {
    return withPgTransaction(async (client) => {
      const subR = await client.query(`SELECT * FROM subscriptions WHERE id=$1 FOR UPDATE`, [subscriptionId]);
      const invR = await client.query(`SELECT * FROM invoices WHERE id=$1 FOR UPDATE`, [invoiceId]);
      const price = await client.query(`SELECT * FROM prices WHERE id=$1`, [subR.rows[0].price_id]);
      await client.query(
        `UPDATE invoices SET status='PAID', paid_at=NOW(), payment_intent_id=COALESCE($2, payment_intent_id),
            next_retry_at=NULL, updated_at=NOW() WHERE id=$1`,
        [invoiceId, paymentIntentId],
      );
      let sub = subR.rows[0];
      if (sub.status !== 'ACTIVE') {
        sub = await transitionSubscription(client, sub, 'ACTIVE', {type: 'SYSTEM'}, 'Recovered paid invoice');
      }
      const period = advanceSubscriptionPeriod({
        currentPeriodEnd: new Date(sub.current_period_end),
        intervalUnit: price.rows[0].interval_unit,
        intervalCount: Number(price.rows[0].interval_count),
      });
      await client.query(
        `UPDATE subscriptions
         SET current_period_start=$2, current_period_end=$3, next_billing_at=$4,
             retry_count=0, next_retry_at=NULL, grace_until=NULL, version=version+1, updated_at=NOW()
         WHERE id=$1`,
        [
          subscriptionId,
          period.currentPeriodStart.toISOString(),
          period.currentPeriodEnd.toISOString(),
          period.nextBillingAt.toISOString(),
        ],
      );
      await emitOutboxEvent(
        {
          organizationId: sub.organization_id,
          eventType: 'billing.invoice.paid',
          aggregateType: 'invoice',
          aggregateId: invoiceId,
          payload: {invoice_id: invoiceId, ...meta},
          idempotencyKey: `invoice-paid-${invoiceId}`,
        },
        client,
      );
      return {subscription_id: subscriptionId, invoice_id: invoiceId, status: 'SUCCEEDED', ...meta};
    });
  },

  async listInvoices(organizationId: string, limit = 50, offset = 0) {
    const r = await pgQuery(
      `SELECT * FROM invoices WHERE organization_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    );
    return r.rows.map(moneyInvoice);
  },

  async getInvoice(organizationId: string, invoiceId: string) {
    const r = await pgQuery(`SELECT * FROM invoices WHERE id=$1 AND organization_id=$2`, [
      invoiceId,
      organizationId,
    ]);
    if (!r.rows[0]) throw new AppError('INVOICE_NOT_FOUND', 'Invoice not found', 404);
    const items = await pgQuery(`SELECT * FROM invoice_items WHERE invoice_id=$1`, [invoiceId]);
    return {invoice: moneyInvoice(r.rows[0]), items: items.rows};
  },

  async collectInvoiceNow(organizationId: string, invoiceId: string) {
    const inv = await pgQuery(`SELECT * FROM invoices WHERE id=$1 AND organization_id=$2`, [
      invoiceId,
      organizationId,
    ]);
    if (!inv.rows[0]) throw new AppError('INVOICE_NOT_FOUND', 'Invoice not found', 404);
    if (!inv.rows[0].subscription_id) {
      throw new AppError('INVOICE_NOT_RENEWAL', 'Only subscription invoices can be collected here', 400);
    }
    // Force due by clearing next_retry for manual collect
    await pgQuery(`UPDATE invoices SET next_retry_at=NULL WHERE id=$1`, [invoiceId]);
    await pgQuery(
      `UPDATE subscriptions SET next_retry_at=NULL, next_billing_at=LEAST(next_billing_at, NOW()) WHERE id=$1`,
      [inv.rows[0].subscription_id],
    );
    return this.processOneSubscription(inv.rows[0].subscription_id);
  },
};

export class BillingRenewalWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start() {
    if (this.timer) return;
    const ms = Number(process.env.BILLING_RENEWAL_WORKER_INTERVAL_MS || config.renewalWorkerIntervalMs || 5000);
    this.timer = setInterval(() => void this.tick(), ms);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await renewalService.processDueSubscriptions(25);
    } catch {
      // Worker must not crash the process
    } finally {
      this.running = false;
    }
  }
}

export const billingRenewalWorker = new BillingRenewalWorker();
