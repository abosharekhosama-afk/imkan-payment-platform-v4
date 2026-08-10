/**
 * DEC-007 approved retry / grace policy (Phase 6).
 * Attempt 1 immediate; Attempt 2 after 5 minutes; Attempt 3 after 10 minutes.
 * Max 3 attempts. Grace 3 days after max retries → EXPIRED.
 */

export const MAX_COLLECTION_ATTEMPTS = 3;
export const GRACE_PERIOD_DAYS = 3;

/** Seconds to wait AFTER a failed attempt before the next attempt may run. */
export function retryDelaySecondsAfterAttempt(failedAttemptNumber: number): number {
  if (failedAttemptNumber <= 0) return 0;
  if (failedAttemptNumber === 1) return 5 * 60; // next (attempt 2) after 5 min
  if (failedAttemptNumber === 2) return 10 * 60; // next (attempt 3) after 10 min
  return 0; // no further attempts
}

export function canCollectAttempt(currentAttemptCount: number): boolean {
  return currentAttemptCount < MAX_COLLECTION_ATTEMPTS;
}

export function nextBillingDate(start: Date, intervalUnit: string, intervalCount: number): Date {
  const current = new Date(start.getTime());
  const unit = (intervalUnit || 'MONTH').toUpperCase();
  const n = Math.max(1, intervalCount);
  if (unit === 'DAY') current.setUTCDate(current.getUTCDate() + n);
  else if (unit === 'WEEK') current.setUTCDate(current.getUTCDate() + n * 7);
  else if (unit === 'MONTH') current.setUTCMonth(current.getUTCMonth() + n);
  else if (unit === 'YEAR') current.setUTCFullYear(current.getUTCFullYear() + n);
  else throw new Error('INTERVAL_UNIT_UNSUPPORTED');
  return current;
}

export function advanceSubscriptionPeriod(input: {
  currentPeriodEnd: Date;
  intervalUnit: string;
  intervalCount: number;
}) {
  const nextPeriodStart = new Date(input.currentPeriodEnd.getTime());
  const nextPeriodEnd = nextBillingDate(input.currentPeriodEnd, input.intervalUnit, input.intervalCount);
  return {
    currentPeriodStart: nextPeriodStart,
    currentPeriodEnd: nextPeriodEnd,
    nextBillingAt: nextPeriodEnd,
  };
}

export function graceUntilFrom(now: Date = new Date()): Date {
  const d = new Date(now.getTime());
  d.setUTCDate(d.getUTCDate() + GRACE_PERIOD_DAYS);
  return d;
}
