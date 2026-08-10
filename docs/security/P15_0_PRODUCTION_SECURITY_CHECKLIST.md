# P15.0 — Production Security Checklist

**Product:** IMKAN Payments V4  
**Date:** 2026-08-10  
**Rule:** Mark **PASS** only with concrete evidence (file, test, config, or ticket).  
**Production Ready:** **NOT claimed** — remaining blockers listed in §3.

Status: PASS | PARTIAL | BLOCKED | NOT IMPLEMENTED | N/A

---

## 1. Checklist

| # | Control / gate | Required evidence | Evidence (fill / known) | Status |
|---|---|---|---|---|
| 1 | Passwords hashed with scrypt | Code + auth tests | `foundation/crypto.ts`; phase2 login tests | **PASS** |
| 2 | Account lockout on failed login | DB fields + identity logic | `failed_login_count` / `locked_until` in `identity-service.ts` | **PASS** |
| 3 | MFA available for users | Enable + verify routes | `identity-phase2` / phase2 routes | **PASS** |
| 4 | Step-up bound to operation purpose | Issue/consume bind op code | P15.0 fix; `p15-0-security` tests | **PASS** |
| 5 | Settlements require step-up | Route preHandler | `phase7-financial-routes` + tests | **PASS** |
| 6 | RBAC enforced on V4 routes | Permission catalog + matrix tests | phase6_6 + Playwright role-matrix (CI run may be PARTIAL) | **PARTIAL** |
| 7 | Tenant isolation app-layer | Cross-tenant 404/403 tests | `TENANT_ISOLATION_MODEL.md`; suites | **PASS** (app-layer) |
| 8 | Postgres RLS defense-in-depth | Policies + pool-safe GUC design | `P15_0_RLS_ASSESSMENT.md` — deferred | **BLOCKED** (deferred by design) |
| 9 | Onboarding enforced on money APIs | Persist + server checks | P15.0 OnboardingGate + payment-core/links | **PASS** |
| 10 | Webhook org from DB not payload | Adapter + apply path | P15.0 sandbox/webhook fix + tests | **PASS** |
| 11 | Webhook signature verification | Shared secret HMAC | `WEBHOOK_SIGNING_SECRET` / sandbox adapter | **PARTIAL** (shared secret) |
| 12 | Per-account webhook secrets | Distinct secret per provider account | — | **NOT IMPLEMENTED** → remaining blocker |
| 13 | Idempotency on financial writes | PreHandler + unique constraints | Most Phase 4/7 paths; gaps bank/link | **PARTIAL** |
| 14 | Ledger immutable at DB | Triggers reject UPDATE/DELETE | Migration 028 + p15-0-security | **PASS** |
| 15 | No PAN/CVV storage or accept | Reject + schema | `CARD_DATA_FORBIDDEN`; phase4 Zod | **PASS** (engineering) |
| 16 | Formal PCI scope / SAQ | DEC-011 + external assessment | `P12_SECURITY_PCI.md` | **BLOCKED** (DEC-011) |
| 17 | Live payment provider certified | Live credentials + runbooks | Sandbox only / gated live keys | **BLOCKED** |
| 18 | Rate limit abstraction | `RATE_LIMIT_PLAN` + preHandler | `rate-limit.ts` | **PASS** |
| 19 | Distributed rate limit (Redis) | Shared store wired in all API replicas | In-memory Map only | **BLOCKED** |
| 20 | Auth endpoint rate limits | Buckets for login/signup/reset/MFA/invite/verify | Wired: `auth.login`, `auth.register`, `auth.password_reset`, `auth.email_verification`, `auth.mfa`, `users.invite` on routes; store still in-memory | **PARTIAL** (wired; Redis still BLOCKED) |
| 21 | Bank data encryption at rest | AES-GCM + masks | `crypto.ts`; phase3 tests | **PASS** |
| 22 | KMS / managed key rotation | KMS integration + rotation runbook | Env key only | **BLOCKED** (planned P15.4) |
| 23 | API key hashed; shown once | Create response + `key_hash` | `api-keys.ts`; phase5 | **PASS** (hash); pepper **PARTIAL** |
| 24 | SSRF-safe public URLs | Reject private/localhost | `url-safety.ts`; p15-0-security | **PASS** |
| 25 | Helmet + CORS | Server bootstrap | `server.ts` | **PASS** |
| 26 | Legacy `/v1` off by default in production | Config default | `config.ts` / `server.ts` P15.0 | **PASS** |
| 27 | Session in HttpOnly Secure cookies | Cookie auth + CSRF strategy | Bearer in `localStorage` (`AuthProvider`) | **PARTIAL** → remaining blocker for hardened browser session |
| 28 | CSRF strategy documented for future cookies | Doc when moving off bearer | CSRF N/A while bearer-only | **PASS (N/A)** today |
| 29 | Secrets required in production startup | `requiredInProduction` | `config.ts` | **PASS** |
| 30 | Audit events on sensitive ops | Audit writes | sensitive-operations + services | **PARTIAL** (coverage uneven) |
| 31 | Log/PII redaction | `redact.ts` + server REDACT | Present; nested key gaps | **PARTIAL** |
| 32 | Platform Admin dedicated UI | Separate surface | — | **NOT IMPLEMENTED** |
| 33 | Penetration test | External report | — | **NOT IMPLEMENTED** |
| 34 | Security test suite in CI | CI green on p15-0-security + phase suites | `npm run test:pg` includes p15-0 (126/126 closure) | **PASS** (local embedded PG evidence) |
| 35 | KYB `storage_key` omitted from API | Response projection | `documents-service.projectDocument` omits `storage_key` | **PASS** |
| 36 | Checkout `recordSuccessfulUse` org-scoped | Required `organizationId`; no undefined | `payment-links-service.ts` + phase4 happy path | **PASS** |
| 37 | E2E security role matrix executed | Playwright against live stack | Spec exists; stack was down at closure | **NOT RUN** |

