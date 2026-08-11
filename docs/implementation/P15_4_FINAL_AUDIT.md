# P15.4 Final Audit — Real PayTabs Sandbox Certification

**Date:** 2026-08-10  
**Final Verdict:** **PARTIAL / BLOCKED — REAL PAYTABS SANDBOX CREDENTIALS REQUIRED**  
**Production Ready:** **NO**  
**Production Gate:** **NOT PASSED**  
**PayTabs status:** **SANDBOX_TESTED** (not CERTIFIED with real HTTP)  
**Next phase:** Awaiting merchant sandbox credentials + public webhook — **P15.5 not started**

---

## 1. Final Verdict

P15.4 delivered all implementable infrastructure for real PayTabs Sandbox certification:

- Sandbox-only environment guard (`PAYTABS_ENV=sandbox`)
- Credential validation without fake PASS
- Enhanced HTTP client (correlation ID, status mapping, redaction)
- Query-before-retry for unknown outcomes
- Webhook security contract tests
- V4 Checkout REQUIRES_ACTION redirect
- 21 new tests; full regression **214 pass / 2 skipped**

**Real PayTabs Sandbox HTTP was NOT executed** — `PAYTABS_SANDBOX_SERVER_KEY` and `PAYTABS_SANDBOX_PROFILE_ID` are empty in the execution environment. No fake credentials were used.

**Real inbound webhook NOT VERIFIED** — local dev lacks public HTTPS endpoint for PayTabs callbacks.

---

## 2. Files Created

| File |
|---|
| `apps/api/src/providers/paytabs/config.ts` |
| `apps/api/src/providers/paytabs/query-recovery.ts` |
| `tests/p15-4-paytabs-config.test.ts` |
| `tests/p15-4-paytabs-webhook-security.test.ts` |
| `tests/p15-4-paytabs-real-sandbox.test.ts` |
| `docs/implementation/P15_4_REAL_PAYTABS_SANDBOX.md` |
| `docs/implementation/P15_4_FINAL_AUDIT.md` |

---

## 3. Files Modified

| File | Change |
|---|---|
| `apps/api/src/providers/paytabs/credentials.ts` | Sandbox guard, mode resolution order |
| `apps/api/src/providers/paytabs/http-client.ts` | Correlation ID, HTTP classification, redaction |
| `apps/api/src/providers/paytabs/index.ts` | Export config + query recovery |
| `apps/api/src/providers/webhook-service.ts` | `webhook_failures_total` on reject |
| `apps/web/src/v4/public-checkout/CheckoutPage.tsx` | REQUIRES_ACTION redirect |
| `scripts/verify-foundation-pg.mjs` | P15.4 test suites |
| `.env.example` | PayTabs sandbox vars documented |
| `docs/providers/PAYTABS_SANDBOX_CERTIFICATION.md` | P15.4 evidence tier |
| `docs/providers/PROVIDER_CAPABILITY_MATRIX.md` | Real HTTP status |
| `docs/providers/PROVIDER_CHECKLIST.md` | CERTIFIED blocked |
| `docs/decisions/OPEN_DECISIONS.md` | P15.4 note |
| `docs/ops/PRODUCTION_GATE.md` | P15.4 note |

---

## 4. Migrations

None. P15.4 is code + tests + docs only.

---

## 5. Configuration

| Setting | Value in run | Notes |
|---|---|---|
| `PAYTABS_ENV` | sandbox (default) | LIVE blocked |
| `PAYTABS_ADAPTER_MODE` | simulate (test harness) | http when cert enabled |
| `PAYTABS_REAL_SANDBOX_CERT` | not set | opt-in required |
| `PAYTABS_SANDBOX_SERVER_KEY` | **empty** | BLOCKER |
| `PAYTABS_SANDBOX_PROFILE_ID` | **empty** | BLOCKER |

---

## 6. Real Sandbox Connectivity

| Test | Result |
|---|---|
| DNS/HTTPS to PayTabs sandbox | **NOT RUN** |
| Authentication | **NOT RUN** |
| Credential validation gate | **PASS** (correctly reports BLOCKED) |

---

## 7. Payment Creation Evidence

| Scenario | Result |
|---|---|
| Real HTTP authorize | **BLOCKED** (PT4-001 skipped) |
| Simulate authorize | PASS (P15.3 regression) |

---

## 8. Payment Status Evidence

