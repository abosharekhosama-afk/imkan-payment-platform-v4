# P15.1-C — Balances

**Status:** Implemented  
**Date:** 2026-08-10  
**Depends on:** P15.1-B  
**Does not include:** Settlement finalize (D), payout lifecycle (E)

---

## What was implemented

1. **Central balance module** `finance/balances.ts` — formulas, semantics, pure derivation helpers.
2. **`ledgerService.getBalances`** rewritten:
   - `pending` / `available` from ledger account nets (per currency)
   - `reserved` = SUM(`settlements.reserves_minor` WHERE `FINALIZED`) — **0** while DEC-008.3 deferred
   - `settled` = SUM of DEBIT `merchant_payable` on journals `source_type = payout`
   - Multi-currency `currencies[]` + primary selection
   - Returns `formulas`, `semantics`, `source: financial_core`, `phase: P15.1-C`
3. **API** `GET /balances?environment=&currency_code=` — Financial Core only; no browser math.
4. Light Balances page note showing phase/source.

---

## Why

`reserved`/`settled` were hard-coded `0`. Merchants need truthful settled after payout posts, and a stable contract before finalize (D).

---

## Formulas

```text
pending   = max(0, net DEBIT−CREDIT on pending_settlement)
available = max(0, −net DEBIT−CREDIT on merchant_payable)
reserved  = SUM(FINALIZED.reserves_minor)   # 0 until reserve logic
settled   = SUM(payout journal DEBIT merchant_payable)
```

No FX. Single-currency buckets; multi-currency listed separately.

---

## API contract

| Field | Type | Notes |
|---|---|---|
| `available_minor` | string | Primary currency |
| `pending_minor` | string | |
| `reserved_minor` | string | |
| `settled_minor` | string | |
| `currency_code` | CHAR(3) | Primary |
| `currencies` | array | All currencies with activity |
| `formulas` | object | Machine-readable |
| `semantics` | object | Human-readable |
| `source` | `financial_core` | |
| `phase` | `P15.1-C` | |

Query: `environment` (SANDBOX\|LIVE), `currency_code` (optional primary override).

---

## Known limitations

- Pending is **not** cleared on settlement finalize until **P15.1-D** posts clearing.
- Available is ledger payable remainder — after D may refine to FINALIZED unpaid net.
- Reserved stays 0 until reserve product logic.
- Payout status machine still E; settled uses B helper journals when posted.

---

## Next: P15.1-D — Settlement

Approved and implemented — see `P15_1D_SETTLEMENT.md` / `P15_1D_FINAL_AUDIT.md`.

## Next after D: P15.1-E — Payout

Only after explicit approval.
