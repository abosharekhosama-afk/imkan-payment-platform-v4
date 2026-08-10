# RBAC Final Report — Phase 6.6

**Date:** 2026-08-09  
**Phase:** 6.6 Production-Grade Authorization, RBAC & Tenant Isolation  
**Production Ready claim:** **NOT MADE** (use PASS / PARTIAL / BLOCKED / NOT IMPLEMENTED only)

---

## A. Roles

### Merchant
`MERCHANT_OWNER`, `MERCHANT_ADMIN`, `MERCHANT_FINANCE`, `MERCHANT_DEVELOPER`, `MERCHANT_SUPPORT`, `MERCHANT_VIEWER`  
+ org **custom roles** (`roles.is_system=false`)

### Platform
`PLATFORM_OWNER`, `PLATFORM_ADMIN`, `PLATFORM_SUPPORT`, `PLATFORM_FINANCE`

---

## B. Permissions

Central catalog: `apps/api/src/foundation/permissions-catalog.ts`  
DB additive migrations: `021_phase6_6_rbac_catalog.sql`, `022_phase6_6_role_matrix.sql`  
Includes active + deferred codes (refunds/balances/settlements/payouts/disputes marked deferred).

---

## C. Role Matrix

Documented in `docs/security/ROLE_MATRIX.md` and applied via `022` + prior seeds.

---

## D. Screens (V4 console)

| Screen | Read permission(s) | Key actions |
|---|---|---|
| Dashboard | payments.read / org.read / billing.read | — |
| Payments | payments.read | Cancel: payments.cancel\|manage |
| Payment Links | payment_links.read | Manage: payment_links.manage |
| Payment Config | payment_config.read | Save: payment_config.manage |
| Customers…Invoices | customers/products/… + billing.read | manage / pay / renewals |
| Merchant / KYB / Bank | merchant.read / kyb.read / bank.read | manage / submit |
| Providers / Webhooks | providers.read / webhooks.read\|events.read | — |
| API Keys | api_keys.read\|developer.read | create/revoke: api_keys.manage |
| Users | users.read | invites (API step-up) |
| Roles | roles.read\|users.read\|org.read | custom role: roles.manage + step-up |
| Audit / Security / Errors | audit.read / security.read / errors.read | — |
| Organization / Appearance | org.read\|settings.read | — |
| Coming soon | deferred perms only in nav | placeholders |
| Forbidden | authenticated | — |

Route UX gates: `RequirePermission` → `/forbidden`.

---

## E. API Authorization (high-signal)

| Endpoint | Permission | Tenant | Sensitive / step-up |
|---|---|---|---|
| `POST /auth/mfa/enable` | session self | n/a | No (F-02 fixed) |
| `POST /billing/renewals/run` | billing.manage | **org-scoped** (platform.admin global) | Audited |
| `POST /rbac/roles` | roles.manage | org | **step-up** |
| `PUT /rbac/roles/:id/permissions` | roles.manage | org | **step-up** |
| `DELETE /rbac/roles/:id` | roles.manage | org | **step-up** |
| `POST /rbac/users/:id/assign-role` | roles.manage\|users.manage | org | **step-up** |
| `GET /rbac/roles` | roles.read\|… | org | No |
| `POST /merchant/bank-accounts/:id/set-default` | bank.manage | org | **step-up** (F-03) |
| Merchant payment/billing/merchant routes | existing + catalog | org | prior rules |

Full enumeration remains in `phase2–phase6` route files + `phase6_6-rbac-routes.ts`.

---

## F. Sensitive Operations

Registry: `docs/security/SENSITIVE_OPERATIONS.md` + `sensitive-operations.ts`.

---

## G. Vulnerabilities found (pre-fix) → status

