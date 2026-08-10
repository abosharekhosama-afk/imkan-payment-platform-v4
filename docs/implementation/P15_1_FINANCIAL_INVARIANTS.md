# P15.1 — Financial Invariants

**Phase:** P15.1-A+  
**Date:** 2026-08-10  
**Money storage:** DEC-001 (`NUMERIC(30,0)` minor units + `currency CHAR(3)`)  
**Fee model:** DEC-008 RESOLVED (see `docs/decisions/DEC-008-FINANCIAL-MODEL.md`)

| ID | Invariant | DB | Service | TX | API | Test |
|---|---|---|---|---|---|---|
| I1 | Every journal balances (debit = credit) | — | `postBalancedJournal` | yes | — | phase7 / refund-conformance |
| I2 | Posted ledger journals/entries are immutable | Trigger `028` | compensating entries only | — | — | p15-0-security |
| I3 | No cross-tenant financial writes | org FK | org-scoped queries | yes | authz org context | phase6_6 / p15-0 |
| I4 | No duplicate ledger post per source | Unique `ledger_journals_source_uq` (030) | SAVEPOINT idempotent post | yes | — | p15-1b |
| I5 | Refund ≤ refundable captured | — | refunds-service | yes | 422 | refund-conformance |
| I6 | Settlement net = gross − provider − platform − reserves + adjustments | cols + nonneg CHECKs | `computeSettlementTotals` | yes | 422 if net < 0 | p15-1a tests |
| I7 | One PI cannot belong to multiple **active** settlements | Unique `settlement_lines_pi_active_uq` | NOT EXISTS + advisory lock | yes | 409 | p15-1a |
| I8 | Single currency per settlement | CHAR(3) | `assertSameCurrency` | — | 422 | p15-1a |
| I9 | Eligible amount = captured − refunds (PENDING\|SUCCEEDED) | line cols | `computeEligibleMinor` | yes | — | p15-1a |
| I10 | Platform fee = half-up(bps) + fixed | — | `applyBpsHalfUp` | — | preview API | p15-1a |
| I11 | Reserves logic deferred; `reserves_minor` may be 0 | col ≥ 0 | defaults 0 | — | — | p15-1a |
| I12 | FX not applied; mismatch rejected | — | assertSameCurrency | — | 422 | p15-1a |
| I13 | Finalized settlement immutable | status CHECK + service guard | cancel/finalize guards | yes | 409 | p15-1d |
| I14 | Payout ≤ unpaid finalized net | service cap + TX lock | yes | 422 | p15-1e |
| I15 | Idempotent financial HTTP mutations | idempotency_keys | complete/fail | yes | Idempotency-Key | existing |
| I16 | Taxes not invented in Payments | — | out of scope | — | — | docs |

---

## Balance semantics (SoT = Financial Core, not UI)

| Bucket | Meaning in P15.1 |
|---|---|
| Pending | Captured, not yet in FINALIZED settlement |
| Available | FINALIZED net not yet PAID out |
| Reserved | 0 until reserve logic (schema ready) |
| Settled | Successfully PAID payout amounts |

P15.1-A documents semantics; P15.1-C derives all four buckets in Financial Core (`GET /balances`).
`reserved` remains 0 while DEC-008.3 reserve logic is deferred; `settled` comes from payout journals.
