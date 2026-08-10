import {describe, expect, it} from 'vitest';
import {
  assertSubscriptionTransition,
  SUBSCRIPTION_TRANSITIONS,
} from '../apps/api/src/billing/subscription-state-machine.js';
import {
  advanceSubscriptionPeriod,
  canCollectAttempt,
  graceUntilFrom,
  MAX_COLLECTION_ATTEMPTS,
  nextBillingDate,
  retryDelaySecondsAfterAttempt,
} from '../apps/api/src/billing/billing-policy.js';

describe('phase 6 billing state / DEC-007 policy', () => {
  it('allows ACTIVE -> PAST_DUE -> UNPAID -> EXPIRED', () => {
    expect(() => assertSubscriptionTransition('ACTIVE', 'PAST_DUE')).not.toThrow();
    expect(() => assertSubscriptionTransition('PAST_DUE', 'UNPAID')).not.toThrow();
    expect(() => assertSubscriptionTransition('UNPAID', 'EXPIRED')).not.toThrow();
  });

  it('rejects illegal transitions', () => {
    expect(() => assertSubscriptionTransition('CANCELLED', 'ACTIVE')).toThrow();
    expect(() => assertSubscriptionTransition('EXPIRED', 'ACTIVE')).toThrow();
  });

  it('defines terminal statuses with empty outbound edges', () => {
    expect(SUBSCRIPTION_TRANSITIONS.CANCELLED).toEqual([]);
    expect(SUBSCRIPTION_TRANSITIONS.EXPIRED).toEqual([]);
  });

  it('enforces max 3 collection attempts and DEC-007 backoff', () => {
    expect(MAX_COLLECTION_ATTEMPTS).toBe(3);
    expect(canCollectAttempt(0)).toBe(true);
    expect(canCollectAttempt(2)).toBe(true);
    expect(canCollectAttempt(3)).toBe(false);
    expect(retryDelaySecondsAfterAttempt(1)).toBe(5 * 60);
    expect(retryDelaySecondsAfterAttempt(2)).toBe(10 * 60);
    expect(retryDelaySecondsAfterAttempt(3)).toBe(0);
  });

  it('advances periods in UTC using interval', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const next = nextBillingDate(start, 'MONTH', 1);
    expect(next.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    const advanced = advanceSubscriptionPeriod({
      currentPeriodEnd: next,
      intervalUnit: 'MONTH',
      intervalCount: 1,
    });
    expect(advanced.currentPeriodStart.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(advanced.nextBillingAt.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('grace period is 3 days', () => {
    const now = new Date('2026-08-01T12:00:00.000Z');
    const g = graceUntilFrom(now);
    expect(g.toISOString()).toBe('2026-08-04T12:00:00.000Z');
  });
});
