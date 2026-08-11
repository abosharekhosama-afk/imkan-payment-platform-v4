# P15.5 — Real PayTabs Sandbox E2E Completion

**Date:** 2026-08-10  
**Scope:** Close remaining P15.4 BLOCKED items for real PayTabs Sandbox E2E certification  
**Production Ready:** **NO**  
**Production Gate:** **NOT PASSED**  
**Verdict:** **PARTIAL / BLOCKED — REAL PAYTABS SANDBOX CREDENTIALS + PUBLIC WEBHOOK REQUIRED**

---

## 1. Goal

Complete real PayTabs Sandbox E2E certification infrastructure so that when merchant sandbox credentials and a public HTTPS webhook endpoint are available, the platform can reach `SANDBOX_TESTED → CERTIFIED` with honest evidence.

**Hard constraints (unchanged):**

- SANDBOX ONLY — no LIVE credentials, no LIVE money movement
- Production Gate remains **NOT PASSED**
- PayTabs status stays **SANDBOX_TESTED** until real E2E evidence exists
- No fake credentials, no fake PASS for real sandbox tests
- Payment Core must not call PayTabs directly

---

## 2. Architecture (unchanged)

```text
Customer → Checkout / Payment Link → Payment Intent → Provider Router
  → Provider Interface → PayTabs Adapter → PayTabs Sandbox (HTTP)
PayTabs → /api/v1/webhooks/providers/paytabs → Webhook Engine → State Machine → Ledger
```

P15.5 adds preflight gating and credential-gated E2E test harness on top of P15.3/P15.4 infrastructure.

---

## 3. P15.5-A — Preflight / Environment Verification

### Module

`apps/api/src/providers/paytabs/preflight.ts`

- `runPayTabsPreflight()` — full environment assessment, no secrets in output
- `canRunRealSandboxE2E()` — HTTP credentials + public HTTPS callback + webhook endpoint
- `canRunRealSandboxHttp()` — inherited from P15.4 config
- `assessWebhookReadiness()` — validates public HTTPS callback URL
- `formatPreflightSummary()` — safe CLI output

### CLI

```bash
node scripts/paytabs-sandbox-preflight.mjs
# exit 0 = e2eReady; exit 2 = blocked
```

### Required environment

| Variable | Required for real E2E | Current run |
|---|---|---|
| `PAYTABS_ENV=sandbox` | Yes | **sandbox** (default) |
| `PAYTABS_ADAPTER_MODE=http` | Yes | **http** (test default) |
| `PAYTABS_REAL_SANDBOX_CERT=true` | Yes | **not set** — BLOCKER |
| `PAYTABS_SANDBOX_SERVER_KEY` | Yes | **empty** — BLOCKER |
| `PAYTABS_SANDBOX_PROFILE_ID` | Yes | **empty** — BLOCKER |
| `PAYTABS_SANDBOX_CALLBACK_URL` | Yes (public HTTPS) | **not configured** — BLOCKER |
| `PAYTABS_SANDBOX_RETURN_URL` | HPP flow | not configured |
| `PAYTABS_REAL_WEBHOOK_ENDPOINT` | Real inbound webhook | **not configured** — BLOCKER |

Preflight result (2026-08-10): `httpReady=false`, `e2eReady=false`, exit code 2.

---

## 4. P15.5-B through P15.5-L — Real Sandbox Tests (credential-gated)

### Test suite

`tests/p15-5-paytabs-real-e2e.test.ts`

| Test ID | Scenario | Gate | Status |
|---|---|---|---|
| PT5-PF-01 | Preflight report without secrets | always | **PASS** |
| PT5-PF-02 | Blockers documented when credentials absent | always | **PASS** |
| PT5-HTTP-01 | Real connectivity + payment creation | `httpReady` | **SKIPPED** |
| PT5-HTTP-02 | Real status query | `httpReady` | **SKIPPED** |
| PT5-HTTP-03 | Query recovery unknown outcome | `httpReady` | **SKIPPED** |
| PT5-E2E-01 | Checkout REQUIRES_ACTION via real PayTabs | `e2eReady` | **SKIPPED** |
| PT5-E2E-02 | Signed webhook → ledger | `e2eReady` | **SKIPPED** |
| PT5-E2E-03 | Idempotency on provider router | `e2eReady` | **SKIPPED** |
| PT5-BLOCKED | E2E certification not executed | `!e2eReady` | **PASS** (documents block) |
| PT5-WH-BLOCKED | Public HTTPS webhook required | `!e2eReady` | **PASS** (documents block) |
| PT5-3DS-BLOCKED | Manual HPP required | `!e2eReady` | **PASS** (documents block) |
| PT5-RF-BLOCKED | Real refund requires completed payment | `!e2eReady` | **PASS** (documents block) |

### Unit tests

`tests/p15-5-paytabs-preflight.test.ts` — 4 tests, all **PASS**

---

## 5. P15.5-M — Security Verification

