import { describe, it, expect } from 'vitest';
import {
  parseProductInput,
  normalizePriceInput,
  createSubscriptionDraft,
  nextBillingDate,
  SubscriptionStatus,
} from '../apps/api/src/domain/billing/index.js';

describe('billing domain', () => {
  it('normalizes a product with sku and metadata', () => {
    const product = parseProductInput({
      name: 'Pro Plan',
      description: 'Monthly subscription',
      sku: 'PRO-01',
      type: 'SUBSCRIPTION',
      active: true,
      metadata: { region: 'SA' },
    });

    expect(product).toMatchObject({
      name: 'Pro Plan',
      status: 'ACTIVE',
      sku: 'PRO-01',
      type: 'SUBSCRIPTION',
      active: true,
      metadata: { region: 'SA' },
    });
  });

  it('rejects unsupported recurring interval on a price', () => {
    expect(() =>
      normalizePriceInput({
        currency: 'USD',
        unitAmountMinor: 9900,
        intervalUnit: 'FORTNIGHT',
        intervalCount: 1,
      })
    ).toThrow('INTERVAL_UNIT_UNSUPPORTED');
  });

  it('creates a trialing subscription draft when trial days are present', () => {
    const draft = createSubscriptionDraft({
      customerId: 'cust_123',
      merchantId: 'm_123',
      priceId: 'price_123',
      status: 'TRIALING',
      trialDays: 14,
      currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-01-15T00:00:00Z'),
      nextBillingAt: new Date('2026-01-15T00:00:00Z'),
    });

    expect(draft.status).toBe<SubscriptionStatus>('TRIALING');
    expect(draft.trialDays).toBe(14);
    expect(draft.cancelAtPeriodEnd).toBe(false);
  });

  it('computes the next billing date for month intervals', () => {
    const value = nextBillingDate(new Date('2026-01-01T00:00:00Z'), 'MONTH', 1);
    expect(value.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });
});
