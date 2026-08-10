# SECURITY IMPLEMENTATION PLAN — IMKAN Payments V4

**Phase:** ANALYSIS ONLY  
**Date:** 2026-08-08  
**Authority:** V4 §12, §17–18, §22; New-folder `05-SECURITY-SPEC.md`; Addendum `11`

---

## 1. Security objective

Deliver a production-oriented multi-tenant payment platform where:

- Authorization is **server-side only** (“Frontend hiding is not security”)
- **No cross-tenant access**
- Financial mutations are **authenticated, authorized, validated, idempotent, concurrency-safe, audited**
- Webhooks are **signature-verified and replay-protected**
- **No raw PAN/CVV** storage
- Sandbox and Production are **strictly isolated**
- Critical unresolved findings **block Production**

---

## 2. Current security posture (V3.4.1)

### 2.1 Strengths to reuse

| Control | Evidence |
|---|---|
| Password hashing | scrypt |
| Session tokens | SHA-256 hashed at rest |
| API keys | hashed secrets |
| MFA TOTP | encrypted secrets |
| HTTP hardening | Helmet, CORS allowlist, rate limit |
| Token vault | AES-GCM for provider/MFA/Zoho tokens |
| Outbound webhooks | HMAC-SHA256 signature header |
| Tenant query scoping | `tenant_id=?` pattern widely used |
| Idempotency | financial mutation keys |
| Error redaction | error_reports path redacts sensitive fields |
| Production guards | sandbox payouts/settlements blocked in production mode (partial) |

### 2.2 Gaps / defects

| Issue | Severity | Notes |
|---|---|---|
| RBAC not universal on all protected routes | Critical | Selective `requirePermission` |
| Dev `X-Tenant-ID` auth bypass | High | Must not ship in production-oriented mode |
| Admin vs Merchant API separation missing | Critical | No Admin portal/role gate |
| Inbound PayTabs webhook route unwired / verification incomplete | High | Service exists; route/verify gaps |
| No systematic replay protection model for inbound webhooks | High | Required by V4 |
| Step-up auth for bank/financial changes missing | High | Required by V4 §7 / `11` §D |
| Registration / email verify / password reset incomplete | High | Identity attack surface incomplete |
| Master Data / KYB document access controls missing | High | New domains |
| Cross-tenant automated test suite weak | High | Must be first-class |
| Secret rotation / KMS process incomplete | Medium | Needs production controls |
| PCI scope not formally documented | High | DEC-011 |
| Branding/HTML injection controls for checkout missing | Medium | `11` §G |

---

## 3. Target control chain

### 3.1 Request authorization chain (mandatory)

`Authentication → Session → RBAC → Tenant Isolation → Resource Ownership → Business Rules → Financial Validation → Risk → Idempotency → Concurrency Protection → DB Transaction → Provider → Verified Webhook → Ledger → Audit → Reconciliation`

### 3.2 Sensitive bank change chain (mandatory)

`Authentication → Permission → Step-up → New details → Validation → Ownership/Verification → Risk → Review/Hold if required → Audit → Activation`

### 3.3 Role model (seed exactly as specified; do not invent privileges)

**Platform:** PLATFORM_OWNER, PLATFORM_ADMIN, PLATFORM_SUPPORT, PLATFORM_FINANCE  
**Merchant:** MERCHANT_OWNER, MERCHANT_ADMIN, MERCHANT_FINANCE, MERCHANT_SUPPORT, MERCHANT_DEVELOPER, MERCHANT_VIEWER  

Permission catalog mapping to API operations will be documented in `docs/security/RBAC_MATRIX.md` during Identity phase — **without inventing financial authority beyond V4 role intent**. Where a permission is unclear → Decision.

---

## 4. Phased security build

### Phase 1 — Foundation

- Secure defaults: TLS assumption docs, Helmet, CORS, rate limits, request IDs
- Structured logging with secret redaction
- Env separation: `APP_ENV` / sandbox vs production credential slots
- Dependency baseline + secret scanning hooks
- Deny-by-default security middleware skeleton
- Docs: `docs/security/` tree

### Phase 2 — Identity / Tenant (security-critical)

- Secure session lifecycle (rotation, revocation, device metadata as specified)
- Password policy + reset token single-use + expiry
- Email verification tokens
- Failed-login controls + lockout
- MFA enrollment/verification
- Step-up challenge primitive
- Organization membership enforcement
- **Remove production bypass headers**
- Default-deny permission guard on `/api` (or chosen prefix)
- Tests: session abuse, IDOR, cross-tenant, privilege escalation

### Phase 3 — Merchant / KYB

- Document access AuthZ + signed object storage references
- Masked payout account display
- Step-up on bank change
- Admin-only KYB review routes
- Verification adapter boundary (no vendor secrets in frontend)
- Audit events for KYB decisions

### Phase 4 — Payments

