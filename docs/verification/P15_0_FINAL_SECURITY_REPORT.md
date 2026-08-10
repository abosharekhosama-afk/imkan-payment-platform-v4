# P15.0 Final Security Report

**Date:** 2026-08-10  
**Phase:** P15.0 — Production Security, Tenant Isolation & Authorization Hardening  
**Overall:** **PARTIAL**  
**Production Ready:** **NOT claimed** (Production Gate remains NOT PASSED)

---

## A. Executive Summary

P15.0 hardened authentication boundaries, tenant isolation, step-up purpose binding, onboarding backend gate, webhook tenant resolution, URL safety, ledger DB immutability, rate-limit abstraction, and security documentation/tests.

Evidence: code + migration `028` + `npm run test:pg` → **18 suites / 126 tests PASS**.

Residual production blockers remain (distributed rate limit, KMS, cookie sessions, external PCI, live providers). P15.0 is **PARTIAL**, not Production Ready.

---

## B. Authentication

**PASS** (baseline retained + rate-limit buckets on login/register/password/MFA).

Evidence: scrypt passwords, lockout, sessions, email verification, `tests/phase2-identity.test.ts`, `tests/foundation-api.test.ts`.

---

## C. MFA / Step-up

**PASS**

- Step-up tokens bind to `purpose`
- `requireStepUp(opCode)` consumes matching purpose (legacy `SENSITIVE` wildcard retained)
- Settlements POST requires `settlements.manage` step-up

Evidence: `identity-phase2.ts`, `authz.ts`, `tests/security/p15-0-security.test.ts` (purpose mismatch).

---

## D. RBAC

**PASS** (catalog + role matrix retained; no privilege widening).

Evidence: `phase6_6-rbac.test.ts`, permission catalog, custom-role subset rule.

---

## E. Tenant Isolation

**PASS** (app-layer)

- Org-scoped queries; webhook org from `payment_intents` only
- Payment link locks include `organization_id` where applicable
- Cross-tenant payment/refund negative tests

Evidence: `p15-0-security.test.ts`, `phase6_6-rbac.test.ts`, `refund-conformance.test.ts`.

---

## F. IDOR

**PASS** for covered resources (payments, refunds, payment links, customers via prior suites).

Org B → Org A payment/refund → 403/404.

---

## G. Privilege Escalation

**PASS**

Viewer cannot create links/refund; custom role / OWNER assign guards retained (`phase6_6-rbac.test.ts`).

---

## H. API Security

**PASS** for AuthZ chain on money/admin routes.

Tenant authority from session/API key org — not `body.organization_id`.

New: `GET /api/v1/merchant/onboarding-gate`.

---

## I. Webhook Security

**PASS** (sandbox path)

- Signature + nonce replay
- Tenant from PI row; payload `organization_id` ignored (`sandbox-adapter.ts`)
- Refund events not treated as payment success (`webhook-state-apply.ts`)

Evidence: `phase5-providers.test.ts`, `p15-0-security.test.ts` forged-org apply.

---

## J. Financial Integrity

**PARTIAL → improved**

- Ledger posting in same TX as payment success / refund (prior)
- Migration `028` blocks UPDATE/DELETE on `ledger_journals` / `ledger_entries`
- Full Financial Core (fees/FX/settlement integrity) = **P15.1**

---

## K. Secrets

**PARTIAL**

API key hashing retained; provider secrets not returned in normal APIs; document `storage_key` omitted from client projections. Pepper/HMAC and per-account webhook secrets remain open.

---

## L. Encryption

**PARTIAL**

Bank AES-GCM at rest (env key). Production KMS abstraction documented as requirement — not fake Production KMS.

---

## M. Rate Limiting

**BLOCKED for multi-instance production** / **PASS for single-process local**

- Abstraction: `rate-limit-store.ts` (in-memory default; Redis stub)
- Policy: `docs/security/RATE_LIMITING_POLICY.md`
- Auth buckets wired; non-prod headroom for test suites
- Redis backend **not wired** → production multi-instance **BLOCKED**

---

## N. Audit Logging

**PASS** (sensitive ops continue to write audit/security events). No secrets in audit payloads by design.

---

## O. Card Data / PCI

**PASS (design only — no PCI claim)**

`docs/security/CARD_DATA_FLOW.md`. PAN/CVV rejected at checkout APIs. Hosted/token path preferred.

---

## P. KYB Files

**PARTIAL / BLOCKED (malware scan)**

