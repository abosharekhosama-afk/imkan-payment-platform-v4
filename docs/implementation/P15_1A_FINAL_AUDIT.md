# P15.1-A Final Audit — Financial Model / DEC-008

**Date:** 2026-08-10  
**Phase:** P15.1-A only  
**Verdict:** **PASS — complete for scope**  
**Next phase:** P15.1-B — Ledger Hardening — **STARTED after approval** (see `P15_1B_FINAL_AUDIT.md`)

---

## 1. Files changed

### Code
| Path | Role |
|---|---|
| `apps/api/src/finance/financial-model.ts` | Central formulas, currency assert, ledger plan constants, balance semantics |
| `apps/api/src/finance/fee-schedules-service.ts` | Org-scoped fee schedule CRUD/resolve/preview |
| `apps/api/src/finance/settlement-payout-recon.ts` | Draft settlement: eligibility, schedule fees, advisory lock, totals |
| `apps/api/src/interfaces/http/apiV1/phase7-financial-routes.ts` | Fee-schedule APIs, settlement detail/create extras, balances semantics |

### Database
| Path | Role |
|---|---|
| `database/migrations/postgres/029_p15_1a_financial_model.sql` | Additive fee schedules + settlement fee/eligibility columns + unique active PI |

### Tests
| Path | Role |
|---|---|
| `tests/p15-1a-financial-model.test.ts` | Unit + PG coverage for P15.1-A |
| `scripts/verify-foundation-pg.mjs` | Includes p15-1a suite in `test:pg` |

### Documentation
| Path | Role |
|---|---|
| `docs/decisions/DEC-008-FINANCIAL-MODEL.md` | Formal DEC-008 resolution |
| `docs/decisions/OPEN_DECISIONS.md` | DEC-008 → RESOLVED; FX deferred noted |
| `docs/implementation/P15_1A_FINANCIAL_MODEL.md` | Implementation record |
| `docs/implementation/P15_1_FINANCIAL_INVARIANTS.md` | Invariants × enforcement layer |
| `docs/implementation/P15_1A_FINAL_AUDIT.md` | This audit |
| `docs/ledger/LEDGER.md` | Account / posting notes aligned to DEC-008 |

Payment Core / Checkout path untouched (no rewrite required).

---

## 2. Migrations added

| Migration | Notes |
|---|---|
| `029_p15_1a_financial_model.sql` | Next number after `028_ledger_immutability.sql`; additive only |

Pre-migration documentation (in-file header): Current schema / Change / Reason / Backward compatibility / Rollback consideration.

---

## 3. Schema changes

- **New:** `fee_schedules`, `fee_schedule_lines`
- **`settlements`:** `provider_fees_minor`, `platform_fees_minor`, `reserves_minor`, `adjustments_minor`, `fee_schedule_id` (+ non-negative CHECKs)
- **`settlement_lines`:** `gross_minor`, `refunded_minor`, `net_minor`, `inclusion_active`
- **Unique partial index:** `settlement_lines_pi_active_uq` — one active inclusion of a PI across non-cancelled settlements
- **Compat:** `fees_minor` kept = provider + platform

No deletions, no renumbering, no edits to applied migrations.

---

## 4. Financial model

```text
eligible_minor = captured_minor - refunded_minor (PENDING|SUCCEEDED)
platform_fee   = half_up(gross * bps / 10000) + fixed_minor
net_minor      = gross - provider_fees - platform_fees - reserves + adjustments
```

- Single currency per settlement; mismatch rejected (no FX)
- `reserves_minor` present, logic = 0 in P15.1
- Empty draft (`gross = 0`) does not apply fixed fees (avoids negative net)
- Central service: `computeSettlementTotals` / `computePlatformFeeMinor` / `computeEligibleMinor`

---

## 5. DEC-008 decisions

