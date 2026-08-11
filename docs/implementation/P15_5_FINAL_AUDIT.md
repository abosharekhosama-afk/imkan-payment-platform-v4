# P15.5 Final Audit — Real PayTabs Sandbox E2E Completion

**Date:** 2026-08-10  
**Final Verdict:** **PARTIAL / BLOCKED — REAL PAYTABS SANDBOX CREDENTIALS + PUBLIC WEBHOOK REQUIRED**  
**Production Ready:** **NO**  
**Production Gate:** **NOT PASSED**  
**PayTabs status:** **SANDBOX_TESTED** (not CERTIFIED — real E2E evidence incomplete)  
**Next phase:** Awaiting merchant sandbox credentials + public HTTPS webhook — **P15.6 NOT STARTED**

---

## 1. Final Verdict

P15.5 delivered all implementable infrastructure for real PayTabs Sandbox E2E completion:

- Preflight module with safe credential/webhook gating (no secrets in output)
- CLI preflight script (`exit 2` when blocked)
- Credential-gated real E2E test harness (never fake PASS)
- 16 new tests; full regression **224 pass / 8 skipped**

**Real PayTabs Sandbox HTTP was NOT executed** — credentials absent in execution environment.  
**Real inbound webhook NOT VERIFIED** — no public HTTPS endpoint configured.  
**Real HPP / 3DS / refund NOT VERIFIED** — blocked on above.

PayTabs remains **SANDBOX_TESTED**, not **CERTIFIED**.

---

## 2. Files Created

| File |
|---|
| `apps/api/src/providers/paytabs/preflight.ts` |
| `scripts/paytabs-sandbox-preflight.ts` |
| `scripts/paytabs-sandbox-preflight.mjs` |
| `tests/p15-5-paytabs-real-e2e.test.ts` |
| `tests/p15-5-paytabs-preflight.test.ts` |
| `docs/implementation/P15_5_REAL_PAYTABS_SANDBOX_E2E.md` |
| `docs/implementation/P15_5_FINAL_AUDIT.md` |

---

## 3. Files Modified

| File | Change |
|---|---|
| `apps/api/src/providers/paytabs/index.ts` | Export preflight helpers |
| `scripts/verify-foundation-pg.mjs` | P15.5 test suites |
| `.env.example` | `PAYTABS_REAL_WEBHOOK_ENDPOINT` |
| `docs/providers/PAYTABS_SANDBOX_CERTIFICATION.md` | P15.5 evidence tier |
| `docs/providers/PROVIDER_CAPABILITY_MATRIX.md` | Real E2E status |
| `docs/providers/PROVIDER_CHECKLIST.md` | P15.5 lifecycle |
| `docs/decisions/OPEN_DECISIONS.md` | P15.5 note |
| `docs/ops/PRODUCTION_GATE.md` | P15.5 note |

---

## 4. Migrations

None.

---

## 5. Environment Configuration

| Setting | Value in run | Required | Status |
|---|---|---|---|
| `PAYTABS_ENV` | sandbox | sandbox | PASS |
| `PAYTABS_ADAPTER_MODE` | http (test default) | http | PASS |
| `PAYTABS_REAL_SANDBOX_CERT` | not set | true | **BLOCKER** |
| `PAYTABS_SANDBOX_SERVER_KEY` | empty | set | **BLOCKER** |
| `PAYTABS_SANDBOX_PROFILE_ID` | empty | set | **BLOCKER** |
| `PAYTABS_SANDBOX_CALLBACK_URL` | not set | public HTTPS | **BLOCKER** |
| `PAYTABS_SANDBOX_RETURN_URL` | not set | HPP flow | **BLOCKER** |
| `PAYTABS_REAL_WEBHOOK_ENDPOINT` | not set | public HTTPS | **BLOCKER** |

Preflight CLI exit code: **2** (blocked).

---

## 6. Real PayTabs HTTP Evidence

| Test ID | Scenario | Result |
|---|---|---|
| PT5-HTTP-01 | Real connectivity + payment creation | **SKIPPED** — no credentials |
| PT5-HTTP-02 | Real status query | **SKIPPED** |
| PT5-HTTP-03 | Query recovery | **SKIPPED** |

