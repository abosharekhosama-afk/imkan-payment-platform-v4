# TEST PLAN — IMKAN Payments V4

**Phase:** ANALYSIS ONLY  
**Date:** 2026-08-08  
**Authority:** V4 §19, §22; New-folder `08-TESTING-SPEC.md`; Addendum `11`  
**Pyramid:** Unit → Integration → API → E2E → Security → Financial Invariants → Production Readiness

---

## 1. Current testing baseline

| Type | Present | Location |
|---|---|---|
| Unit / domain | Yes | `tests/*.test.ts` (payment-state, ledger, billing, invoice, subscription) |
| API integration | Minimal | smoke script `scripts/e2e-smoke.sh` |
| E2E UI | No | — |
| Security suite | No dedicated suite | — |
| Financial abuse / races | Partial via domain tests | Needs expansion |
| Provider webhook forgery/replay | Missing | — |
| Tenant isolation automated | Missing as systematic suite | — |

**Reuse:** Keep Vitest + domain-first tests; expand into PG integration tests and API/E2E/security packs per phase.

---

## 2. Test environments

| Env | Purpose | Rules |
|---|---|---|
| `test` | CI automated | PostgreSQL test DB; sandbox provider only |
| `local` | Dev | PG + sandbox; no live credentials required |
| `sandbox` | Pre-prod integration | Provider sandbox creds only |
| `production` | Real money | **No** simulated success paths; gated by Phase 10 |

Never mix sandbox and production credentials/data in the same test run.

---

## 3. Quality gates (every phase)

A phase may close only if:

1. New/changed unit + integration tests pass
2. Authorization + tenant isolation tests for touched resources pass
3. If money moved: financial invariant tests pass
4. API contract tests for touched endpoints pass
5. UI smoke/E2E for touched screens pass (or justified deferral only for pure backend phases)
6. Error-path tests exist for critical failures
7. `docs/implementation/<operation>.md` updated with results
8. No open **Critical** defects in-phase

---

## 4. Cross-cutting mandatory suites

### 4.1 Authorization & Tenant Isolation (every phase with APIs)

For each resource type touched:

| Case | Expected |
|---|---|
| No auth | 401 |
| Valid auth, missing permission | 403 |
| Merchant role calling Admin API | 403 |
| Org A token on Org B resource id | 404/403 (no leakage) |
| Listing endpoints | only current org rows |
| Public tokens | cannot escalate to authenticated org APIs |

### 4.2 Financial Invariants (any financial mutation)

| Invariant | Assert |
|---|---|
| refund ≤ captured | reject over-refund |
| payout ≤ eligible balance | reject over-payout |
| no duplicate financial effect | idempotent retries same result |
| duplicate webhook | no second ledger effect |
| ledger balance | debits == credits per TX |
| currency explicit | reject missing/mismatch currency |
| exact money | no float; NUMERIC path |
| failed external call | no ambiguous posted state |

### 4.3 Idempotency & Concurrency

- Same `Idempotency-Key` replay returns original result
- Parallel capture/refund/payout attempts → single effect
- Use DB transactions + row locks; test under parallel workers

### 4.4 Webhook security (Providers phase+)

- Invalid signature rejected
- Replay rejected/ignored safely
- Out-of-order handling documented + tested
- Unknown event type safe failure

### 4.5 Error handling

- Consistent error shape + request id
- No stack/secrets in client responses
- Provider timeouts mapped safely
- Validation errors do not partial-commit financial TX

---

## 5. Critical journey coverage (V4 §19)

| Journey | Phase focus | Levels |
|---|---|---|
| Registration | Identity | API + E2E + security |
| Login / AuthZ | Identity | API + security |
| KYB submit/review | Merchant/KYB | API + E2E + AuthZ |
| Documents upload/access | Merchant/KYB | API + security |
| Bank verification / change | Merchant/KYB | API + step-up + audit |
| Payment (intent→capture) | Payments | unit + API + E2E + financial |
| Refund / partial refund | Payments | financial + AuthZ |
| Payment Link checkout | Payments | API + E2E |
| Subscription + invoice | Billing | after DEC-007 |
| Payout | Financial | financial + AuthZ + step-up as required |
| Settlement | Financial | integration + reconciliation |
| Reconciliation | Financial | invariants |
| Provider webhook | Providers | security + financial |
| Books sync | Books | idempotency + failure recovery |
| Master Data consume/admin | Merchant/Admin | API + AuthZ |

---

## 6. Phase test plans

### Phase 0 — Analysis

- [x] Spec/code review complete
- [x] Plans published
- No runtime test expansion required