- Idempotency required on pay/capture/refund
- Ownership checks on every payment resource
- Hosted/tokenized flows only; reject PAN/CVV persistence attempts
- Checkout branding sanitization (no script/HTML injection)
- Public checkout tokens scoped + expiring
- Financial validation hooks (refund ≤ captured) even with sandbox provider

### Phase 5 — Providers / Webhooks

- Per-provider signature verification modules
- Replay protection: timestamp tolerance + event id uniqueness
- Credential metadata only in DB; secrets in secure storage
- Sandbox/live credential hard isolation
- Capability gate: deny unsupported operations
- Fallback routing anti-double-charge controls
- Tests: forged signature, replay, wrong-tenant event mapping

### Phase 6–7 — Billing / Financial Core

- Step-up/MFA for high-risk financial ops as required
- Ledger immutability practices (correcting entries, not silent edits)
- Payout ≤ eligible balance enforced server-side
- Race/concurrency tests with row locks
- No fee/reserve inventing — DEC-008

### Phase 8 — Risk / Disputes

- Admin risk rule AuthZ
- Dispute evidence access controls
- Prevent merchant privilege from platform risk admin APIs

### Phase 9 — Books

- Connector credentials isolation
- Idempotent sync; no silent overwrite without audit
- Least privilege to Books APIs

### Phase 10 — Security / Production gate

Full campaign + evidence pack (section 7).

---

## 5. Threat model (initial)

| Threat | Example | Primary controls |
|---|---|---|
| Broken AuthZ | Call refund without permission | RBAC middleware + tests |
| IDOR | Swap resource IDs across orgs | Tenant + ownership checks |
| Cross-tenant read/write | Org A reads Org B payments | Mandatory org scope in repositories |
| Webhook forgery | Fake provider event credits balance | Signature verify |
| Webhook replay | Re-send capture event | event id uniqueness + replay window |
| Double spend / double refund | Parallel requests | Idempotency + locks + TX |
| Privilege escalation | Merchant hits Admin APIs | Surface separation + roles |
| Secret leakage | Logs/env/UI | Redaction, vault, scanning |
| Sandbox/live mix | Live charge with sandbox webhook | Env isolation + config guards |
| Card data exposure | PAN posted to API | Reject + hosted fields; DEC-011 |
| XSS via branding | Script in logo/HTML fields | Strict validation/sanitization |
| Brute force login | Password spray | Rate limit + lockout |

---

## 6. Security testing program

Aligned with V4 §18 and `TEST_PLAN.md`.

| Suite | Must cover |
|---|---|
| Authentication abuse | login, reset, verify, MFA bypass attempts |
| RBAC bypass | each role against denied operations |
| IDOR / cross-tenant | horizontal access on all major resources |
| API AuthZ bypass | missing/invalid tokens, wrong surface |
| Rate-limit bypass attempts | auth and sensitive endpoints |
| Input manipulation | amounts, currency, negative values, type confusion |
| Webhook forgery/replay | all active providers |
| Race conditions | capture/refund/payout parallel |
| Secret exposure | logs, responses, clients, repos |
| Sandbox/live mixing | config negative tests |
| Dependency vulnerabilities | SCA in CI |
| Financial abuse | double pay/refund/payout, ledger imbalance |

**Process:** Finding → Severity → Fix → Retest → Evidence → Close.

**Severity gate:** any open Critical security or financial-integrity finding blocks Production and blocks phase advance when in-scope for that phase.

---

## 7. Production security gate checklist

- [ ] Architecture review recorded
- [ ] RBAC matrix complete and tested
- [ ] Cross-tenant suite green
- [ ] Webhook verify + replay green for every active provider
- [ ] No PAN/CVV storage (code + schema scan)
- [ ] Secrets management + rotation procedure documented
- [ ] TLS and secure cookie/header posture verified
- [ ] Backup + restore test evidence
- [ ] Sandbox/live isolation audit evidence
- [ ] PCI scope document (DEC-011) approved
- [ ] Dependency/SCA report reviewed
- [ ] Final Security Assessment document signed off in `docs/security/`

---

## 8. Deliverables by security track

| Artifact | Location |
|---|---|
| RBAC matrix | `docs/security/RBAC_MATRIX.md` (Phase 2) |
| Threat model updates | `docs/security/THREAT_MODEL.md` |
| Webhook security | `docs/security/WEBHOOK_SECURITY.md` (Phase 5) |
| PCI scope | `docs/security/PCI_SCOPE.md` (DEC-011) |
| Findings log | `docs/security/FINDINGS.md` |
| Phase security notes | each `docs/implementation/<phase>.md` |

---

## 9. Explicit non-actions (until decided)

- Do not invent provider signature algorithms not in provider docs (DEC-009).
- Do not invent reserve/hold percentages (DEC-008).
- Do not enable unrestricted merchant sandbox↔live toggle without DEC-012.
- Do not claim Production Ready without section 7 evidence.