P15.4 simulate/contract evidence remains valid. Real HTTP: **BLOCKED**.

---

## 7. Payment Creation Evidence

| Test ID | Scenario | Result |
|---|---|---|
| PT5-E2E-01 | Checkout → Router → PayTabs → REQUIRES_ACTION | **SKIPPED** |
| PT-009 (P15.3 simulate) | Checkout HPP flow | PASS (simulate) |

---

## 8. HPP Evidence

| Test ID | Scenario | Result |
|---|---|---|
| PT5-3DS-BLOCKED | Real HPP + 3DS | **NOT VERIFIED** — credentials + manual HPP |
| PT-009 (P15.3) | REQUIRES_ACTION redirect | PASS (simulate) |

Return URL is not financial confirmation — state machine + webhook required.

---

## 9. Webhook Evidence

| Test ID | Scenario | Result |
|---|---|---|
| PT5-WH-BLOCKED | Real inbound from PayTabs servers | **NOT VERIFIED** |
| PT5-E2E-02 | Signed webhook → ledger | **SKIPPED** (needs e2eReady) |
| PT-010/PT-011 (P15.3) | Webhook success + duplicate | PASS (simulate) |
| PT4-SEC-* (P15.4) | Signature security contract | PASS (simulate) |

---

## 10. Signature Evidence

| Test ID | Scenario | Result |
|---|---|---|
| PT4-SEC-01..06 | HMAC contract tests | PASS (simulate) |
| Real PayTabs-issued signature | Live callback from PayTabs | **NOT VERIFIED** |

---

## 11. Idempotency Evidence

| Test ID | Scenario | Result |
|---|---|---|
| PT5-E2E-03 | Real sandbox idempotency | **SKIPPED** |
| PT-012 (P15.3) | IMKAN idempotency key | PASS (simulate) |
| PayTabs native idempotency | Provider-side | **NOT VERIFIED** (not documented by PayTabs) |

---

## 12. 3DS Evidence

| Test ID | Scenario | Result |
|---|---|---|
| PT5-3DS-BLOCKED | Real 3DS on PayTabs HPP | **NOT VERIFIED / ACCOUNT LIMITATION** |

---

## 13. Refund Evidence

| Test ID | Scenario | Result |
|---|---|---|
| PT5-RF-BLOCKED | Real sandbox refund | **NOT VERIFIED** |
| PT-003/PT-004 (P15.3) | Full + partial refund | PASS (simulate) |

---

## 14. Partial Refund Evidence

| Test ID | Scenario | Result |
|---|---|---|
| PT5-RF-BLOCKED | Real partial refund | **NOT VERIFIED** |
| PT-004 (P15.3) | Partial refund simulate | PASS |

---

## 15. Ledger Evidence

| Test ID | Scenario | Result |
|---|---|---|
| PT5-E2E-02 | Real payment → webhook → ledger | **SKIPPED** |
| PT-010 (P15.3) | Simulate webhook → ledger | PASS |
| P15.1-B | Ledger idempotency | PASS |

---

## 16. Balance Evidence

| Test ID | Scenario | Result |
|---|---|---|
| Real sandbox balance effect | After real payment | **NOT VERIFIED** |
| P15.1-C | Balance API | PASS (simulate path) |

---

## 17. Security Evidence

| Check | Result |
|---|---|
| SecretResolver for credentials | PASS |
| No secrets in DB/repo/logs/preflight | PASS |
| No secrets in frontend | PASS |
| `PAYTABS_ENV=live` blocked | PASS |
| Webhook HMAC verification (contract) | PASS |
| Real webhook replay from PayTabs | **NOT VERIFIED** |
| Tenant isolation | PASS |

---

## 18. All Tests

```text
npm run test:pg
Test Files  35 passed (35)
Tests       224 passed | 8 skipped (232)
```

### P15.5 breakdown