| ID | Finding | Status |
|---|---|---|
| F-01 | Renewals cross-tenant | **FIXED** |
| F-02 | MFA enable admin-gated | **FIXED** |
| F-03 | Bank set-default no step-up | **FIXED** |
| F-04 | Coarse manage perms | **PARTIAL** (fine codes added; many routes still accept manage aggregates) |
| F-05 | No custom roles | **FIXED** (API + escalation guard) |
| F-06 | UI route guards | **FIXED** (RequirePermission) |
| F-07 | Client platform.admin UX bypass | **ACCEPTED** (backend authoritative) |
| F-08 | Coming-soon always visible | **FIXED** (permission-gated; deferred rarely granted) |
| F-09 | Renewals audit | **FIXED** |

---

## H. Placeholders / deferred (documented limitations — not unexplained PARTIAL)

- Finance modules (refunds/balances/settlements/payouts/disputes): schema + RBAC grants ship in P6–P9; live fees/FX **BLOCKED BY: DEC-008**
- Live payment providers **BLOCKED BY: DEC-009**
- Full platform admin console UI — **NOT IMPLEMENTED** (API permissions exist)
- Postgres RLS — **NOT IMPLEMENTED** (app-layer isolation is mandatory SoR)
- F-04: fine-grained cancel/refund codes exist; some routes still accept manage aggregates for backwards compatibility
- Production email **BLOCKED BY: DEC-017**

---

## I. Database changes

| Migration | Purpose |
|---|---|
| `021_phase6_6_rbac_catalog.sql` | New permissions + `roles.organization_id` for custom roles |
| `022_phase6_6_role_matrix.sql` | Role↔permission grants |
| `023`+ | Hardening / additive grants as applicable |

---

## J. Tests

| Suite | Coverage |
|---|---|
| `tests/phase6_6-rbac.test.ts` | Helpers, 401, viewer 403, renewals isolation F-01, custom role escalation, cross-tenant invoice |
| Prior phase2–6 suites | Existing AuthZ/isolation |
| `e2e/role-matrix.spec.ts` | Merchant role navigation / forbidden paths |
| `scripts/verify-foundation-pg.mjs` | Includes RBAC suite in integration list |

---

## K. E2E

| Item | Status |
|---|---|
| Journey F owner/viewer (Phase 6.5) | PASS |
| Role matrix Playwright (`role-matrix.spec.ts`) | PASS (merchant roles covered; platform admin UI still N/A) |
| Deep-link → Forbidden | PASS |

---

## L. Final status checklist

| Criterion | Status |
|---|---|
| RBAC audit completed | **PASS** |
| Permission catalog | **PASS** |
| Role matrix | **PASS** |
| Backend authorization centralized/extended | **PASS** |
| Relevant APIs protected | **PASS** |
| Tenant isolation verified (renewals) | **PASS** |
| Cross-tenant tests | **PASS** |
| Frontend permission system | **PASS** |
| Navigation permission-aware | **PASS** |
| Screen actions permission-aware | **PASS** (UX; API remains authority) |
| Sensitive ops identified | **PASS** |
| Step-up abstraction | **PASS** |
| Custom roles | **PASS** |
| Platform RBAC separated | **PASS** |
| Audit logging | **PASS** (sensitive mutations; not every read) |
| Unit/API tests | **PASS** |
| E2E role matrix | **PASS** (with platform UI limitation noted) |
| Documentation | **PASS** |

### Overall Phase 6.6 / P2 Authorization

**PASS** for authorization foundation required to proceed.

### Remaining Limitations (explicit — do not treat as unexplained PARTIAL)

1. F-04 manage-aggregate backwards compatibility on some routes  
2. No Postgres RLS (app-layer only)  
3. No dedicated platform admin UI  
4. Deferred finance modules until their APIs exist (P6–P9)  
5. Open DEC gates (008/009/011/012/016/017)

**Not a Production Ready declaration.** Production Ready requires the full P14 Production Gate.

---

## Audit artifacts

- `docs/audit/RBAC_CURRENT_STATE.md`  
- `docs/audit/RBAC_GAP_ANALYSIS.md`  
- `docs/audit/TENANT_ISOLATION_AUDIT.md`  
- `docs/audit/RBAC_SECURITY_FINDINGS.md`  
- `docs/audit/RBAC_FINAL_REPORT.md` (this file)  
- `docs/security/*`  
