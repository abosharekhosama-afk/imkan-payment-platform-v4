/**
 * P15.1-C — Balance derivation (Financial Core SoT).
 * Never compute merchant balances in the frontend.
 *
 * Until settlement FINALIZE (P15.1-D) reclassifies pending vs available more tightly,
 * pending/available remain ledger-account nets. Settled is cumulative payout journals.
 * Reserved stays 0 per DEC-008.3 unless FINALIZED settlements carry reserves_minor.
 */
export const BALANCE_FORMULAS = {
  pending:
    'max(0, ledger pending_settlement net − SUM(FINALIZED settlements.gross_minor) per currency)',
  available:
    'max(0, −SUM(DEBIT−CREDIT) on ledger_accounts.code = merchant_payable for org/env/currency)',
  reserved:
    'SUM(settlements.reserves_minor) WHERE status = FINALIZED (0 while DEC-008.3 reserve logic deferred)',
  settled:
    'SUM(ledger_entries.amount_minor) DEBIT merchant_payable on journals source_type = payout',
} as const;

export const BALANCE_SEMANTICS = {
  pending:
    'Captured funds not yet in a FINALIZED settlement: ledger pending_settlement net minus FINALIZED settlement gross.',
  available:
    'Remaining merchant payable claim after fees/adjustments; finalized net is eligible for payout (P15.1-E).',
  reserved:
    'Rolling reserves deferred (DEC-008.3). Value is SUM(FINALIZED.reserves_minor); currently 0.',
  settled: 'Cumulative amount successfully paid out (payout ledger journals).',
} as const;

export type CurrencyBalance = {
  currency_code: string;
  available_minor: string;
  pending_minor: string;
  reserved_minor: string;
  settled_minor: string;
};

export function floorNonNegativeMinor(value: bigint): string {
  return value < 0n ? '0' : value.toString();
}

export function deriveAvailableFromPayableNet(payableNetDebitMinusCredit: bigint): string {
  // payable liability is CREDIT-normal: remaining claim = −net(DEBIT−CREDIT)
  return floorNonNegativeMinor(-payableNetDebitMinusCredit);
}

export function derivePendingMinor(input: {
  pendingSettlementNet: bigint;
  finalizedGrossMinor: bigint;
}): string {
  const adjusted = input.pendingSettlementNet - input.finalizedGrossMinor;
  return floorNonNegativeMinor(adjusted);
}

export function derivePendingFromPendingSettlementNet(pendingNetDebitMinusCredit: bigint): string {
  return floorNonNegativeMinor(pendingNetDebitMinusCredit);
}

export function pickPrimaryCurrency(
  currencies: string[],
  preferred?: string | null,
  activityScore?: Record<string, bigint>,
): string {
  const pref = preferred?.toUpperCase();
  if (pref && /^[A-Z]{3}$/.test(pref) && currencies.includes(pref)) return pref;
  if (activityScore) {
    let best: string | null = null;
    let bestScore = -1n;
    for (const c of currencies) {
      const score = activityScore[c] ?? 0n;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best && bestScore > 0n) return best;
  }
  if (currencies.includes('SAR')) return 'SAR';
  return currencies[0] || 'SAR';
}

export function buildCurrencyBalance(input: {
  currencyCode: string;
  pendingSettlementNet: bigint;
  merchantPayableNet: bigint;
  finalizedGrossMinor: bigint;
  reservedMinor: bigint;
  settledMinor: bigint;
}): CurrencyBalance {
  return {
    currency_code: input.currencyCode,
    pending_minor: derivePendingMinor({
      pendingSettlementNet: input.pendingSettlementNet,
      finalizedGrossMinor: input.finalizedGrossMinor,
    }),
    available_minor: deriveAvailableFromPayableNet(input.merchantPayableNet),
    reserved_minor: floorNonNegativeMinor(input.reservedMinor),
    settled_minor: floorNonNegativeMinor(input.settledMinor),
  };
}