| Scenario | Result |
|---|---|
| Real HTTP query | **BLOCKED** (PT4-002 skipped) |
| Query recovery unit test | PASS |

---

## 9. Checkout / Redirect Evidence

| Scenario | Result |
|---|---|
| V4 Checkout REQUIRES_ACTION redirect code | Implemented |
| Real HPP redirect tested | **BLOCKED** |

---

## 10. 3DS Evidence

**3DS REAL SANDBOX TEST = BLOCKED / NOT AVAILABLE** — requires real HTTP + PayTabs account HPP + manual card entry.

---

## 11. Webhook Evidence

| Scenario | Result |
|---|---|
| Signature valid (contract) | PASS |
| Invalid / missing signature | PASS |
| Duplicate (P15.3 integration) | PASS |
| Real PayTabs server delivery | **NOT VERIFIED** |

---

## 12. Signature Verification

PASS — HMAC-SHA256 contract tests + P15.3 integration regression.

---

## 13. Idempotency Evidence

PASS — P15.3 integration + query recovery. Real concurrent duplicate under HTTP: **NOT RUN**.

---

## 14. Refund Evidence

Simulate refund PASS (P15.3). Real sandbox refund: **BLOCKED**.

---

## 15. Ledger Evidence

Simulate webhook -> ledger PASS (P15.3 PT-010). Real payment ledger: **NOT RUN**.

---

## 16. Balance Evidence

P15.1-C regression PASS. Real sandbox balance effect: **NOT RUN**.

---

## 17. Failure Testing

| Case | Result |
|---|---|
| Timeout classification | PASS |
| Invalid signature | PASS |
| Malformed payload | PASS |
| HTTP 401/403/429/5xx mapping | Unit (client code) — not live HTTP |
| Unknown outcome query | PASS (simulate) |

---

## 18. Security Regression

P15.2 + P15.0 regression PASS. No secrets in DB/API/frontend. LIVE blocked.

---

## 19. Full Test Results

| Suite | Tests | Passed | Failed | Skipped | Status |
|---|---|---|---|---|---|
| p15-4-paytabs-config | 6 | 6 | 0 | 0 | PASS |
| p15-4-paytabs-webhook-security | 8 | 8 | 0 | 0 | PASS |
| p15-4-paytabs-real-sandbox | 7 | 5 | 0 | 2 | BLOCKED |
| P15.3 + all regression | 195 | 195 | 0 | 0 | PASS |
| **Total test:pg** | **216** | **214** | **0** | **2** | **PASS** |

---

## 20. Capabilities Supported

- Sandbox env guard, credential validation, HTTP client hardening
- Webhook signature verification (contract)
- Query-before-retry recovery
- Checkout redirect handling
- All P15.3 simulate capabilities (regression PASS)

---

## 21. Capabilities Not Supported

- LIVE PayTabs, LIVE webhooks, real money

---

## 22. Capabilities Not Verified

- Real PayTabs HTTP payment creation
- Real inbound PayTabs webhook
- Real 3DS HPP completion
- Real sandbox refund
- PayTabs-side idempotency

---

## 23. Blocked Items

1. **Merchant PayTabs sandbox credentials** — required for PT4-001/002
2. **Public HTTPS webhook URL** — required for real webhook certification
3. **Manual HPP completion** — required for 3DS + refund evidence
4. **Production Gate** — NOT PASSED
5. **LIVE Provider** — BLOCKED

---

## 24. Open Decisions

| Decision | Status |
|---|---|
| DEC-009 | PARTIAL — real HTTP blocked on credentials |
| DEC-011 PCI | OPEN / BLOCKED |
| DEC-012 sandbox/live switch | OPEN |

---

## 25. Production Gate Status

**PRODUCTION GATE = NOT PASSED**

P15.4 did not change gate to PASS. PayTabs sandbox contract improvements documented only.

---

## 26. Exact Next Recommended Phase

**Provide PayTabs sandbox credentials** (via env/SecretResolver, never in repo) and a **public HTTPS webhook endpoint**, then re-run:

```bash
PAYTABS_ENV=sandbox
PAYTABS_ADAPTER_MODE=http
PAYTABS_REAL_SANDBOX_CERT=true
npm run test:pg
```

Suggested follow-up phase (not started): **P15.5 — Real PayTabs Sandbox E2E Completion** (HTTP + webhook + refund evidence). Still SANDBOX ONLY until separate LIVE approval.

**STOP — awaiting explicit approval and credentials.**
