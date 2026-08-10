# SECURITY CONFORMANCE

**Date:** 2026-08-10  
**Production Ready:** NOT claimed

| Control | Status | Evidence | Gap / Risk |
|---|---|---|---|
| Authentication (password hashing scrypt) | PASS | `foundation/crypto.ts` | |
| MFA + step-up | PASS | identity phase2, `requireStepUp` | Step-up not on every sensitive catalog entry yet |
| Session security | PARTIAL | Bearer sessions, logout | Limited session inventory/revoke UI |
| Authorization RBAC | PASS | authz + catalog + phase6_6 tests | F-04 manage aggregates BC |
| Tenant isolation (app) | PASS | org filters + renewals/refund cross-tenant tests | No Postgres RLS |
| IDOR / cross-tenant | PASS (tested areas) | refund-conformance, phase6_6 | Expand to all finance resources systematically |
| SQL injection | PASS pattern | Parameterized queries | Continue review on new SQL |
| XSS | PARTIAL | React escaping | Hardened CSP in prod only |
| CSRF | PARTIAL | Bearer/API style | Cookie session CSRF if cookies introduced |
| SSRF | PARTIAL | Limited outbound | Books connector future |
| Webhook signature + replay | PASS (sandbox) | sandbox-adapter verify | Live providers DEC-009 |
| Idempotency | PASS (key paths) | refunds, payment links, checkout | |
| Rate limiting | PARTIAL | in-memory | Multi-instance → distributed needed |
| API key hashing | PASS | api-keys | |
| Provider credential encryption | PASS (bank/provider patterns) | crypto secret box | Live vault DEC-009 |
| Secret exposure in logs/API | PASS intent | redact helpers | Continuous review |
| Error leakage | PARTIAL | AppError structured | Ensure no stack in prod responses |
| CORS / Helmet | PASS | server.ts | |
| File upload / KYB docs | PARTIAL | documents APIs | Object storage encryption incomplete |
| PCI / PAN | BLOCKED | No PAN storage by design | DEC-011 formal scope |
| Audit logging | PARTIAL | sensitive mutations | Not every mutation |
| Privilege escalation (custom roles) | PASS | custom-roles guards | |

## Findings (security)

1. **Onboarding skip** — `sessionStorage v4_skip_onboarding` allows incomplete merchants onto dashboard (product/policy risk; not auth bypass).
2. **No Platform Admin UI** — platform perms exist; misuse risk if APIs exposed without ops UI audit trails.
3. **In-memory rate limit** — not safe for multi-instance production.
4. **Products API** — billing interim catalog may blur Books SoR boundary (product risk).
5. **Settlement/payout without ledger posts** — financial integrity gap (not secret exposure).
6. **DEC gates** — live credentials, PCI, email, Books target unresolved.

## Never log / return

passwords, API secrets, provider secrets, PAN/CVV, MFA secrets, raw step-up tokens after consume.
