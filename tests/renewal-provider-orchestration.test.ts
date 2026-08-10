import { describe, it, expect } from 'vitest';
import { SubscriptionBillingEngine } from '../apps/api/src/application/billing/renewal-engine.js';
import { createInvoiceDraft } from '../apps/api/src/domain/billing/index.js';
import type { PaymentProvider } from '../apps/api/src/domain/payments/provider.js';

const fakeProvider: PaymentProvider = {
  name: 'test-provider',
  async createPaymentMethod() {
    return { providerToken: 'pm_test_123', brand: 'VISA', last4: '4242', expMonth: 12, expYear: 2030 };
  },
  async authorize() {
    return { providerTransactionId: 'pt_123', status: 'SUCCEEDED' };
  },
  async capture() {
    return { providerTransactionId: 'pt_123', status: 'SUCCEEDED' };
  },
  async refund() {
    return { providerRefundId: 'pr_123', status: 'SUCCESS' };
  },
};

describe('renewal provider orchestration', () => {
  it('authorizes and captures a renewal invoice through the payment provider', async () => {
    const engine = new SubscriptionBillingEngine(fakeProvider);
    const invoice = createInvoiceDraft({
      tenantId: 'tenant_1',
      merchantId: 'merchant_1',
      customerId: 'customer_1',
      subscriptionId: 'sub_1',
      number: 'INV-4001',
      currency: 'USD',
      subtotalMinor: 9900,
      taxMinor: 990,
      dueAt: new Date('2026-02-01T00:00:00Z'),
    });

    const result = await engine.attemptRenewalPayment(invoice, 'pm_test_123');

    expect(result.providerStatus).toBe('SUCCEEDED');
    expect(result.invoice.status).toBe('PAID');
  });
});
