# PayTabs Sandbox Certification Evidence

**Date:** 2026-08-10  
**Environment:** SANDBOX ONLY (`PAYTABS_ADAPTER_MODE=simulate` + embedded PostgreSQL)  
**Live credentials used:** **NONE**  
**Provider status:** **SANDBOX_TESTED** (simulate + contract). Real HTTP: **BLOCKED — credentials required**.

---

## Evidence tiers

| Tier | Phase | Mode | Status |
|---|---|---|---|
| Simulation | P15.3 | `PAYTABS_ADAPTER_MODE=simulate` | PASS (PT-001..PT-016) |
| Contract / security | P15.4 | simulate + unit | PASS (PT4-SEC-*) |
| Real HTTP | P15.4 | `PAYTABS_ADAPTER_MODE=http` | **BLOCKED** — no merchant credentials in environment |
| Real inbound webhook | P15.4 | PayTabs -> IMKAN HTTPS | **NOT VERIFIED** — no public endpoint |
| 3DS real HPP | P15.4 | manual on PayTabs page | **BLOCKED** |

---

## P15.3 — Simulation evidence (PASS)

| Test ID | Scenario | Environment | Request | Expected | Actual | Internal State | Provider State | Ledger | Balance | Webhook | Evidence | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PT-001 | Authorize HPP sale | simulate | `payment/request` sale | REQUIRES_ACTION + redirect | REQUIRES_ACTION + redirect_url | PROCESSING attempt | tran_ref issued | none | unchanged | none | paytabs-provider-contract.test.ts | PASS |
| PT-002 | Query status | simulate | `payment/query` | SUCCEEDED or PENDING | SUCCEEDED/PENDING | n/a | response_status A/P | n/a | n/a | n/a | contract test | PASS |
| PT-003 | Full refund | simulate | `payment/request` refund | SUCCEEDED | SUCCEEDED | n/a | refund ref | via refund path | adjusted on apply | n/a | contract test | PASS |
| PT-004 | Partial refund | simulate | refund partial amount | SUCCEEDED | SUCCEEDED | n/a | partial | caps enforced | n/a | n/a | contract test | PASS |
| PT-005 | Webhook signature valid | simulate | signed callback | verified=true | verified | n/a | response_status A | n/a | n/a | normalized | contract test | PASS |
| PT-006 | Webhook signature invalid | simulate | bad signature | rejected 401 | rejected | n/a | n/a | n/a | n/a | rejected audit | contract + integration | PASS |
| PT-007 | LIVE webhook blocked | simulate | env=LIVE | rejected | rejected SANDBOX-only | n/a | n/a | n/a | n/a | n/a | contract test | PASS |
| PT-008 | Timeout classification | simulate | TIMEOUT_KEY cart | ProviderError TIMEOUT | TIMEOUT thrown | n/a | n/a | n/a | n/a | n/a | contract test | PASS |
| PT-009 | Checkout HPP flow | PG+simulate | checkout payment | REQUIRES_ACTION | REQUIRES_ACTION | PROCESSING | redirect | none | unchanged | pending | p15-3 integration | PASS |
| PT-010 | Webhook success → ledger | PG+simulate | signed callback A | SUCCEEDED + ledger | SUCCEEDED + ledger posted | SUCCEEDED | A | payment journal | balance updated | PROCESSED | p15-3 integration | PASS |
| PT-011 | Duplicate webhook | PG+simulate | same payload twice | DUPLICATE | DUPLICATE status | SUCCEEDED unchanged | n/a | no double post | unchanged | dedupe | p15-3 integration | PASS |
| PT-012 | Provider idempotency | PG+simulate | same idempotency key | same provider ref | same ref, fn not re-run | n/a | n/a | n/a | n/a | n/a | p15-3 integration | PASS |
| PT-013 | Router resolves paytabs | PG | org route SAR | paytabs | paytabs | n/a | n/a | n/a | n/a | n/a | p15-3 integration | PASS |
| PT-014 | Internal sandbox regression | PG | sandbox checkout | SUCCEEDED | SUCCEEDED | SUCCEEDED | sandbox | ledger | balance | sandbox wh | phase5 tests | PASS |
| PT-015 | Capture coalesced | simulate | capture after HPP | SUCCEEDED no-op | SUCCEEDED | n/a | n/a | n/a | n/a | n/a | contract test | PASS |
| PT-016 | Void | simulate | void call | NOT_AVAILABLE | NOT_AVAILABLE | n/a | n/a | n/a | n/a | n/a | NOT VERIFIED | PASS (expected) |

