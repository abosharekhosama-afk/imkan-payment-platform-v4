import {describe, expect, it} from 'vitest';
import {
  PAYMENT_INTENT_TRANSITIONS,
  assertPaymentTransition,
} from '../apps/api/src/payments/payment-state-machine.js';
import {AppError} from '../apps/api/src/foundation/errors.js';

describe('phase 4 payment intent state machine', () => {
  it('allows the happy path CREATED → REQUIRES_PAYMENT → PROCESSING → SUCCEEDED', () => {
    expect(() => assertPaymentTransition('CREATED', 'REQUIRES_PAYMENT')).not.toThrow();
    expect(() => assertPaymentTransition('REQUIRES_PAYMENT', 'PROCESSING')).not.toThrow();
    expect(() => assertPaymentTransition('PROCESSING', 'SUCCEEDED')).not.toThrow();
  });

  it('allows PROCESSING → FAILED and cancel/expire from CREATED/REQUIRES_PAYMENT', () => {
    expect(() => assertPaymentTransition('PROCESSING', 'FAILED')).not.toThrow();
    expect(() => assertPaymentTransition('CREATED', 'CANCELLED')).not.toThrow();
    expect(() => assertPaymentTransition('CREATED', 'EXPIRED')).not.toThrow();
    expect(() => assertPaymentTransition('REQUIRES_PAYMENT', 'CANCELLED')).not.toThrow();
    expect(() => assertPaymentTransition('REQUIRES_PAYMENT', 'EXPIRED')).not.toThrow();
  });

  it('rejects arbitrary and reverse transitions', () => {
    for (const bad of [
      ['SUCCEEDED', 'PROCESSING'],
      ['FAILED', 'SUCCEEDED'],
      ['CANCELLED', 'CREATED'],
      ['CREATED', 'SUCCEEDED'],
      ['CREATED', 'PROCESSING'],
      ['PROCESSING', 'CANCELLED'],
    ] as const) {
      expect(() => assertPaymentTransition(bad[0], bad[1])).toThrow(AppError);
    }
  });

  it('terminal states have empty outbound sets', () => {
    expect(PAYMENT_INTENT_TRANSITIONS.SUCCEEDED).toEqual([]);
    expect(PAYMENT_INTENT_TRANSITIONS.FAILED).toEqual([]);
    expect(PAYMENT_INTENT_TRANSITIONS.CANCELLED).toEqual([]);
    expect(PAYMENT_INTENT_TRANSITIONS.EXPIRED).toEqual([]);
  });
});