Metadata + tenant isolation + no `storage_key` in API responses. Signed private object storage + malware scanning architecture still future.

---

## Q. Database Security

**PASS** (additive)

Migration `028_ledger_immutability.sql` applied and verified. Prior FKs/CHECKs retained. RLS **deferred** — see `P15_0_RLS_ASSESSMENT.md`.

---

## R. Security Testing

**PASS**

`tests/security/p15-0-security.test.ts` — 12 tests (auth 401, URL safety, onboarding backend gate, IDOR, viewer deny, step-up purpose, webhook forge, ledger immutability, SSRF URL).

---

## S. E2E Testing

**PARTIAL**

Added `apps/web/e2e/security/role-matrix-security.spec.ts`.  
**Not executed in this run** (requires `e2e-v4-stack` + credentials). Existing `role-matrix.spec.ts` remains the primary browser matrix when stack is up.

---

## T. Remaining Risks

1. In-memory rate limit across instances  
2. Bearer token in `localStorage` (XSS → session theft)  
3. Shared sandbox webhook secret  
4. No RLS (app-layer only)  
5. KYB binary storage / malware scan not production-shaped  
6. Impersonation not implemented (intentional)

---

## U. Production Blockers

| Blocker | Status |
|---|---|
| Distributed rate limit (Redis) | BLOCKED |
| KMS for secrets/bank keys | BLOCKED (P15.4) |
| Live provider / production capture | NOT IN SCOPE (P15.2) |
| External PCI assessment | BLOCKED (DEC-011 / P15.5) |
| Cookie/HttpOnly session migration | PARTIAL |
| Production Gate | NOT PASSED |

---

## V. Files Changed (primary)

| Area | Files |
|---|---|
| Onboarding gate | `apps/api/src/security/onboarding-gate.ts`, `phase3-routes.ts` |
| Sensitive ops | `apps/api/src/security/sensitive-operations.ts` |
| URL safety | `apps/api/src/security/url-safety.ts` |
| Rate limit | `rate-limit.ts`, `rate-limit-store.ts`, `routes.ts`, `phase2-routes.ts` |
| Payments | `payment-links-service.ts`, `payment-core-service.ts` |
| Webhooks | `webhook-service.ts`, `sandbox-adapter.ts` |
| Documents | `documents-service.ts` |
| Config | `config.ts` (`requireKybForPayments`, `enableLegacyV1`) |
| Frontend | `OnboardingGate.tsx`, `OnboardingWizardPage.tsx` |
| Tests | `tests/security/p15-0-security.test.ts`, `phase5-providers.test.ts` |
| E2E | `apps/web/e2e/security/role-matrix-security.spec.ts` |
| Docs | `docs/security/P15_0_*.md`, `RATE_LIMITING_POLICY.md`, `CARD_DATA_FLOW.md` |
| Verify | `scripts/verify-foundation-pg.mjs` |

---

## W. Migrations Added

- `database/migrations/postgres/028_ledger_immutability.sql`

---

## X. Tests Executed

| Command | Result |
|---|---|
| `npm run test:pg` | **PASS** — 18 files, **126 passed**, **0 failed** |
| Playwright e2e security | **Not run** (stack not started) |

---

## Y. Evidence

- Migration list includes `028_ledger_immutability.sql`
- `docs/testing/POSTGRES_RUNTIME_VERIFICATION.md` status PASS after this run
- Security suite assertions: unauth 401, onboarding 403 without KYB, cross-tenant deny, step-up purpose mismatch, unsafe URL 400, ledger immutable

---

## Required 20-point closeout

