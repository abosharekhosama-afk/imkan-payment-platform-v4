# P15.1-B Final Audit — Ledger Hardening

**Date:** 2026-08-10  
**Phase:** P15.1-B only  
**Verdict:** **PASS — complete for scope**  
**Next phase:** P15.1-C — Balances — **STARTED after approval** (see `P15_1C_FINAL_AUDIT.md`)

---

## 1. Files changed

### Code
| Path | Role |
|---|---|
| `apps/api/src/ledger/ledger-service.ts` | SAVEPOINT idempotent post; settlement fee + payout helpers; source types |
| `apps/api/src/finance/financial-model.ts` | `LEDGER_POSTING_PLAN` statuses updated for B helpers |

### Database
| Path | Role |
|---|---|
| `database/migrations/postgres/030_p15_1b_ledger_hardening.sql` | `ledger_journals_source_uq` + duplicate pre-check |

### Tests / harness
| Path | Role |
|---|---|
| `tests/p15-1b-ledger-hardening.test.ts` | Concurrency, fee/payout helpers, tenant isolation |
| `scripts/verify-foundation-pg.mjs` | Includes p15-1b suite |

### Documentation
| Path | Role |
|---|---|
| `docs/implementation/P15_1B_LEDGER_HARDENING.md` | Implementation record |
| `docs/implementation/P15_1B_FINAL_AUDIT.md` | This audit |
| `docs/implementation/P15_1_FINANCIAL_INVARIANTS.md` | I4 → enforced |
| `docs/ledger/LEDGER.md` | Posting + unique source |
| `docs/implementation/P15_1A_*.md` | Cross-links updated |

Payment Core / Checkout / Settlement finalize API unchanged (finalize status = D).

---

## 2. Migrations added

| Migration | Notes |
|---|---|
| `030_p15_1b_ledger_hardening.sql` | Next after `029`; additive only |

Header documents Current schema / Change / Reason / Backward compatibility / Rollback.

---

## 3. Schema changes

- **Unique partial index** `ledger_journals_source_uq` on `(organization_id, source_type, source_id)` WHERE both non-null
- Pre-flight: fails migration if duplicate sources already exist (DELETE forbidden by immutability triggers)
- No new tables; no account removals

---

## 4. Ledger hardening model

| Source type | Source id | Lines |
|---|---|---|
| `payment_intent` | PI id | DR pending_settlement / CR merchant_payable |
| `refund` | refund id | DR merchant_payable / CR pending_settlement |
| `settlement_finalize` | settlement id | DR merchant_payable / CR platform_revenue (+ CR cash_provider) |
| `payout` | payout id | DR merchant_payable / CR cash_provider |

Idempotency: app SELECT + unique index + SAVEPOINT on `23505` (outer TX safe).

---

## 5. DEC-008 impact

No change to DEC-008 resolutions. Fee **posting** now uses `platform_revenue` / `cash_provider` via helpers. FX still deferred. Taxes still out of Payments SoR.

---

## 6. Invariants

| ID | Status after B |
|---|---|
| I1 Balanced journals | Still enforced in service + tests |
| I2 Immutability | Unchanged (`028`) |
| I4 No duplicate source | **DB unique + SAVEPOINT idempotent post** |
| I13 Finalize once | Still **P15.1-D** (status transition not in B) |
| I14 Payout ≤ unpaid | Still **P15.1-E** |

---

## 7. Tests executed

| Command | Result |
|---|---|
| `npm run test:pg` | **PASS** |

```text
Test Files  20 passed (20)
Tests       139 passed (139)
Foundation PostgreSQL verification PASSED
```

Includes `tests/p15-1b-ledger-hardening.test.ts` (4 tests).

Root `npm test` without PG harness remains environmentally noisy (same as P15.1-A); authoritative suite is `test:pg`.

---

## 8. Remaining risks

1. Helpers exist but **settlement FINALIZE API** not wired — drafts still do not post fees until D.  
2. **Balances reserved/settled** still `0` until C/E.  
3. Payout helper does not enforce unpaid-net cap or bank verification (E).  
4. Migration blocks if historical duplicate journals exist in a non-empty DB (intentional; must resolve manually — cannot DELETE under immutability).  
5. Production Gate blockers unchanged (Redis, KMS, cookies, PCI, Live Provider).

---

## 9. P15.1-C prerequisites

Before starting C (only after explicit approval):

1. Define balance derivation that reflects finalized vs unpaid (may need finalize from D, or interim formula from journals).  
2. Keep SoT = ledger/service — never frontend.  
3. Expose stable API contract for pending / available / reserved / settled.  
4. Do not invent FX or Live Provider.

**Ordering note:** Meaningful “available after finalize” may need D; C can still document formulas and API shape and compute reserved=0 / settled from payout journals if present.

---

## 10. Production Gate impact

| Item | Impact |
|---|---|
| Duplicate ledger money risk | **Reduced** (I4 DB-enforced) |
| Settlement/payout product completeness | Still incomplete |
| Claim “Production Ready” | **Forbidden** |

**P15.1-B does not unlock Production Gate.**

---

## Stop rule

P15.1-B is complete for audit scope.  
**Do not start P15.1-C** until the product owner explicitly approves.
