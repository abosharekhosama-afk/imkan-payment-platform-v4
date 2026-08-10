# P15.1-A — Financial Model Implementation

**Status:** Implemented + audited (`P15_1A_FINAL_AUDIT.md`)  
**Date:** 2026-08-10  
**Scope:** DEC-008 model, fee schedules, settlement draft eligibility/totals — **not** finalize/payout/ledger hardening

---

## What was implemented

1. **DEC-008 resolved** with platform+provider fees, bps+fixed, half-up, explicit periods, FX/tax deferred, reserves field only.  
2. **Central calc module** `finance/financial-model.ts` — single equation for net / fees / eligibility.  
3. **Fee schedules** table + service + API (`GET/POST /fee-schedules`, `POST /fee-schedules/preview`).  
4. **Settlement draft** uses eligible = captured − refunds; applies schedule; stores fee breakdown; anti-double-inclusion unique index + advisory lock.  
5. **Balance semantics** documented on API response.  
6. **Ledger account mapping plan** for P15.1-B (no finalize posting in A).

---

## Why

Replace hard-coded `fees = 0` with an extensible, testable financial model before settlement finalize and payout work.

---

## Schema changes (`029_p15_1a_financial_model.sql`)

| Object | Change |
|---|---|
| `fee_schedules` | New |
| `fee_schedule_lines` | New (bps + fixed_minor) |
| `settlements` | `provider_fees_minor`, `platform_fees_minor`, `reserves_minor`, `adjustments_minor`, `fee_schedule_id` |
| `settlement_lines` | `gross_minor`, `refunded_minor`, `net_minor`, `inclusion_active` |
| Unique index | `settlement_lines_pi_active_uq` on active PI inclusion |

`fees_minor` retained = provider + platform.

---

## Formulas

```text
eligible = captured - refunded(PENDING|SUCCEEDED)
platform_fee = half_up(gross * bps / 10000) + fixed
net = gross - provider_fees - platform_fees - reserves + adjustments
```

Rounding: **HALF_UP** (DEC-008.5).

Empty drafts (`gross = 0`) force fees/adjustments to 0 so a fixed fee schedule cannot create negative net.

---

## Ledger account mapping (plan for P15.1-B — not posted in A)

| Account | Used? | When | Direction | Operation |
|---|---|---|---|---|
| `pending_settlement` | **Yes (today)** | Payment success | DR | Capture recognition |
| `merchant_payable` | **Yes (today)** | Payment success | CR | Merchant liability |
| `merchant_payable` | **Yes (today)** | Refund success | DR | Reverse liability |
| `pending_settlement` | **Yes (today)** | Refund success | CR | Reverse asset |
| `platform_revenue` | **Planned B** | Settlement FINALIZE | CR (fee) | Platform fee recognition; DR `merchant_payable` |
| `cash_provider` | **Planned E** | Payout PAID | CR | Cash/outflow counterpart; DR `merchant_payable` |
| `refunds_expense` | **Unused** | — | — | Kept; optional alternate presentation later |

Typed constants: `LEDGER_ACCOUNT_CODES` / `LEDGER_POSTING_PLAN` in `financial-model.ts`.

---

## API impact

| Method | Path | Notes |
|---|---|---|
| GET | `/fee-schedules` | list org schedules |
| POST | `/fee-schedules` | upsert + step-up |
| POST | `/fee-schedules/preview` | fee preview |
| GET | `/settlements/:id` | detail + lines |
| POST | `/settlements` | optional `provider_fees_minor`, `adjustments_minor`, `environment` |
| GET | `/balances` | includes `semantics` |

---

## Tests

`tests/p15-1a-financial-model.test.ts` — unit (rounding, fees, eligible, net, currency) + PG (schedules, tenant isolation, settlement draft + double-inclusion).

---

## Internal Books

No Zoho. Event contract deferred to P15.1-G. Target consumer: **IMKAN Internal Books**.

---

## Known limitations

- Settlement finalize / ledger fee post → **P15.1-B/D**  
- reserved/settled balances still 0 → **P15.1-C/E**  
- Provider fee auto-import → not in A (manual `provider_fees_minor` on create)  
- Rolling reserves → deferred  
- FX → deferred  

---

## Next: P15.1-B — Ledger Hardening

Approved and implemented — see `P15_1B_LEDGER_HARDENING.md` / `P15_1B_FINAL_AUDIT.md`.