1. **Weak before:** sessionStorage onboarding skip; webhook org from payload; step-up unbound; settlements without step-up; ledger mutable at DB; localhost URLs allowed; legacy `/v1` default-on in prod; in-memory RL undocumented.
2. **Fixed:** backend KYB gate; webhook tenant from PI; purpose-bound step-up; settlements step-up; URL safety; ledger triggers; frontend skip removed; auth RL buckets; docs + security suite.
3. **Was missing:** central onboarding gate service; RLS assessment; rate-limit store abstraction; CARD_DATA_FLOW; P15 threat/control docs.
4. **Reused:** existing RBAC, MFA, idempotency, audit, sandbox adapter, AuthZ middleware, role-matrix E2E patterns.
5. **Files changed:** see §V.
6. **Migrations:** `028`.
7. **APIs changed:** `GET /merchant/onboarding-gate`; stricter payment-link/checkout URL + KYB; webhook tenant resolve; auth RL; settlements already step-up.
8. **UI changed:** OnboardingGate (no sessionStorage); wizard (no Continue anyway).
9. **Permissions:** no widening; step-up registry reused.
10. **Controls added:** onboarding gate, URL safety, ledger immutability, rate-limit store, purpose step-up, webhook org trust model.
11. **Tenant isolation tested:** payment GET, refund, webhook apply forge, prior suite resources.
12. **Vulnerabilities found:** onboarding bypass; webhook tenant forge; unbound step-up; SSRF/open-redirect URLs; ledger mutability; `recordSuccessfulUse` ReferenceError during hardening (fixed).
13. **Vulnerability status:** fixed or BLOCKED/PARTIAL as above.
14. **Tests:** full `test:pg` list + new security suite.
15. **Passed:** 126.
16. **Failed:** 0 (final run).
17. **Not run:** Playwright e2e security (no live stack).
18. **Production blockers:** Redis RL, KMS, PCI external, live provider, cookie sessions, Production Gate.
19. **Next dependencies:** P15.1 Financial Core & Settlement Integrity (only after this phase closes).
20. **P15.0 verdict:** **PARTIAL**.

---

## Z. Closure Verification (2026-08-10)

### Baseline

| Item | Result |
|---|---|
| Command | `npm run test:pg` |
| Suites | 18 |
| Passed | **126** |
| Failed | **0** |
| Skipped | **0** (within executed files) |
| Duration (final closure re-run) | ~23–29s vitest portion |
| Overall | **PASS** |

Checkout / payment-link / billing renewal covered inside the same suite (phase4, phase5, phase6-billing).

### Closure hardening (minimal)

| File | Reason | Change | Test |
|---|---|---|---|
| `payment-links-service.ts` | Close id-only fallback path | `recordSuccessfulUse` **requires** `organizationId`; UPDATE also org-scoped | phase4 happy path + one-time limits |
| `phase2-routes.ts` | Auth RL gaps | Wire `users.invite`, `auth.email_verification` on invite/verify/resend | phase2 identity |
| `rate-limit.ts` | Documented buckets | Add `auth.email_verification` bucket | suite green |

### Subsystem results

| Area | Result | Evidence |
|---|---|---|
| Security suite | **PASS** | `tests/security/p15-0-security.test.ts` (12) inside test:pg |
| Checkout regression | **PASS** | phase4 sandbox happy path 2xx; use_count incremented |
| `recordSuccessfulUse` | **PASS** | Caller passes `session.organization_id`; required param |
| Tenant isolation | **PASS** | p15 cross-tenant payment/refund; phase4/6_6 |
| Webhook forged tenant | **PASS** | p15 + phase5 webhook tests |
| RBAC | **PASS** | phase6_6 + p15 viewer deny |
| Step-up purpose | **PASS** | p15 purpose mismatch |
| Ledger immutability | **PASS** | p15 UPDATE/DELETE rejected |
| SSRF URLs | **PASS** | p15 unsafe URL 400 |
| Billing renewal | **PASS** | phase6-billing renewal success |
| Auth HTTP RL wiring | **PASS** (single-process) | login/register/reset/verify/mfa/invite |
| Distributed RL (Redis) | **BLOCKED** | in-memory store only |
| E2E security | **NOT RUN** | `http://127.0.0.1:3000` / `:5173` unreachable; credentials file stale |

### Final evidence table

| Evidence | Result |
|---|---|
| PostgreSQL tests | **PASS** (126/126) |
| Security tests | **PASS** |
| Checkout regression | **PASS** |
| Payment Link | **PASS** |
| Billing renewal | **PASS** |
| Cross-tenant payment | **PASS** |
| Cross-tenant refund | **PASS** |
| Webhook forged tenant | **PASS** |
| Step-up purpose | **PASS** |
| Ledger immutability | **PASS** |
| SSRF | **PASS** |
| RBAC | **PASS** |
| E2E security | **NOT RUN** — e2e-v4-stack unavailable |
| Documentation consistency | **PASS** (updated to match code) |

### Remaining blockers (unchanged)

Redis distributed RL · KMS · HttpOnly cookie sessions · External PCI · Live Provider · Production Gate · RLS deferred

### Closure verdict

**P15.0 = PARTIAL**

No in-scope open security defect that requires **BLOCKED**. External/dependency blockers + E2E not executed prevent **PASS**.

**STOP** — do not start P15.1.