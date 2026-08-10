# P15.1-D — Settlement Lifecycle

**Status:** Implemented  
**Date:** 2026-08-10  
**Depends on:** P15.1-A/B/C  
**Does not include:** Payout lifecycle wiring (E), Live Provider, UI overhaul

---

## What was implemented

1. **`finalize`** — DRAFT → FINALIZED  
   - Recomputes totals from active lines + fee schedule  
   - Posts fee ledger (`settlement_finalize` journal)  
   - Sets `finalized_at` / `finalized_by`  
   - Outbox `settlement.finalized` + audit  
   - Idempotent when already FINALIZED  
   - Advisory lock + `FOR UPDATE`

2. **`cancel`** — DRAFT → CANCELLED  
   - Sets `inclusion_active=FALSE` (releases PIs)  
   - Outbox `settlement.cancelled` + audit  
   - FINALIZED → 409 `SETTLEMENT_IMMUTABLE`

3. **APIs**  
   - `POST /settlements/:id/finalize` — step-up `settlements.finalize`, idempotency `settlements.finalize`  
   - `POST /settlements/:id/cancel` — step-up `settlements.cancel`, idempotency `settlements.cancel`

4. **Payout guard** — `createFromSettlement` requires `status=FINALIZED`

5. **Balances (C updated in D)** — pending subtracts SUM(FINALIZED.gross_minor) per currency

6. **Migration `031`** — `finalized_at/by`, `cancelled_at/by`, status index

---

## Why

Complete settlement batch lifecycle before payout (E). Fees post on finalize; PIs locked until cancel/finalize.

---

## Schema (`031_p15_1d_settlement_lifecycle.sql`)

| Column | Purpose |
|---|---|
| `finalized_at` / `finalized_by` | Audit |
| `cancelled_at` / `cancelled_by` | Audit |

---

## Ledger on finalize

Uses P15.1-B `postSettlementFinalizeFeesWithClient` (DR payable / CR platform_revenue + cash_provider).  
Pending bucket cleared via balance formula (ledger pending − finalized gross), not a separate clearing journal.

---

## Known limitations

- No settlement PAID aggregate status transition (when all payouts paid)  
- No UI finalize/cancel flows beyond existing finance pages  
- Payout ledger on PAID still E  
- Rolling reserves still 0  

---

## Next: P15.1-E — Payout

Only after explicit approval.