| Category | PASS | FAIL | SKIPPED |
|---|---|---|---|
| Preflight unit | 4 | 0 | 0 |
| Preflight E2E report | 2 | 0 | 0 |
| Real HTTP | 0 | 0 | 3 |
| Real E2E (checkout/webhook/idem) | 0 | 0 | 3 |
| Blocked documentation | 4 | 0 | 0 |
| P15.4 real sandbox (carried) | 5 | 0 | 2 |
| **P15.5 total** | **10** | **0** | **6** |

---

## 19. Supported Capabilities (with evidence)

| Capability | Evidence tier |
|---|---|
| Payment creation (simulate) | P15.3 PASS |
| HPP redirect / REQUIRES_ACTION | P15.3 PASS |
| Status query (simulate) | P15.3 PASS |
| Webhook signature (contract) | P15.4 PASS |
| Duplicate webhook protection | P15.3 PASS |
| IMKAN idempotency | P15.3 PASS |
| Refund full/partial (simulate) | P15.3 PASS |
| Query-before-retry | P15.4 PASS |
| Preflight gating | P15.5 PASS |
| Internal Sandbox regression | phase5 PASS |

---

## 20. Unsupported Capabilities

| Capability | Status |
|---|---|
| Void | NOT VERIFIED |
| Tokenization (direct) | NOT SUPPORTED |
| Recurring (PayTabs) | NOT SUPPORTED |
| Payout via PayTabs | NOT SUPPORTED |
| PayTabs native idempotency | NOT VERIFIED |

---

## 21. Not Verified Capabilities (real sandbox)

| Capability | Reason |
|---|---|
| Real HTTP payment creation | Credentials missing |
| Real inbound webhook | No public HTTPS |
| Real HPP / 3DS | Credentials + manual HPP |
| Real refund | No completed real payment |
| Real partial refund | No completed real payment |
| Real ledger/balance effect | No real payment |
| PayTabs-issued webhook signature | No real callback |

---

## 22. Blockers

1. Merchant PayTabs sandbox credentials not provided
2. `PAYTABS_REAL_SANDBOX_CERT=true` not enabled
3. Public HTTPS webhook endpoint not configured
4. Manual HPP completion not possible without credentials
5. Real refund chain blocked on successful real payment

---

## 23. Open Decisions

| ID | Topic | Status |
|---|---|---|
| DEC-009 | Provider capability matrices | PARTIAL — real HTTP still blocked |
| DEC-011 | PCI scope | OPEN |
| DEC-012 | Sandbox↔Live switch | OPEN |
| PayTabs native idempotency | Not documented by provider | NOT VERIFIED — IMKAN-side only |

---

## 24. Production Gate

**NOT PASSED** — unchanged.

Sandbox certification does not imply production readiness.

| Gate item | Status |
|---|---|
| Live Provider | **BLOCKED** |
| PCI | **BLOCKED** |
| Live payout rail | **BLOCKED** |
| Production Gate | **NOT PASSED** |

---

## 25. PayTabs Provider Status

```text
DISCOVERED → CONTRACTED → SANDBOX_CONFIGURED → SANDBOX_TESTED → CERTIFIED (BLOCKED) → LIVE_READY (BLOCKED)
```

**Current:** **SANDBOX_TESTED**

Certification to **CERTIFIED** requires completing all real E2E evidence with merchant credentials.

---

## 26. Recommendation for Next Phase

1. **Merchant action:** Provide PayTabs sandbox server key + profile ID via secure channel (SecretResolver / env, never repo).
2. **Ops action:** Deploy staging API with public HTTPS; configure callback + webhook URLs.
3. **Re-run:** `node scripts/paytabs-sandbox-preflight.mjs` → expect exit 0.
4. **Execute:** `npm run test:pg` with real credentials; complete manual HPP with PayTabs test cards.
5. **Verify:** Real inbound webhook from PayTabs servers; update certification evidence.
6. **Review:** If all real evidence PASS → update PayTabs to **CERTIFIED** (still not LIVE_READY).
7. **Do NOT start P15.6 / LIVE** without explicit approval after audit review.

---

**P15.5 implementation: COMPLETE (infrastructure)**  
**P15.5 certification: BLOCKED (execution)**  
**STOP — do not proceed to P15.6**
