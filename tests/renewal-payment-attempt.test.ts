import { describe, it, expect } from 'vitest';
import {
  applyRenewalPaymentResult,
  createInvoiceDraft,
  type InvoiceDraft,
  type SubscriptionStatus,
} from '../apps/api/src/domain/billing/index.js';

describe('renewal payment attempt state transitions', () => {
  it('marks the invoice paid and keeps the subscription active on provider success', () => {
    const invoice = createInvoiceDraft({
      tenantId: 'tenant_1',
      merchantId: 'merchant_1',
      customerId: 'customer_1',
      subscriptionId: 'sub_1',
      number: 'INV-3001',
      currency: 'USD',
      subtotalMinor: 9900,
      taxMinor: 990,
      dueAt: new Date('2026-02-01T00:00:00Z'),
    });

    const result = applyRenewalPaymentResult({
      invoice,
      providerStatus: 'SUCCEEDED',
      subscriptionStatus: 'ACTIVE',
      paidAt: new Date('2026-02-01T00:00:00Z'),
    });

    expect(result.invoice.status).toBe('PAID');
    expect(result.subscriptionStatus).toBe<SubscriptionStatus>('ACTIVE');
  });

  it('marks the subscription past-due when provider authorization fails', () => {
    const invoice = createInvoiceDraft({
      tenantId: 'tenant_1',
      merchantId: 'merchant_1',
      customerId: 'customer_1',
      subscriptionId: 'sub_1',
      number: 'INV-3002',
      currency: 'USD',
      subtotalMinor: 9900,
      taxMinor: 990,
      dueAt: new Date('2026-02-01T00:00:00Z'),
    });

    const result = applyRenewalPaymentResult({
      invoice,
      providerStatus: 'FAILED',
      subscriptionStatus: 'ACTIVE',
      paidAt: new Date('2026-02-01T00:00:00Z'),
    });

    expect(result.invoice.status).toBe('OPEN');
    expect(result.subscriptionStatus).toBe<SubscriptionStatus>('PAST_DUE');
  });
});