---

## Webhook test matrix (spec P15.3-E)

| # | Scenario | Covered | Test ID | Result |
|---|---|---|---|---|
| 1 | Single webhook | Yes | PT-010 | PASS |
| 2 | Duplicate webhook | Yes | PT-011 | PASS |
| 3 | Out-of-order | Partial | phase5 sandbox | PASS (sandbox); PayTabs specific via state machine |
| 4 | Invalid signature | Yes | PT-006 | PASS |
| 5 | Malformed payload | Partial | contract parse errors | PASS |
| 6 | Missing required fields | Partial | webhook.ts tran_ref/cart_id check | NOT EXPLICIT TEST |
| 7 | Webhook after terminal payment | Partial | webhook-state-apply terminal guard | PASS (phase5) |
| 8 | Webhook after refund | Partial | refund-conformance | PASS (sandbox) |
| 9 | Unknown provider event | Partial | unmapped_event_type | NOT EXPLICIT TEST |
| 10 | Unknown provider status | Partial | maps to PENDING | NOT EXPLICIT TEST |

---

## Idempotency evidence

| Case | Result | Test |
|---|---|---|
| Duplicate authorize key | Same provider reference | PT-012 |
| Retry after timeout | TIMEOUT → query before retry | PT-008 |
| Duplicate webhook | DUPLICATE, no double ledger | PT-011 |

---

## P15.4 — Real sandbox evidence

| Test ID | Scenario | Environment | Expected | Actual | Result |
|---|---|---|---|---|---|
| PT4-SEC-01 | Valid webhook signature | simulate contract | accept | accept | PASS |
| PT4-SEC-02 | Invalid signature | simulate contract | reject | reject | PASS |
| PT4-SEC-03 | Missing signature | simulate contract | reject | reject | PASS |
| PT4-SEC-04 | Malformed payload | simulate contract | reject | reject | PASS |
| PT4-SEC-05 | Unknown event type | simulate contract | normalize safely | normalize | PASS |
| PT4-SEC-06 | LIVE webhook blocked | simulate contract | reject | reject | PASS |
| PT4-SEC-07 | Query recovery after unknown | simulate | SUCCEEDED/PENDING | mapped | PASS |
| PT4-CFG-01 | PAYTABS_ENV=live blocked | unit | throw | throw | PASS |
| PT4-CFG-02 | Credential gate missing keys | unit | BLOCKED message | BLOCKED | PASS |
| PT4-001 | Real HTTP payment create | **real HTTP** | REQUIRES_ACTION | not executed | **BLOCKED** |
| PT4-002 | Real HTTP status query | **real HTTP** | status mapped | not executed | **BLOCKED** |
| PT4-WH | Real inbound webhook | **real HTTPS** | PROCESSED + ledger | not executed | **NOT VERIFIED** |
| PT4-3DS | Real 3DS HPP | **real HPP** | REQUIRES_ACTION flow | not executed | **BLOCKED** |
| PT4-RF | Real sandbox refund | **real HTTP** | refund + ledger | not executed | **BLOCKED** |

### To unblock real HTTP certification

1. Obtain PayTabs **sandbox** server key + profile ID from merchant portal
2. Set env vars (never commit): `PAYTABS_SANDBOX_SERVER_KEY`, `PAYTABS_SANDBOX_PROFILE_ID`
3. Set `PAYTABS_REAL_SANDBOX_CERT=true`, `PAYTABS_ADAPTER_MODE=http`
4. Expose public HTTPS webhook URL for PayTabs callback registration
5. Re-run: `npm run test:pg` or `npx vitest run tests/p15-4-paytabs-real-sandbox.test.ts`

---

## Gaps (honest)

| Case | Status |
|---|---|
| Real PayTabs sandbox HTTP round-trip | **BLOCKED** — credentials not in execution environment |
| Real PayTabs sandbox webhook from PayTabs servers | **NOT VERIFIED** — no public HTTPS endpoint |
| 3DS card entry on PayTabs hosted page | **BLOCKED** — requires real HTTP + manual HPP |
| Real sandbox refund | **BLOCKED** — requires completed real payment |

P15.3 SANDBOX_TESTED remains valid for adapter architecture + simulate certification.
P15.4 adds contract/security hardening + credential gate; full CERTIFIED requires merchant sandbox keys.

---

## P15.5 — Real Sandbox E2E Certification