---

## 2. Evidence discipline

- **PASS** requires a pointer: path, migration id, or test name.  
- **PARTIAL** must name the gap.  
- **BLOCKED** must name the dependency (Redis, KMS, DEC-011, live provider, etc.).  
- Do **not** upgrade PARTIAL→PASS because “works on my machine” without shared-store / external gates.

---

## 3. Remaining blockers (must clear before any Production Ready claim)

| Blocker | Why it blocks | Tracking |
|---|---|---|
| **Redis-backed rate limiting** | Multi-instance deployments bypass in-memory counters | `RATE_LIMITING_POLICY.md`; audit Rate limiting |
| **KMS (or equivalent) for bank/crypto keys** | Env-only keys hinder rotation & custody | `BANK_DATA_PROTECTION.md`; P15.4 |
| **Live provider production gate** | Sandbox ≠ production acquiring | DEC / ops production gate |
| **PCI external gate (DEC-011)** | No formal SAQ/AoC; engineering “no PAN” ≠ compliance | `P12_SECURITY_PCI.md`, `CARD_DATA_FLOW.md` |
| **HttpOnly cookie sessions** | XSS can steal `localStorage` bearer | AuthProvider; audit Session storage |
| **Per-account webhook secrets** | Shared sandbox secret → forge blast radius across accounts | config / sandbox-adapter; audit |

Additional non-negotiables for a future Production Ready review (not all P15.0 scope): RLS after pool design (`P15_0_RLS_ASSESSMENT.md`), auth HTTP buckets, API key pepper, Platform Admin UI, pen test.

---

## 4. Verdict

P15.0 **improved** several critical controls (webhook tenant binding, onboarding enforcement, step-up purpose binding, settlements step-up, ledger immutability, URL safety, legacy prod default).  

**Checklist overall: NOT Production Ready.** Multiple rows remain **BLOCKED** or **PARTIAL** with explicit residual risk. Use this checklist as a gate — do not ship a Production Ready label until §3 blockers are closed with evidence.
