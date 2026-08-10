import { describe, it, expect } from 'vitest';
import {
  canRetryRenewal,
  getRetryBackoffSeconds,
  isSubscriptionInGracePeriod,
} from '../apps/api/src/domain/billing/index.js';

describe('renewal retry and grace period', () => {
  it('allows retry while under the max retry budget', () => {
    expect(canRetryRenewal(1, 3)).toBe(true);
    expect(canRetryRenewal(3, 3)).toBe(false);
  });

  it('calculates exponential backoff for failed renewal attempts', () => {
    expect(getRetryBackoffSeconds(1)).toBe(300);
    expect(getRetryBackoffSeconds(2)).toBe(600);
  });

  it('marks a subscription in grace period while the grace window is still active', () => {
    const now = new Date('2026-02-04T00:00:00Z');
    const graceUntil = new Date('2026-02-07T00:00:00Z');

    expect(isSubscriptionInGracePeriod(now, graceUntil)).toBe(true);
  });
});
