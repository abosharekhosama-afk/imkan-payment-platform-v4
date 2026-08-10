import { describe, it, expect } from 'vitest';
import {
  createInvoiceDraft,
  markInvoicePaid,
  createBillingCycle,
  BillingCycleStatus,
} from '../apps/api/src/domain/billing/index.js';

describe('invoice and recurring billing domain', () => {
  it('creates an open invoice draft with calculated totals', () => {
    const invoice = createInvoiceDraft({
      tenantId: 'tenant_1',
      merchantId: 'merchant_1',
      customerId: 'customer_1',
      subscriptionId: 'sub_1',
      number: 'INV-1001',
      currency: 'USD',
      subtotalMinor: 9900,
      taxMinor: 990,
      dueAt: new Date('2026-02-01T00:00:00Z'),
    });

    expect(invoice.status).toBe('OPEN');
    expect(invoice.totalMinor).toBe(10890n);
  });

  it('marks invoice as paid and records paid timestamp', () => {
    const invoice = createInvoiceDraft({
      tenantId: 'tenant_1',
      merchantId: 'merchant_1',
      customerId: 'customer_1',
      subscriptionId: 'sub_1',
      number: 'INV-1002',
      currency: 'USD',
      subtotalMinor: 9900,
      taxMinor: 990,
      dueAt: new Date('2026-02-01T00:00:00Z'),
    });

    const paid = markInvoicePaid(invoice, new Date('2026-01-20T00:00:00Z'));
    expect(paid.status).toBe('PAID');
    expect(paid.paidAt).toBeTruthy();
  });

  it('creates a billing cycle for a recurring subscription', () => {
    const cycle = createBillingCycle({
      tenantId: 'tenant_1',
      subscriptionId: 'sub_1',
      invoiceNumber: 'INV-1003',
      amountMinor: 9900,
      currency: 'USD',
      taxMinor: 990,
      periodStart: new Date('2026-01-01T00:00:00Z'),
      periodEnd: new Date('2026-02-01T00:00:00Z'),
    });

    expect(cycle.status).toBe<BillingCycleStatus>('PENDING');
    expect(cycle.invoiceNumber).toBe('INV-1003');
    expect(cycle.totalMinor).toBe(10890n);
  });
});
