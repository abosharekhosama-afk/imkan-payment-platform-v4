# P15.0 — Security Control Matrix

**Product:** IMKAN Payments V4  
**Date:** 2026-08-10  
**Production Ready:** **NOT claimed**  
**Status legend:** PASS | PARTIAL | BLOCKED | NOT IMPLEMENTED  

Evidence sources: code under `apps/api`, `apps/web`, migrations, `tests/p15-0-security*`, phase suites, Playwright role-matrix.

| Control | Threat | Protection | Backend | DB | Frontend | Test | Status |
|---|---|---|---|---|---|---|---|
| Auth (password) | Credential stuffing / weak hash | scrypt password hash; failed-login lockout (`failed_login_count` / `locked_until`) | `identity-service.ts`, `crypto.ts` | `users` columns | Login/signup pages | phase2 | **PASS** |
| MFA | Stolen password session | TOTP MFA enable + step-up issuance | `identity-phase2.ts`, auth routes | MFA secret storage | Security pages | phase2 | **PASS** (self-serve) |
| Step-up | Confused deputy / sensitive op without recent MFA | Purpose-bound step-up token (`requireStepUp`); P15.0 binding fix | `authz`, sensitive-operations registry | Token consume | Step-up UX where wired | p15-0-security | **PASS** (binding FIXED); some ops still DEF in registry |
| RBAC | Unauthorized permission use | Permission catalog + role matrix; custom role cannot grant > own perms | `requirePermission`, custom-roles | `roles`, grants migrations 021/022/026 | Nav gated by perms | phase6_6, role-matrix | **PASS** |
| Tenant isolation | Cross-org data access | Org from session/API key only; reject `X-Tenant-ID`; service `organization_id` filters | `requireOrganizationContext` | No RLS (deferred) | Org-scoped API client | phase6_6, p15-0-security | **PARTIAL** (app-layer PASS; RLS **BLOCKED**/deferred) |
| IDOR | Guess UUID across tenants | Org match on resource load; prefer 404 | payment-links, payment-core locks hardened P15.0 | PK + org FK | N/A | p15-0-security | **PARTIAL→FIXED** locks; residual on any id-only path |
| Privilege escalation | Merchant → platform / over-grant | Platform perms not grantable in custom roles; assign guards | custom-roles, RBAC | System roles `organization_id NULL` | No Platform Admin UI | phase6_6 | **PASS** (API); Platform Admin UI **NOT IMPLEMENTED** |
| Rate limiting | Brute force / flood | Named buckets; 429 + `reset_at`; in-memory Map | `rate-limit.ts` | `rate_limit_events` | Retry UX optional | phase5 | **BLOCKED** for multi-instance (Redis); auth buckets **PARTIAL** |
| Secrets (config) | Env leak / weak defaults | `requiredInProduction` for critical secrets | `config.ts` | Secrets not in DB | N/A | startup guards | **PARTIAL** (dev fallbacks exist locally) |
| Encryption (bank) | PII at rest exposure | AES-256-GCM env key; masks + fingerprints | `crypto.ts` | ciphertext columns | Mask-only UI | phase3-crypto | **PASS** (env key); KMS **BLOCKED**/deferred P15.4 |
| Webhooks | Forged provider events / cross-tenant apply | Signature verify + nonce/dedupe; org from PI DB only (P15.0) | webhook-service, sandbox-adapter | `provider_webhook_*` | N/A | p15-0-security | **PARTIAL** — shared sandbox secret blast radius |
| Idempotency | Double capture / double refund | `Idempotency-Key` preHandler on financial/sensitive routes | `idempotency.ts` | Idempotency records / unique indexes | Clients send key | phase4/7 mixed | **PARTIAL** (gaps bank/link noted in audit) |
| Audit | Non-repudiation gap | `writeAuditEvent` / security events on sensitive ops | foundation audit helpers | audit tables | Limited UI | phase suites | **PASS** (core paths); coverage uneven |
| SQLi | Injection via inputs | Parameterized `pgQuery` / client.query | services | N/A | N/A | — | **PASS**; residual dynamic sort risk Low |
| XSS | Script injection in UI | React default escaping; no raw HTML render policy | N/A | N/A | V4 React pages | — | **PASS** (hard-coded UI) |
| CSRF | Cross-site state change | Bearer token in `Authorization` (not cookie session) | API expects bearer/API key | N/A | `localStorage` bearer | — | **PASS (N/A documented)** for cookie CSRF; cookie migration later changes this |
| SSRF / open URL | Webhook/success URL to internal nets | `assertSafePublicUrl` rejects private/localhost | `url-safety.ts` | N/A | Merchant URL fields | p15-0-security | **PASS** (P15.0 FIXED) |
| File security | Malicious KYB upload / key leak | Metadata + `storage_key` opaque; no full object store yet | `documents-service.ts` | document rows | Upload forms | phase3 | **PARTIAL** — `storage_key` may appear in API responses |
| Card data | PAN/CVV in IMKAN scope | Reject card fields; tokenized/hosted preference | payment-core, phase4 Zod | No PAN columns | Checkout token path | phase4 | **PASS** (engineering); PCI formal **BLOCKED** DEC-011 |
| Session | XSS → session theft | Bearer in `localStorage` | Session validation API | sessions table | `AuthProvider.tsx` | — | **PARTIAL** — HttpOnly cookie path later |
| API keys | Key theft / offline crack | SHA-256 `key_hash`; show once; scopes; revoke | `api-keys.ts` | `api_keys` | Developer settings | phase5 | **PARTIAL** — no pepper/HMAC yet |
| Provider credentials | Secret exfil / shared forge | Metadata + secret refs; sandbox shared signing secret | config, provider credential metadata | `provider_credentials_metadata` | Provider settings | phase5 | **PARTIAL** — per-account webhook secrets later; live store DEF |
| Financial integrity | Ledger tamper / unauthorized settlement | Step-up on settlements POST; ledger UPDATE/DELETE blocked by triggers (028) | phase7 routes, settlement services | ledger immutability triggers | Finance UI | p15-0-security | **PASS** (immutability + step-up FIXED); broader finance still evolving |
| Onboarding gate | Unverified merchant takes money | Persist + enforce on money APIs (P15.0) | payment-links, payment-core | org/onboarding state | `OnboardingGate` | p15-0-security | **PASS** (FIXED) |
| Legacy `/v1` surface | Dual-stack authz bugs | Production default off (P15.0) | `config.ts`, `server.ts` | N/A | Legacy console exists | pending | **FIXED** (prod default) |

---

## How to read Status

- **PASS** — control exists with test or strong code evidence for the stated scope; not a Production Ready claim for the whole product.  
- **PARTIAL** — control exists but known gaps remain (documented in audit).  
- **BLOCKED** — cannot be marked complete until an external/dependency gate (Redis, KMS design, DEC-011, etc.).  
- **NOT IMPLEMENTED** — no meaningful control in tree yet.

**Do not** treat a column of PASS values as Production Ready. See `P15_0_PRODUCTION_SECURITY_CHECKLIST.md` for remaining blockers.
