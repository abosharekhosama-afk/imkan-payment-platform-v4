# P15.1-B — Ledger Hardening

**Status:** Implemented  
**Date:** 2026-08-10  
**Depends on:** P15.1-A  
**Does not include:** Settlement finalize/cancel APIs (D), balance reserved/settled completion (C), payout status machine (E)

---

## What was implemented

1. **Unique journal source** — partial unique index `ledger_journals_source_uq` on `(organization_id, source_type, source_id)` where both source fields are non-null (`030_p15_1b_ledger_hardening.sql`).
2. **Idempotent posting** — `postBalancedJournalIdempotent` uses SELECT → INSERT under **SAVEPOINT** so concurrent `23505` does not abort outer payment/refund transactions.
3. **Settlement fee helper** — `postSettlementFinalizeFees` / `WithClient`:
   - source `settlement_finalize` + settlement id
   - DR `merchant_payable` (platform + provider fees)
   - CR `platform_revenue` (platform)
   - CR `cash_provider` (provider)
   - skip when both fees = 0
4. **Payout paid helper** — `postPayoutPaid` / `WithClient` (source `payout` + payout id). Status wiring remains P15.1-E.
5. **Canonical source types** — `LEDGER_SOURCE_TYPES` exported from ledger service.
6. **DEC-008 note** updated on balances (`note` no longer claims fees blocked).

---

## Why

App-only SELECT-before-INSERT left a race for double money. B closes I4 at DB + service, and prepares fee/cash account usage before settlement finalize (D) and payout (E).

---

## Schema

| Object | Change |
|---|---|
| `ledger_journals_source_uq` | UNIQUE partial index |

No new tables. No account deletions.

---

## API impact

None required for B. Helpers are service-layer for D/E to call inside transactions.

---

## Tests

`tests/p15-1b-ledger-hardening.test.ts`

- Index present  
- Concurrent payment posts → one journal  
- Fee helper balanced + idempotent; uses `platform_revenue` / `cash_provider`  
- Zero-fee skip  
- Payout helper idempotent + concurrent collapse  
- Tenant listEntries isolation  
- SAVEPOINT idempotency inside shared TX  

---

## Known limitations

- Settlement **status** DRAFT→FINALIZED not wired (D).  
- `reserved_minor` / `settled_minor` still `0` (C/E).  
- Payout helper does not validate unpaid net or bank account (E).  
- `refunds_expense` still unused (intentional).  

---

## Next: P15.1-C — Balances

Approved and implemented — see `P15_1C_BALANCES.md` / `P15_1C_FINAL_AUDIT.md`.

## Next after C: P15.1-D — Settlement

Only after explicit approval.