### Phase 1 — Foundation

| Suite | Cases |
|---|---|
| Unit | config parsing, redaction helpers |
| Integration | PG migrate up on clean DB; health/ready |
| Security | production config rejects missing secrets; sandbox/live env slots not mixed |
| Docs | foundation implementation record |

### Phase 2 — Identity / Tenant

| Suite | Cases |
|---|---|
| API | register/verify/login/logout/reset/MFA |
| Security | lockout, reset token reuse, RBAC matrix smoke, cross-org membership |
| E2E | login → me → logout |
| Negative | `X-Tenant-ID` bypass disabled in secured modes |

### Phase 3 — Merchant / KYB

| Suite | Cases |
|---|---|
| API | onboarding steps, verification state transitions |
| AuthZ | merchant cannot approve own KYB as platform |
| Security | document IDOR, masked bank fields |
| E2E | wizard happy path in sandbox |
| Block | external KYB vendor assertions without DEC-010 |

### Phase 4 — Payments

| Suite | Cases |
|---|---|
| Unit | state machine, money helpers (approved DEC-001) |
| API | intent/session/pay/refund/links |
| Financial | refund caps, idempotent pay, ledger posts with sandbox |
| UI | checkout + result + console lists |
| Security | public token scope, branding XSS inputs |

### Phase 5 — Providers

| Suite | Cases |
|---|---|
| Contract | adapter interface conformance (sandbox + verified adapter) |
| Security | webhook forge/replay |
| Routing | capability deny; fallback no double charge |
| Isolation | sandbox creds cannot call live endpoints |

### Phase 6 — Billing

| Suite | Cases |
|---|---|
| Unit/API | subscription states per DEC-007 |
| Financial | renewal ledger effects per Decision only |
| Negative | unspecified dunning not implemented/tested as if real |

### Phase 7 — Financial Core

| Suite | Cases |
|---|---|
| Financial abuse | double pay/refund/payout, races, negative balance attempts |
| Ledger | consistency under concurrency |
| API | balance views Available/Pending/Reserved/Total |
| Reconciliation | match/mismatch handling |

### Phase 8 — Risk / Disputes

| Suite | Cases |
|---|---|
| AuthZ | role gates |
| API | dispute lifecycle |
| Financial | any reserve/hold only if decided |

### Phase 9 — Books

| Suite | Cases |
|---|---|
| Idempotency | duplicate outbox → one books effect |
| Failure | retry + dead-letter/failure state |
| AuthZ | sync status access |

### Phase 10 — Security / Production

| Suite | Cases |
|---|---|
| Full security campaign | see Security plan §6 |
| Backup/restore drill | evidence artifact |
| Dependency SCA | CI report |
| Production readiness pack | sign-off checklist |

---

## 7. Financial abuse suite (explicit)

Must exist by Financial Core / Production gate:

1. Double payment confirmation
2. Double refund
3. Double payout
4. Parallel refund vs capture race
5. Negative / zero / overflow amounts
6. Currency mismatch / missing currency
7. Unauthorized financial operation
8. Cross-tenant financial read/write
9. Webhook duplicate credit
10. Ledger imbalance attempt
11. Payout exceeding eligible balance
12. Sandbox simulation mis-labeled as live (config test)

---

## 8. Tooling plan

| Layer | Proposed tooling | Notes |
|---|---|---|
| Unit/Integration | Vitest (existing) | Add PG test containers or CI service |
| API | Vitest + supertest/light-my-request against Fastify | Prefer in-process |
| E2E | Playwright (to introduce) | Merchant/Admin/Public critical paths |
| Security | custom suites + SCA (npm audit / equiv) | Evidence in `docs/security/` |
| Load/race | controlled parallel scripts for financial races | Not a substitute for correctness tests |

Do not introduce tools that require inventing business rules.

---

## 9. Evidence & documentation

For each significant operation:

- Tests added/updated listed in `docs/implementation/<operation>.md`
- Security tests called out separately
- Results (pass/fail) and limitations recorded
- Verification date set on phase close

Required folders (create during Foundation):  
`docs/testing/`, `docs/security/`, `docs/financial/`, `docs/implementation/`, `docs/decisions/`

---

## 10. Definition of “tested enough” for Production

Per V4 non-negotiables:

- NO FEATURE WITHOUT TESTING  
- NO FINANCIAL OPERATION WITHOUT SECURITY  
- NO PROVIDER WITHOUT DOCUMENTATION  
- NO PRODUCTION RELEASE WITHOUT SECURITY REVIEW  

Production Ready requires Phase 10 evidence pack, not demo screenshots.
