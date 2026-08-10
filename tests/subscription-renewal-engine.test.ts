import { describe, it, expect } from 'vitest';
import { SubscriptionBillingEngine } from '../apps/api/src/application/billing/renewal-engine.js';

describe('subscription billing engine', () => {
  it('builds a renewal processing contract for due subscriptions', async () => {
    const engine = new SubscriptionBillingEngine();
    const rows = await engine.processDueSubscriptions(1, new Date('2026-02-01T00:00:00Z'));

    expect(Array.isArray(rows)).toBe(true);
  });
});
