# RBAC Security Findings — Phase 6.6 Audit

**Date:** 2026-08-09  
**Severity scale:** CRITICAL · HIGH · MEDIUM · LOW · INFO  
**Status values:** OPEN · ACCEPTED_RISK · FIXED (post-impl)

---

## Executive summary

V4 authorization is **permission-based and largely server-enforced**, with good session/API-key binding and rejection of `X-Tenant-ID`. It is **not** yet production-grade: one critical cross-tenant mutator, coarse permissions, incomplete step-up coverage, no custom-role escalation controls, and UI that is UX-only.

---

## Findings

### F-01 — CRITICAL — Merchant renewals process all tenants

| Field | Value |
|---|---|
| ID | F-01 |
| Area | Tenant isolation / Billing |
| Status | FIXED (Phase 6.6) |
| Evidence | Was: `phase6-routes.ts` `POST /billing/renewals/run` → `processDueSubscriptions` without org filter. Now org-scoped for merchants; platform.admin may run global. Test: `phase6_6-rbac.test.ts` |
| Impact | Cross-tenant financial state changes |
| Remediation | Scope worker to `auth.organizationId` for merchants; platform-only for global |
| Tests | Must add cross-tenant renewals test |

---

### F-02 — HIGH — MFA enable requires admin permissions

| Field | Value |
|---|---|
| ID | F-02 |
| Area | Step-up / MFA |
| Status | FIXED (Phase 6.6) |
| Evidence | Was: admin-gated MFA enable. Now: any authenticated session user may self-enable MFA. |
| Impact | `MERCHANT_FINANCE` needs step-up for bank ops but cannot self-enable MFA → stuck or shared-admin dependency |
| Remediation | Allow authenticated session user to enable MFA for **self**; keep admin reset/disable separately gated |

---

### F-03 — MEDIUM — Bank set-default lacks step-up

| Field | Value |
|---|---|
| ID | F-03 |
| Area | Sensitive operations |
| Status | FIXED (Phase 6.6) |
| Evidence | Was: set-default without step-up. Now: `requireStepUp('bank.account.set_default')`. |
| Impact | Payout destination preference change without step-up |
| Remediation | Add `requireStepUp` + register in sensitive-ops catalog |

---

### F-04 — MEDIUM — Coarse `*.manage` over-privilege

| Field | Value |
|---|---|
| ID | F-04 |
| Area | Permission model |
| Status | OPEN (design) |
| Evidence | Single `payments.manage`, `invoices.manage`, `billing.manage` cover many mutations |
| Impact | Cannot separate refund/capture/cancel (when those exist); finance/developer boundaries blur |
| Remediation | Introduce fine-grained codes where features exist; map manage → bundle for owners; defer refunds/payouts codes as placeholders until Phase 7 |

---

### F-05 — MEDIUM — No custom role / escalation prevention

| Field | Value |
|---|---|
| ID | F-05 |
| Area | Custom roles |
| Status | OPEN |
| Evidence | No V4 custom role API; invites use fixed enum |
| Impact | Cannot least-privilege custom roles; future CRUD without escalation guard would be HIGH |
| Remediation | Implement custom roles with “assign ⊆ assigner permissions” or document BLOCKED |

---

### F-06 — MEDIUM — Frontend auth-only routing

| Field | Value |
|---|---|
| ID | F-06 |
| Area | UI authorization |
| Status | OPEN |
| Evidence | `RequireAuth` only in `routes/index.tsx` |
| Impact | Deep-link UX noise; **not** a data-leak if API correct |
| Remediation | `RequirePermission` + Forbidden page; never treat as sole control |

---

### F-07 — LOW — Client `platform.admin` superuser bypass

| Field | Value |
|---|---|
| ID | F-07 |
| Area | Frontend |
| Status | ACCEPTED_RISK (UX) if backend authoritative |
| Evidence | `AuthProvider.hasPermission` |
| Impact | UI may show controls incorrectly if `/auth/me` wrong; backend still must deny |
| Remediation | Keep backend truth; align catalog; avoid inventing client-only privileges |

---

### F-08 — LOW — Coming-soon / Appearance always in nav

| Field | Value |
|---|---|
| ID | F-08 |
| Area | Navigation |
| Status | OPEN |
| Evidence | `AppShell` / `nav.ts` |
| Impact | Clutter; no security impact if pages are placeholders |
| Remediation | Hide financial placeholders behind future permissions or keep with clear “not available” |

---

### F-09 — LOW — Inconsistent audit on some ops

| Field | Value |
|---|---|
| ID | F-09 |
| Area | Audit logging |
| Status | OPEN |
| Evidence | Renewals run not clearly actor-audited as cross-tenant action |
| Remediation | `writeAuditEvent` on renewals run, role changes, API key, bank set-default |

---

### F-10 — INFO — No JWT

| Field | Value |
|---|---|
| ID | F-10 |
| Area | AuthN |
| Status | ACCEPTED_RISK |
| Evidence | Opaque hashed sessions |
| Impact | None for Phase 6.6 goals; do not introduce JWT without decision |
| Remediation | None required |

---

### F-11 — INFO — Application-layer isolation (no Postgres RLS)

| Field | Value |
|---|---|
| ID | F-11 |
| Area | Database |
| Status | ACCEPTED_RISK for monolith |
| Remediation | Consistent service filters + tests; RLS only if later approved |

---

### F-12 — INFO — Legacy `/v1` RBAC separate

| Field | Value |
|---|---|
| ID | F-12 |
| Area | Legacy |
| Status | ACCEPTED_RISK if `ENABLE_LEGACY_V1=false` in V4 prod path |
| Remediation | Keep legacy frozen; do not mix AuthZ systems |

---

## Unprotected / weakly protected endpoints

| Endpoint class | Assessment |
|---|---|
| Public auth / checkout / webhooks | Intentional |
| `/auth/logout`, `/auth/mfa/step-up` | Auth-only OK |
| Master-data GET | Auth-only — consider `org.read` or public masterdata policy |
| `POST /billing/renewals/run` | **Weak isolation** (F-01) |
| Bank set-default | **Weak step-up** (F-03) |

---

## Mock / stub authorization

| Item | Status |
|---|---|
| Mock permissions in V4 AuthZ path | **Not found** |
| Hard-coded demo user AuthZ | **Not found** |
| UI-only AuthZ as protection | Present as UX; backend authoritative by design |
| Outbox email delivery stub | Unrelated to AuthZ; DEC-017 |

---

## Hard-coded access rules

- Invite role enum (merchant roles only) — OK interim  
- Register → `MERCHANT_OWNER` — OK  
- `platform.admin` / `platform.support` path org override — OK if documented  
- No widespread `role ===` AuthZ in services  

---

## Recommended priority order for fixes

1. F-01 renewals tenant scope (**must**)  
2. F-02 MFA self-enable  
3. Central catalog + matrix + authz helpers  
4. F-03 bank set-default step-up  
5. Frontend gates + Forbidden  
6. F-05 custom roles or BLOCKED  
7. Expand tests / E2E role matrix  
8. Docs + final report  

---

*End of security findings.*
