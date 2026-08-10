# DEC-008 — Financial Model (Fees, Reserves, Cutoffs, Rounding, FX)

**Status:** **RESOLVED** (P15.1-A, 2026-08-10)  
**Product:** IMKAN Payments V4  
**Supersedes:** OPEN row for DEC-008 in historical trackers (history retained below)

---

## Summary

| Sub-decision | Resolution |
|---|---|
| DEC-008.1 Fee ownership | Platform + Provider fee fields (`platform_fees_minor`, `provider_fees_minor`) |
| DEC-008.2 Platform fee calc | Basis points + optional fixed minor; deterministic |
| DEC-008.3 Reserves | Field `reserves_minor` supported; rolling reserve **logic deferred** (value 0 in P15.1) |
| DEC-008.4 Cutoff | Explicit `period_start` / `period_end` only — no cron / provider file import |
| DEC-008.5 Rounding | **Half-up** on minor units after bps |
| DEC-008.6 FX | **Deferred** — single currency per settlement/payout; mismatch rejected |
| DEC-008.7 Taxes | **Deferred** to Internal Books — not in Payments Financial Core |

**FX is deferred, not forgotten.**

---

## Equation

```text
gross_minor
- provider_fees_minor
- platform_fees_minor
- reserves_minor
+ adjustments_minor
= net_minor
```

Aggregate compat field: `fees_minor = provider_fees_minor + platform_fees_minor`.

Eligibility per payment intent:

```text
eligible_minor = captured_minor - refunded_minor
  where refunded ∈ PENDING|SUCCEEDED
```

---

## Rejected

- Hard-coding `fees = 0` forever  
- Inventing FX rates  
- Tax engine in Payments  
- Zoho Books as accounting SoR (target = **IMKAN Internal Books** later)  
- Cron settlement schedules in P15.1-A  

---

## Evidence

- `apps/api/src/finance/financial-model.ts`  
- `apps/api/src/finance/fee-schedules-service.ts`  
- `database/migrations/postgres/029_p15_1a_financial_model.sql`  
- `docs/implementation/P15_1A_FINANCIAL_MODEL.md`  
- `docs/implementation/P15_1_FINANCIAL_INVARIANTS.md`  

---

## History

Previously OPEN (blocked fee/reserve/FX implementation). Closed for P15.1-A scope with FX/tax/reserves-logic explicitly deferred.
