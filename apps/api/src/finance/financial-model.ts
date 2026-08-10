/**
 * P15.1-A — Central financial model (DEC-008).
 * Pure calculation helpers — single place for settlement totals / fee / eligibility.
 * No FX. No tax engine. Reserves supported as amount field (logic deferred).
 */
import {AppError} from '../foundation/errors.js';

export type RoundingMode = 'HALF_UP';

/** DEC-008.5 — half-up on integer minor units after bps multiplication. */
export function applyBpsHalfUp(amountMinor: bigint, basisPoints: number): bigint {
  if (basisPoints < 0 || !Number.isInteger(basisPoints)) {
    throw new AppError('INVALID_FEE_BPS', 'basis_points must be a non-negative integer', 400);
  }
  if (amountMinor < 0n) {
    throw new AppError('INVALID_AMOUNT', 'amount_minor must be non-negative', 400);
  }
  if (basisPoints === 0 || amountMinor === 0n) return 0n;
  // fee = round_half_up(amount * bps / 10_000)
  const numerator = amountMinor * BigInt(basisPoints);
  const denom = 10_000n;
  const q = numerator / denom;
  const r = numerator % denom;
  // half-up: remainder >= denom/2 → +1
  if (r * 2n >= denom) return q + 1n;
  return q;
}

export function computePlatformFeeMinor(input: {
  grossMinor: bigint;
  basisPoints: number;
  fixedMinor: bigint;
}): bigint {
  if (input.fixedMinor < 0n) {
    throw new AppError('INVALID_FEE_FIXED', 'fixed_minor must be non-negative', 400);
  }
  const bpsPart = applyBpsHalfUp(input.grossMinor, input.basisPoints);
  return bpsPart + input.fixedMinor;
}

/** Eligible settlement amount for one payment: captured − refunded (PENDING+SUCCEEDED). */
export function computeEligibleMinor(capturedMinor: bigint, refundedMinor: bigint): bigint {
  if (capturedMinor < 0n || refundedMinor < 0n) {
    throw new AppError('INVALID_AMOUNT', 'amounts must be non-negative', 400);
  }
  if (refundedMinor > capturedMinor) {
    throw new AppError('REFUND_EXCEEDS_CAPTURED', 'refunded exceeds captured', 422);
  }
  return capturedMinor - refundedMinor;
}

export type SettlementTotalsInput = {
  currencyCode: string;
  grossMinor: bigint;
  providerFeesMinor: bigint;
  platformFeesMinor: bigint;
  reservesMinor?: bigint;
  adjustmentsMinor?: bigint;
};

export type SettlementTotals = {
  currency_code: string;
  gross_minor: string;
  provider_fees_minor: string;
  platform_fees_minor: string;
  fees_minor: string; // provider + platform (compat aggregate)
  reserves_minor: string;
  adjustments_minor: string;
  net_minor: string;
};

/**
 * Canonical settlement equation (DEC-008):
 * net = gross - provider_fees - platform_fees - reserves + adjustments
 */
export function computeSettlementTotals(input: SettlementTotalsInput): SettlementTotals {
  const currency = String(input.currencyCode || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new AppError('INVALID_CURRENCY', 'currency_code must be ISO 4217 CHAR(3)', 400);
  }
  const reserves = input.reservesMinor ?? 0n;
  const adjustments = input.adjustmentsMinor ?? 0n;
  if (input.grossMinor < 0n) throw new AppError('INVALID_AMOUNT', 'gross_minor must be >= 0', 400);
  if (input.providerFeesMinor < 0n || input.platformFeesMinor < 0n || reserves < 0n) {
    throw new AppError('INVALID_FEE', 'fees and reserves must be >= 0', 400);
  }
  const fees = input.providerFeesMinor + input.platformFeesMinor;
  const net = input.grossMinor - fees - reserves + adjustments;
  if (net < 0n) {
    throw new AppError(
      'SETTLEMENT_NET_NEGATIVE',
      'Settlement net_minor would be negative',
      422,
      {
        gross_minor: input.grossMinor.toString(),
        provider_fees_minor: input.providerFeesMinor.toString(),
        platform_fees_minor: input.platformFeesMinor.toString(),
        reserves_minor: reserves.toString(),
        adjustments_minor: adjustments.toString(),
      },
    );
  }
  return {
    currency_code: currency,
    gross_minor: input.grossMinor.toString(),
    provider_fees_minor: input.providerFeesMinor.toString(),
    platform_fees_minor: input.platformFeesMinor.toString(),
    fees_minor: fees.toString(),
    reserves_minor: reserves.toString(),
    adjustments_minor: adjustments.toString(),
    net_minor: net.toString(),
  };
}

export function assertSameCurrency(expected: string, actual: string, field = 'currency_code'): void {
  const a = String(expected || '').trim().toUpperCase();
  const b = String(actual || '').trim().toUpperCase();
  if (a !== b) {
    throw new AppError('CURRENCY_MISMATCH', `${field} mismatch: expected ${a}, got ${b}`, 422, {
      expected: a,
      actual: b,
    });
  }
}

/** Account mapping reserved for P15.1-B posting (documentation + typed constants). */
export const LEDGER_ACCOUNT_CODES = {
  cash_provider: 'cash_provider',
  pending_settlement: 'pending_settlement',
  merchant_payable: 'merchant_payable',
  platform_revenue: 'platform_revenue',
  refunds_expense: 'refunds_expense',
} as const;

/**
 * Posting map (P15.1-B helpers live; settlement status transition remains P15.1-D):
 * - Payment SUCCEEDED: DR pending_settlement / CR merchant_payable (gross)
 * - Refund: DR merchant_payable / CR pending_settlement
 * - Settlement fee journal (source settlement_finalize): DR merchant_payable /
 *   CR platform_revenue (+ CR cash_provider for provider fees)
 * - Payout PAID helper: DR merchant_payable / CR cash_provider (status wiring = E)
 */
export const LEDGER_POSTING_PLAN = {
  payment_succeeded: {
    debit: LEDGER_ACCOUNT_CODES.pending_settlement,
    credit: LEDGER_ACCOUNT_CODES.merchant_payable,
    status: 'IMPLEMENTED',
  },
  refund_succeeded: {
    debit: LEDGER_ACCOUNT_CODES.merchant_payable,
    credit: LEDGER_ACCOUNT_CODES.pending_settlement,
    status: 'IMPLEMENTED',
  },
  settlement_finalize_fees: {
    debit: LEDGER_ACCOUNT_CODES.merchant_payable,
    credit_platform: LEDGER_ACCOUNT_CODES.platform_revenue,
    credit_provider: LEDGER_ACCOUNT_CODES.cash_provider,
    status: 'IMPLEMENTED_HELPER_P15_1_B',
  },
  payout_paid: {
    debit: LEDGER_ACCOUNT_CODES.merchant_payable,
    credit: LEDGER_ACCOUNT_CODES.cash_provider,
    status: 'IMPLEMENTED_P15_1_E',
  },
  refunds_expense: {
    note: 'Optional alternate refund presentation; current path uses payable/pending reversal',
    status: 'UNUSED',
  },
} as const;

export {BALANCE_FORMULAS, BALANCE_SEMANTICS} from './balances.js';