| ID | Resolution | Status |
|---|---|---|
| 008.1 Fee ownership | Platform + Provider fields | Adopted |
| 008.2 Platform fee | bps + optional fixed | Adopted |
| 008.3 Reserves | Field only; rolling logic deferred | Adopted |
| 008.4 Cutoff | Explicit `period_start` / `period_end` | Adopted |
| 008.5 Rounding | Half-up | Adopted |
| 008.6 FX | **Deferred, not forgotten** | Explicit defer |
| 008.7 Taxes | Deferred to Internal Books | Explicit defer |

No Zoho Books / Zoho API. Target later: Financial Events → **IMKAN Internal Books**.

---

## 6. Invariants

Documented in `docs/implementation/P15_1_FINANCIAL_INVARIANTS.md` (I1–I16) with enforcement layers DB / Service / TX / API / Test.

Enforced in A: net equation, eligibility, currency, active PI uniqueness, fee half-up, tenant-scoped schedules.  
Deferred enforcement: I4 unique journal source (B), I13 finalized immutability (D), I14 payout cap (E).

---

## 7. Tests executed

| Command | Purpose |
|---|---|
| `npm run test:pg` | Authoritative PG foundation suite (migrations ×2 + integration) |
| `npm test` | Root vitest without PG bootstrap |

Scripts verified from root `package.json` (`test`, `test:pg`).

---

## 8. Test results

### `npm run test:pg` — **PASSED**

```text
Test Files  19 passed (19)
Tests       135 passed (135)
Foundation PostgreSQL verification PASSED
```

Includes `tests/p15-1a-financial-model.test.ts` (9 tests).

### `npm test` — **FAILED (environment, not product regression)**

```text
Test Files  12 failed | 16 passed (28)
Tests       63 passed | 93 skipped
```

Failures: `PostgreSQL required` when suites run outside `verify-foundation-pg.mjs` bootstrap. Same pattern as pre-existing PG-gated suites (phase7, refund-conformance, p15-0, etc.). **Authoritative result for Financial Core = `test:pg` PASS.**

---

## 9. Remaining risks

1. **Provider fees** still manual on draft create (sandbox = 0); no provider settlement-file import (by design for A).  
2. **Finalize / fee ledger posting** not implemented — balances still do not move available/pending on draft alone.  
3. **`refunds_expense` unused** — intentional; do not invent alternate refund posting in B without decision.  
4. **Concurrent schedule upsert** relies on app + unique constraints; stress beyond advisory lock on settlement create not exhaustively load-tested.  
5. **Production Gate blockers unchanged:** Redis RL, KMS, HttpOnly cookies, external PCI, Live Provider, Production Gate itself.  
6. Root `npm test` without PG harness remains noisy — operators should use `npm run test:pg` for financial/security suites.

---

## 10. P15.1-B prerequisites

Before starting B (only after explicit approval):

1. Unique ledger journal identity `(organization_id, source_type, source_id)` (or equivalent) to prevent duplicate posts.  
2. Implement `platform_fee_on_finalize` posting using `LEDGER_POSTING_PLAN` (DR merchant_payable / CR platform_revenue).  
3. Keep Payment SUCCEEDED / Refund posting paths; do not delete accounts.  
4. Do **not** start payout lifecycle (E) or settlement finalize product UX beyond ledger helpers unless scoped in B/D plan.  
5. No FX, tax, Zoho, Live Provider, or UI overhaul.

---

## 11. Production Gate impact

| Item | Impact |
|---|---|
| Financial model foundation | **Improved** — fees no longer permanently hard-coded to 0 |
| Settlement finalize / payout | Still incomplete — Gate remains closed |
| Live Provider / Redis / KMS / cookies / PCI | Unchanged blockers |
| Claim “Production Ready” | **Forbidden** until Production Gate |

**P15.1-A does not unlock Production Gate.**

---

## Stop rule

P15.1-A is complete for audit scope.  
**Do not start P15.1-B** until the product owner explicitly approves.
