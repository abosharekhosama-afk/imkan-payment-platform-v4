# P15.1-C Final Audit — Balances

**Date:** 2026-08-10  
**Phase:** P15.1-C only  
**Verdict:** **PASS — complete for scope**  
**Next phase:** P15.1-D — Settlement — **STARTED after approval** (see `P15_1D_FINAL_AUDIT.md`)

---

## 1. Files changed

### Code
| Path | Role |
|---|---|
| `apps/api/src/finance/balances.ts` | Formulas, semantics, pure derivation helpers |
| `apps/api/src/finance/financial-model.ts` | Re-exports balance semantics/formulas |
| `apps/api/src/ledger/ledger-service.ts` | `getBalances` multi-currency + settled/reserved |
| `apps/api/src/interfaces/http/apiV1/phase7-financial-routes.ts` | Query params; return Financial Core payload |
| `apps/web/src/v4/pages/finance/FinancePages.tsx` | Show phase/source note (no client math) |

### Tests / harness
| Path | Role |
|---|---|
| `tests/p15-1c-balances.test.ts` | Unit + PG balance contract |
| `tests/phase7-financial.test.ts` | Expect `source: financial_core` |
| `scripts/verify-foundation-pg.mjs` | Includes p15-1c suite |

### Documentation
| Path | Role |
|---|---|
| `docs/implementation/P15_1C_BALANCES.md` | Implementation record |
| `docs/implementation/P15_1C_FINAL_AUDIT.md` | This audit |
| `docs/implementation/P15_1_FINANCIAL_INVARIANTS.md` | Balance semantics note |

### Migrations
None (no schema change required for C).

---

## 2. Balance model

| Bucket | Derivation |
|---|---|
| Pending | `max(0, net pending_settlement)` |
| Available | `max(0, −net merchant_payable)` |
| Reserved | `SUM(FINALIZED.reserves_minor)` → **0** (DEC-008.3 deferred) |
| Settled | `SUM` DEBIT `merchant_payable` on `source_type=payout` journals |

SoT = Financial Core (`source: financial_core`). Frontend never sums.

---

## 3. API contract

`GET /api/v1/balances?environment=SANDBOX|LIVE&currency_code=XXX`

Returns primary buckets + `currencies[]` + `formulas` + `semantics` + `phase: P15.1-C`.

---

## 4. Tests executed

| Command | Result |
|---|---|
| `npm run test:pg` | **PASS** |

```text
Test Files  21 passed (21)
Tests       144 passed (144)
Foundation PostgreSQL verification PASSED
```

Includes `tests/p15-1c-balances.test.ts` (5 tests).

---

## 5. Remaining risks / limitations

1. **Pending not cleared on finalize** until P15.1-D posts clearing journals — pending can stay elevated after fees/payouts.  
2. **Available** is payable remainder, not yet strictly “FINALIZED unpaid net” (D may refine).  
3. **Reserved** remains 0 until reserve product logic.  
4. **Settled** requires payout ledger posts (B helper / E lifecycle).  
5. Production Gate blockers unchanged.

---

## 6. P15.1-D prerequisites

Before starting D (only after explicit approval):

1. Finalize DRAFT→FINALIZED with status guard + step-up + idempotency.  
2. Call `postSettlementFinalizeFees` inside finalize TX.  
3. Optionally clear/reclassify `pending_settlement` so pending/available match product semantics.  
4. Cancel DRAFT only; immutability of FINALIZED.  
5. Outbox events for settlement lifecycle.  
6. No Live Provider / Zoho / FX.

---

## 7. Production Gate impact

Balances are more truthful (settled real; reserved explicit 0).  
Settlement/payout product still incomplete.  
**Do not claim Production Ready.**

---

## Stop rule

P15.1-C is complete.  
**Do not start P15.1-D** until the product owner explicitly approves.