**Date:** 2026-08-10  
**Preflight:** `node scripts/paytabs-sandbox-preflight.mjs` → exit **2** (blocked)  
**Provider status:** **SANDBOX_TESTED** (not CERTIFIED)

### Evidence tier update

| Tier | Phase | Mode | Status |
|---|---|---|---|
| Preflight gating | P15.5 | preflight module + CLI | PASS |
| Real HTTP connectivity | P15.5 | `httpReady` | **BLOCKED** — credentials |
| Real payment creation | P15.5 | `httpReady` | **BLOCKED** |
| Real HPP / 3DS | P15.5 | manual on PayTabs page | **NOT VERIFIED** |
| Real inbound webhook | P15.5 | PayTabs → public HTTPS | **NOT VERIFIED** |
| Real webhook signature (PayTabs-issued) | P15.5 | live callback | **NOT VERIFIED** |
| Real refund | P15.5 | after real payment | **NOT VERIFIED** |
| Real ledger/balance | P15.5 | after real payment | **NOT VERIFIED** |
| Real idempotency | P15.5 | sandbox HTTP | **NOT VERIFIED** |

### P15.5 test matrix

| Test ID | Scenario | Environment | Expected | Actual | Provider Ref | Payment State | Webhook | Ledger | Balance | Evidence | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PT5-PF-01 | Preflight no secrets | unit | safe report | safe report | n/a | n/a | n/a | n/a | n/a | p15-5-real-e2e.test.ts | PASS |
| PT5-PF-02 | Blockers when creds absent | unit | blockers listed | blockers listed | n/a | n/a | n/a | n/a | n/a | p15-5-real-e2e.test.ts | PASS |
| PT5-HTTP-01 | Real payment create | real HTTP | REQUIRES_ACTION | not executed | n/a | n/a | n/a | n/a | n/a | skipped | **BLOCKED** |
| PT5-HTTP-02 | Real status query | real HTTP | mapped status | not executed | n/a | n/a | n/a | n/a | n/a | skipped | **BLOCKED** |
| PT5-HTTP-03 | Query recovery | real HTTP | recoveredViaQuery | not executed | n/a | n/a | n/a | n/a | n/a | skipped | **BLOCKED** |
| PT5-E2E-01 | Checkout REQUIRES_ACTION | real E2E | REQUIRES_ACTION | not executed | n/a | n/a | n/a | n/a | n/a | skipped | **BLOCKED** |
| PT5-E2E-02 | Webhook → ledger | real E2E | PROCESSED + SUCCEEDED | not executed | n/a | n/a | n/a | n/a | n/a | skipped | **BLOCKED** |
| PT5-E2E-03 | Router idempotency | real E2E | same ref | not executed | n/a | n/a | n/a | n/a | n/a | skipped | **BLOCKED** |
| PT5-BLOCKED | Documents E2E block | unit | e2eReady=false | e2eReady=false | n/a | n/a | n/a | n/a | n/a | p15-5-real-e2e.test.ts | PASS |
| PT5-WH-BLOCKED | Public webhook required | unit | not configured | not configured | n/a | n/a | n/a | n/a | n/a | p15-5-real-e2e.test.ts | PASS |
| PT5-3DS-BLOCKED | Real 3DS HPP | manual | authenticated | not executed | n/a | n/a | n/a | n/a | n/a | n/a | **NOT VERIFIED** |
| PT5-RF-BLOCKED | Real refund | real HTTP | refund + ledger | not executed | n/a | n/a | n/a | n/a | n/a | n/a | **NOT VERIFIED** |

### Preflight module tests (PASS)

| Test ID | Scenario | Result |
|---|---|---|
| PT5-PFL-01 | Reject localhost callback | PASS |
| PT5-PFL-02 | Accept public HTTPS callback | PASS |
| PT5-PFL-03 | Safe summary without secrets | PASS |
| PT5-PFL-04 | e2eReady false without credentials | PASS |

---

## GCC activation kickoff (2026-08-11)

See [GCC_PAYTABS_ACTIVATION.md](./GCC_PAYTABS_ACTIVATION.md).

| Check | Result |
|---|---|
| `npm run paytabs:preflight` | Exit 2 — `e2eReady=false` (expected) |
| Credentials | Missing PROFILE_ID + SERVER_KEY |
| Public HTTPS webhook | Not configured |
| `PAYTABS_REAL_SANDBOX_CERT` | false in current env |
| LIVE | Still blocked |

**Next human action:** Create PayTabs GCC sandbox merchant, set local `.env`, re-run preflight until `e2eReady=true`, then execute GCC-PT-01..06.
