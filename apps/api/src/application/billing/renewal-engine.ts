import {pool, tx} from '../../infrastructure/db/mysql.js';
import {
  advanceSubscriptionPeriod,
  applyRenewalPaymentResult,
  canRetryRenewal,
  createRenewalInvoiceDraft,
  getRetryBackoffSeconds,
  isSubscriptionRenewalDue,
  type InvoiceDraft,
} from '../../domain/billing/index.js';
import type {PaymentProvider} from '../../domain/payments/provider.js';
import {LedgerService} from '../ledger/service.js';
import {outbox, uuid} from '../payments/shared.js';

export class SubscriptionBillingEngine {
  constructor(private readonly provider?: PaymentProvider, private readonly ledger = new LedgerService()) {}

  async attemptRenewalPayment(invoice: InvoiceDraft, paymentMethodToken?: string, attemptNumber = 1) {
    const provider = this.provider;
    if (!provider) {
      return {
        providerStatus: 'FAILED' as const,
        invoice,
        subscriptionStatus: 'PAST_DUE' as const,
        providerTransactionId: undefined,
        retryable: canRetryRenewal(attemptNumber, 3),
        retryAfterSeconds: getRetryBackoffSeconds(attemptNumber),
      };
    }

    const auth = await provider.authorize({
      amountMinor: invoice.totalMinor,
      currency: invoice.currency,
      reference: invoice.number,
      idempotencyKey: invoice.number,
      paymentMethodToken,
    });

    if (auth.status === 'REQUIRES_ACTION') {
      return {
        providerStatus: 'REQUIRES_ACTION' as const,
        providerTransactionId: auth.providerTransactionId,
        invoice,
        subscriptionStatus: 'PAST_DUE' as const,
        retryable: false,
        retryAfterSeconds: getRetryBackoffSeconds(attemptNumber),
      };
    }

    const capture = auth.status === 'SUCCEEDED'
      ? await provider.capture(auth.providerTransactionId, invoice.totalMinor, invoice.number)
      : null;

    const providerStatus = auth.status === 'SUCCEEDED' && capture?.status === 'SUCCEEDED'
      ? 'SUCCEEDED'
      : 'FAILED';

    const result = applyRenewalPaymentResult({
      invoice,
      providerStatus,
      subscriptionStatus: 'ACTIVE',
      paidAt: new Date(),
    });

    return {
      ...result,
      providerTransactionId: auth.providerTransactionId,
      retryable: providerStatus === 'FAILED' ? canRetryRenewal(attemptNumber, 3) : false,
      retryAfterSeconds: providerStatus === 'FAILED' ? getRetryBackoffSeconds(attemptNumber) : 0,
    };
  }