| Check | Status | Evidence |
|---|---|---|
| Credentials via SecretResolver | PASS | P15.2 + P15.4 config |
| No secrets in PostgreSQL | PASS | migration 034 metadata only |
| No secrets in frontend | PASS | CheckoutPage redirect only |
| No secrets in logs/preflight | PASS | PT5-PF-01, formatPreflightSummary |
| `PAYTABS_ENV=live` blocked | PASS | p15-4-paytabs-config.test.ts |
| No LIVE→SANDBOX fallback | PASS | config.ts guard |
| Webhook signature verification | PASS (simulate) | P15.3/P15.4 tests |
| Real webhook from PayTabs servers | **NOT VERIFIED** | no public endpoint |
| Tenant isolation | PASS | existing regression |
| Idempotency (IMKAN-side) | PASS (simulate) | PT-012, PT-011 |
| Idempotency (real sandbox) | **NOT VERIFIED** | credentials blocked |

---

## 6. P15.5-N — Tests Added

| File | Tests | Result |
|---|---|---|
| `tests/p15-5-paytabs-real-e2e.test.ts` | 12 (6 skipped) | PASS |
| `tests/p15-5-paytabs-preflight.test.ts` | 4 | PASS |
| `scripts/verify-foundation-pg.mjs` | added both suites | PASS |

---

## 7. P15.5-O — Regression

```text
npm run test:pg → 224 passed | 8 skipped (232 total)
```

All P15.1–P15.4, providers, webhooks, refunds, ledger, checkout tests remain PASS.

Internal Sandbox adapter unaffected.

---

## 8. Blockers (honest)

1. **Merchant sandbox credentials missing** — `PAYTABS_SANDBOX_SERVER_KEY`, `PAYTABS_SANDBOX_PROFILE_ID`
2. **`PAYTABS_REAL_SANDBOX_CERT=true` not set** in execution environment
3. **No public HTTPS webhook endpoint** — `PAYTABS_SANDBOX_CALLBACK_URL`, `PAYTABS_REAL_WEBHOOK_ENDPOINT`
4. **Real HPP / 3DS** — requires credentials + manual card entry on PayTabs page
5. **Real refund** — requires completed real sandbox payment first

---

## 9. To unblock CERTIFIED status

1. Obtain PayTabs sandbox server key + profile ID from merchant portal
2. Configure SecretResolver / env (never commit):
   ```bash
   PAYTABS_ENV=sandbox
   PAYTABS_ADAPTER_MODE=http
   PAYTABS_REAL_SANDBOX_CERT=true
   PAYTABS_SANDBOX_SERVER_KEY=<from merchant portal>
   PAYTABS_SANDBOX_PROFILE_ID=<from merchant portal>
   PAYTABS_SANDBOX_CALLBACK_URL=https://<public-host>/api/v1/webhooks/providers/paytabs
   PAYTABS_SANDBOX_RETURN_URL=https://<checkout-host>/checkout/return
   PAYTABS_REAL_WEBHOOK_ENDPOINT=https://<public-host>/api/v1/webhooks/providers/paytabs
   ```
3. Expose API on public HTTPS (ngrok, staging, etc.)
4. Run preflight: `node scripts/paytabs-sandbox-preflight.mjs` (expect exit 0)
5. Run full suite: `npm run test:pg`
6. Complete manual HPP payment with PayTabs sandbox test cards
7. Verify real inbound webhook delivery from PayTabs servers
8. Update certification evidence in `PAYTABS_SANDBOX_CERTIFICATION.md`

---

## 10. Files Created (P15.5)

| File |
|---|
| `apps/api/src/providers/paytabs/preflight.ts` |
| `scripts/paytabs-sandbox-preflight.ts` |
| `scripts/paytabs-sandbox-preflight.mjs` |
| `tests/p15-5-paytabs-real-e2e.test.ts` |
| `tests/p15-5-paytabs-preflight.test.ts` |
| `docs/implementation/P15_5_REAL_PAYTABS_SANDBOX_E2E.md` |
| `docs/implementation/P15_5_FINAL_AUDIT.md` |

## 11. Files Modified (P15.5)

| File | Change |
|---|---|
| `apps/api/src/providers/paytabs/index.ts` | Export preflight module |
| `scripts/verify-foundation-pg.mjs` | Add P15.5 test suites |
| `.env.example` | Document `PAYTABS_REAL_WEBHOOK_ENDPOINT` |
| `docs/providers/PAYTABS_SANDBOX_CERTIFICATION.md` | P15.5 evidence section |
| `docs/providers/PROVIDER_CAPABILITY_MATRIX.md` | Real E2E status |
| `docs/providers/PROVIDER_CHECKLIST.md` | P15.5 status |
| `docs/decisions/OPEN_DECISIONS.md` | P15.5 note |
| `docs/ops/PRODUCTION_GATE.md` | P15.5 note |

## 12. Migrations

None. P15.5 is preflight + tests + docs only.

---

## 13. Next Phase

**STOP.** Do not proceed to P15.6 / LIVE integration without explicit approval after Final Audit review.
