import { describe, it, expect } from 'vitest';
import {
  createRenewalInvoiceDraft,
  createRenewalBillingCycle,
  advanceSubscriptionPeriod,
  isSubscriptionRenewalDue,
  type SubscriptionRenewalInput,
} from '../apps/api/src/domain/billing/index.js';

describe('subscription renewal engine', () => {
  it('marks a subscription as due when next billing date is in the past or now', () => {
    const due = isSubscriptionRenewalDue(new Date('2026-02-01T00:00:00Z'), new Date('2026-02-01T00:00:00Z'));
    expect(due).toBe(true);
  });

  it('creates a renewal invoice draft and pending cycle from the subscription price', () => {
    const input: SubscriptionRenewalInput = {
      tenantId: 'tenant_1',
      merchantId: 'merchant_1',
      customerId: 'customer_1',
      subscriptionId: 'sub_1',
      priceId: 'price_1',
      currency: 'USD',
      amountMinor: 9900,
      taxMinor: 990,
      invoiceNumber: 'INV-2001',
      subscriptionStart: new Date('2026-01-01T00:00:00Z'),
      subscriptionEnd: new Date('2026-02-01T00:00:00Z'),
      nextBillingAt: new Date('2026-02-01T00:00:00Z'),
    };

    const invoice = createRenewalInvoiceDraft(input);
    const cycle = createRenewalBillingCycle(input);

    expect(invoice.status).toBe('OPEN');
    expect(invoice.totalMinor).toBe(10890n);
    expect(cycle.status).toBe('PENDING');
    expect(cycle.totalMinor).toBe(10890n);
  });

  it('advances the subscription period after a successful renewal cycle', () => {
    const now = new Date('2026-02-01T00:00:00Z');
    const prevEnd = new Date('2026-02-01T00:00:00Z');
    const next = advanceSubscriptionPeriod({
      currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
      currentPeriodEnd: prevEnd,
      nextBillingAt: now,
      intervalUnit: 'MONTH',
      intervalCount: 1,
    });

    expect(next.currentPeriodStart.getTime()).toBe(new Date('2026-02-01T00:00:00Z').getTime());
    expect(next.currentPeriodEnd.getTime()).toBe(new Date('2026-03-01T00:00:00Z').getTime());
    expect(next.nextBillingAt.getTime()).toBe(new Date('2026-03-01T00:00:00Z').getTime());
  });
});
