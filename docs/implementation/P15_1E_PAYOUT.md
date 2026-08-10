# P15.1-E — Payout (Sandbox Lifecycle)

**Status:** Implemented  
**Date:** 2026-08-10  
**Depends on:** P15.1-D  
**Out of scope:** Live payout rails, Zoho, FX

---

## Lifecycle

```text
PENDING → SUBMITTED → PAID
   │          │
   ├─ CANCELLED (PENDING only)
   └─ FAILED (PENDING or SUBMITTED)
```

Settlement must be **FINALIZED**. When SUM(PAID payouts) ≥ settlement net → settlement **PAID**.

---

## Rules

1. `payout_account_id` required — status **VERIFIED** or **ACTIVE**, currency match  
2. Amount ≤ remaining unpaid net (PENDING+SUBMITTED+PAID committed)  
3. Optional partial `amount_minor`; default = full remaining  
4. **mark-paid** posts ledger (`postPayoutPaid`) — DR merchant_payable / CR cash_provider  
5. Outbox: `payout.created`, `payout.submitted`, `payout.paid`, `payout.failed`, `payout.cancelled`

---

## APIs

| Method | Path | Step-up |
|---|---|---|
| GET | `/payouts/:id` | — |
| POST | `/payouts` | payouts.manage |
| POST | `/payouts/:id/submit` | payouts.submit |
| POST | `/payouts/:id/mark-paid` | payouts.mark_paid |
| POST | `/payouts/:id/fail` | payouts.fail |
| POST | `/payouts/:id/cancel` | payouts.cancel |

Create body: `{ settlement_id, payout_account_id, amount_minor? }`

---

## Migration

`032_p15_1e_payout_lifecycle.sql` — `submitted_at`, `paid_at`, `cancelled_at`, `failure_reason`

---

## Next: P15.1-F — Reconciliation

Only after explicit approval.
