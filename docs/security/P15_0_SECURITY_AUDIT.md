# P15.0 Security Audit

**Date:** 2026-08-10  
**SoT:** Code + migrations + tests  
**Production Ready:** NOT claimed

| Area | Current State | Finding | Risk | Severity | Required Fix | Files | Tests | Status |
|---|---|---|---|---|---|---|---|---|---|
| Legacy `/v1` | Defaults enabled | Dual stack expands attack surface | Cross-model authz bugs | Critical | Default off in production | config.ts, server.ts | pending | FIXED (prod default) |
| Webhook tenant | Org from payload | Forge SUCCEEDED/refund across orgs | Cross-tenant money | Critical | Resolve org from PI DB only | sandbox-adapter, webhook-state-apply | p15-0-security | FIXED |
| Onboarding | sessionStorage skip | Frontend skip ≠ backend block | Unverified merchant payments | High | Persist + enforce on money APIs via verification_cases | OnboardingGate, onboarding-gate.ts, payment-links, payment-core | p15-0-security | FIXED |
| Step-up binding | Op code ignored | Token reusable across ops | Confused deputy | High | Bind purpose on issue/consume | identity-phase2, authz | p15-0-security | FIXED |
| Settlements step-up | Missing on POST | Financial draft without MFA | Unauthorized settlement | High | requireStepUp | phase7-financial-routes | p15-0-security | FIXED |
| Rate limiting | In-memory Map | Multi-instance bypass | Credential stuffing | High | Abstraction + Redis required for prod | rate-limit.ts / rate-limit-store.ts | policy doc | BLOCKED (prod Redis); auth buckets WIRED |
| Ledger immutability | App-only | DB can UPDATE entries | Tamper SoT | High | Triggers block UPDATE/DELETE | 028 migration | p15-0-security | FIXED |
| RLS | Not present | SQL bug → cross-tenant | Data leak | High | Assess then optional | P15_0_RLS_ASSESSMENT | — | BLOCKED (deferred by design) |
| SSRF URLs | Zod url only | Open redirect / future SSRF | Phishing | Medium | Reject private/localhost URLs | url-safety.ts | p15-0-security | FIXED |
| Session storage | localStorage bearer | XSS → session theft | ATO | High | Documented; cookie path later | AuthProvider | — | PARTIAL |
| API key hash | SHA-256 no pepper | Offline crack if DB leak | Key recovery | Medium | Pepper/HMAC planned | api-keys.ts | phase5 | PARTIAL |
| Shared sandbox webhook secret | Global env | Forge any sandbox webhook | Blast radius | High | Per-account secrets later | config, sandbox-adapter | — | PARTIAL |
| Platform admin UI | Missing | Perm-only separation | Blast radius | Medium | Separate surface later | — | — | NOT IMPLEMENTED |
| Card PAN/CVV | Rejected | Tokenized path only | PCI scope | — | Keep reject | payment-core | phase4 | PASS |
| Custom role escalation | Guards present | Cannot grant > own perms | Escalation | — | Keep | custom-roles | phase6_6 | PASS |
| Bank encryption | AES-GCM | Env key | Rotation/KMS | Medium | KMS in P15.4 | crypto.ts | phase3 | PASS |
| Idempotency | Most financial | Some bank/link gaps | Double submit | Medium | Expand keys | idempotency.ts | mixed | PARTIAL |
| Redaction | Present | Nested keys may leak | PII in logs | Medium | Expand keys | redact.ts | phase3 | PARTIAL |
| KYB storage_key | May return in API | Future object store leak | Doc exposure | Medium | Omit storage_key from responses | documents-service | — | PARTIAL |
| Auth baseline | scrypt, lockout, MFA | Solid | — | — | — | identity | phase2 | PASS |
| Tenant app-layer | Most queries scoped | Some id-only platform paths | IDOR if mis-perm | Medium | Harden locks with org_id | payment-links, payment-core | p15-0-security | PARTIAL→FIXED locks |
| CSRF | Bearer API | Cookie CSRF N/A | — | — | Document N/A | — | — | PASS (N/A documented) |
| SQL injection | Parameterized | Dynamic sort risk residual | Injection | Low | Keep parameterized | services | — | PASS |
| XSS | React escape | Hard-coded UI | Injection | Low | Never render raw HTML | web | — | PASS |
| Privilege escalation tests | Present | — | — | — | Expand | phase6_6 | PASS |
| E2E role matrix | Present | Needs stack | — | — | Run in CI | role-matrix.spec | PARTIAL |

See also: `P15_0_THREAT_MODEL.md`, `P15_0_SECURITY_CONTROL_MATRIX.md`, `P15_0_FINAL_SECURITY_REPORT.md`.