  async processDueSubscriptions(limit = 25, now = new Date()) {
    const [rows]: any = await pool.query(
      `SELECT s.id, s.tenant_id, s.merchant_id, s.customer_id, s.price_id, s.status,
              s.current_period_start, s.current_period_end, s.next_billing_at,
              p.currency, p.unit_amount_minor, p.interval_unit, p.interval_count
       FROM subscriptions s
       JOIN prices p ON p.id = s.price_id
       WHERE s.status IN ('ACTIVE', 'TRIALING', 'PAST_DUE')
         AND s.next_billing_at IS NOT NULL
         AND s.next_billing_at <= ?
       ORDER BY s.next_billing_at ASC
       LIMIT ?`,
      [now, limit]
    );

    const processed: Array<{ subscriptionId: string; invoiceId: string; invoiceNumber: string; status: string; nextBillingAt: Date; retryable?: boolean; retryAfterSeconds?: number }> = [];

    for (const subscription of rows) {
      if (!isSubscriptionRenewalDue(new Date(subscription.next_billing_at), now)) {
        continue;
      }

      const invoiceNumber = `INV-${Date.now()}-${subscription.id.slice(0, 8)}`;
      const invoiceId = uuid();

      const result = await tx(async (c) => {
        const invoice = createRenewalInvoiceDraft({
          tenantId: subscription.tenant_id,
          merchantId: subscription.merchant_id,
          customerId: subscription.customer_id,
          subscriptionId: subscription.id,
          priceId: subscription.price_id,
          currency: subscription.currency,
          amountMinor: subscription.unit_amount_minor,
          taxMinor: 0,
          invoiceNumber,
          subscriptionStart: new Date(subscription.current_period_start),
          subscriptionEnd: new Date(subscription.current_period_end),
          nextBillingAt: new Date(subscription.next_billing_at),
        });

        const paymentSessionId = invoiceId;
        const paymentAttemptId = uuid();
        const providerName = this.provider?.name || 'sandbox';

        await c.execute(
          `INSERT INTO invoices(id,tenant_id,merchant_id,customer_id,subscription_id,number,currency,subtotal_minor,tax_minor,total_minor,status,due_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            invoiceId,
            subscription.tenant_id,
            subscription.merchant_id,
            subscription.customer_id,
            subscription.id,
            invoice.number,
            invoice.currency,
            invoice.subtotalMinor.toString(),
            invoice.taxMinor.toString(),
            invoice.totalMinor.toString(),
            invoice.status,
            invoice.dueAt,
          ]
        );

        await c.execute(
          'INSERT INTO payment_attempts(id,tenant_id,payment_session_id,amount_minor,currency,status,payment_method_id,provider_id) VALUES(?,?,?,?,?,?,?,?)',
          [paymentAttemptId, subscription.tenant_id, paymentSessionId, invoice.totalMinor.toString(), invoice.currency, 'PENDING', null, providerName]
        );

        const [attemptRows]: any = await c.execute(
          'SELECT COUNT(*) AS attempt_count FROM payment_attempts WHERE tenant_id=? AND payment_session_id=?',
          [subscription.tenant_id, paymentSessionId]
        );
        const attemptNumber = Number(attemptRows[0]?.attempt_count || 0);

        const paymentResult = await this.attemptRenewalPayment(invoice, undefined, attemptNumber);
        const next = advanceSubscriptionPeriod({
          currentPeriodStart: new Date(subscription.current_period_start),
          currentPeriodEnd: new Date(subscription.current_period_end),
          nextBillingAt: new Date(subscription.next_billing_at),
          intervalUnit: subscription.interval_unit,
          intervalCount: subscription.interval_count,
        });
        const providerTransactionId = 'providerTransactionId' in paymentResult
          ? paymentResult.providerTransactionId
          : undefined;

        await c.execute(
          'UPDATE payment_attempts SET status=?,authorization_status=?,capture_status=?,provider_transaction_id=?,failure_code=?,failure_message=?,action_required_json=? WHERE id=?',
          [paymentResult.providerStatus === 'SUCCEEDED' ? 'SUCCEEDED' : paymentResult.providerStatus === 'REQUIRES_ACTION' ? 'REQUIRES_ACTION' : 'FAILED', paymentResult.providerStatus, paymentResult.providerStatus === 'SUCCEEDED' ? 'SUCCEEDED' : null, providerTransactionId || null, paymentResult.providerStatus === 'FAILED' ? 'renewal_failed' : null, paymentResult.providerStatus === 'FAILED' ? 'Renewal payment failed' : null, paymentResult.providerStatus === 'REQUIRES_ACTION' ? JSON.stringify({type: '3DS'}) : null, paymentAttemptId]
        );

        if (paymentResult.providerStatus === 'SUCCEEDED') {
          const paymentId = uuid();
          await c.execute(
            'INSERT INTO payments(id,tenant_id,merchant_id,customer_id,payment_session_id,payment_attempt_id,provider_id,amount_minor,fee_minor,currency,status,risk_status,provider_transaction_id,payment_method_id,reference,description,capture_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [paymentId, subscription.tenant_id, subscription.merchant_id, subscription.customer_id, paymentSessionId, paymentAttemptId, providerName, invoice.totalMinor.toString(), '0', invoice.currency, 'SUCCEEDED', 'LOW', providerTransactionId || invoice.number, null, invoice.number, `subscription renewal:${invoice.subscriptionId || invoice.number}`, 'CAPTURED']
          );
          await this.ledger.postPayment(c, subscription.tenant_id, paymentId, subscription.merchant_id, invoice.totalMinor.toString(), invoice.currency, '0');
        }

        const nextRetryAt = paymentResult.providerStatus === 'FAILED'
          ? new Date(Date.now() + Number(paymentResult.retryAfterSeconds || 0) * 1000)
          : next.nextBillingAt;

        const subscriptionStatus = paymentResult.providerStatus === 'SUCCEEDED'
          ? 'ACTIVE'
          : 'PAST_DUE';

        await c.execute(
          `UPDATE subscriptions
           SET status=?,
               current_period_start=?,
               current_period_end=?,
               next_billing_at=?
           WHERE id=? AND tenant_id=?`,
          [subscriptionStatus, paymentResult.providerStatus === 'SUCCEEDED' ? next.currentPeriodStart : new Date(subscription.current_period_start), paymentResult.providerStatus === 'SUCCEEDED' ? next.currentPeriodEnd : new Date(subscription.current_period_end), paymentResult.providerStatus === 'SUCCEEDED' ? next.nextBillingAt : nextRetryAt, subscription.id, subscription.tenant_id]
        );

        await outbox(
          c,
          subscription.tenant_id,
          paymentResult.providerStatus === 'SUCCEEDED' ? 'payment.succeeded' : 'payment.failed',
          'subscription',
          subscription.id,
          {
            invoiceId,
            invoiceNumber,
            subscriptionId: subscription.id,
            amountMinor: invoice.totalMinor.toString(),
            currency: invoice.currency,
            status: paymentResult.providerStatus,
            retryable: paymentResult.retryable,
            retryAfterSeconds: paymentResult.retryAfterSeconds,
          }
        );

        await outbox(
          c,
          subscription.tenant_id,
          'subscription.renewal.created',
          'subscription',
          subscription.id,
          {
            invoiceId,
            invoiceNumber,
            subscriptionId: subscription.id,
            amountMinor: invoice.totalMinor.toString(),
            currency: invoice.currency,
            status: paymentResult.providerStatus === 'SUCCEEDED' ? 'RENEWED' : 'PENDING_RETRY',
          }
        );

        return {
          subscriptionId: subscription.id,
          invoiceId,
          invoiceNumber,
          status: paymentResult.providerStatus === 'SUCCEEDED' ? 'RENEWED' : 'PENDING_RETRY',
          nextBillingAt: nextRetryAt,
          retryable: paymentResult.retryable,
          retryAfterSeconds: paymentResult.retryAfterSeconds,
        };
      });

      processed.push(result);
    }

    return processed;
  }
}
