/**
 * P17.1 — Per-payment fee accrual (unit).
 * Integration coverage for statement/fees routes lives in phase7-financial.test.ts when PG is required.
 */
import {describe, expect, it} from 'vitest';
import {AppError} from '../apps/api/src/foundation/errors.js';
import {computePaymentFeeAccrual} from '../apps/api/src/finance/financial-model.js';
import {preferredProviderCodes} from '../apps/api/src/providers/regional-routing.js';
import {payoutMarkPaidAllowed} from '../apps/api/src/finance/payout-rail/index.js';

describe('P17.1 fee accrual', () => {
  it('splits gross into platform fee, provider fee, and net', () => {
    const accrual = computePaymentFeeAccrual({
      grossMinor: 10000n,
      basisPoints: 250,
      fixedMinor: 50n,
      providerFeesMinor: 200n,
      feeScheduleId: 'sched-1',
    });
    expect(accrual.gross_minor).toBe('10000');
    expect(accrual.platform_fees_minor).toBe('300');
    expect(accrual.provider_fees_minor).toBe('200');
    expect(accrual.net_to_merchant_minor).toBe('9500');
    expect(accrual.fee_schedule_id).toBe('sched-1');
  });

  it('allows zero fees (net equals gross)', () => {
    const accrual = computePaymentFeeAccrual({
      grossMinor: 5000n,
      basisPoints: 0,
      fixedMinor: 0n,
    });
    expect(accrual.platform_fees_minor).toBe('0');
    expect(accrual.provider_fees_minor).toBe('0');
    expect(accrual.net_to_merchant_minor).toBe('5000');
  });

  it('rejects fees that exceed gross', () => {
    expect(() =>
      computePaymentFeeAccrual({
        grossMinor: 100n,
        basisPoints: 0,
        fixedMinor: 80n,
        providerFeesMinor: 30n,
      }),
    ).toThrow(AppError);
  });
});

describe('P17 regional routing', () => {
  it('prefers Palestine rails for ILS', () => {
    expect(preferredProviderCodes('ILS')[0]).toBe('bop');
  });

  it('prefers PayTabs for GCC currencies', () => {
    expect(preferredProviderCodes('SAR')[0]).toBe('paytabs');
    expect(preferredProviderCodes('AED')[0]).toBe('paytabs');
  });

  it('prefers Stripe for international cards', () => {
    expect(preferredProviderCodes('USD')[0]).toBe('stripe');
    expect(preferredProviderCodes('EUR')[0]).toBe('stripe');
  });
});

describe('P17 payout dual-control', () => {
  it('blocks mark-paid without approval and evidence', () => {
    expect(payoutMarkPaidAllowed({})).toBe(false);
    expect(payoutMarkPaidAllowed({platform_approved_at: '2026-08-13T00:00:00Z'})).toBe(false);
    expect(payoutMarkPaidAllowed({external_evidence_ref: 'bank-ref-1'})).toBe(false);
  });

  it('allows mark-paid after platform approval and evidence', () => {
    expect(
      payoutMarkPaidAllowed({
        platform_approved_at: '2026-08-13T00:00:00Z',
        external_evidence_ref: 'bank-ref-1',
      }),
    ).toBe(true);
  });
});
