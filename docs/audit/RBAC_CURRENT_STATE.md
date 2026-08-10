# RBAC Current State Audit — IMKAN Payments V4

**Date:** 2026-08-09  
**Phase:** 6.6 (Audit only — pre-implementation)  
**Authority:** Current code + PostgreSQL migrations + `/api/v1` + V4 UI (`apps/web/src/v4`)  
**Mode:** READ-ONLY inspection; no production code changed in this document’s production  

---

## 1. Summary verdict

| Layer | Status |
|---|---|
| AuthN (session + API key) | **EXISTS** |
| Permission-based AuthZ helpers | **EXISTS** (partial API surface) |
| System roles + permission seeds | **EXISTS** |
| Organization context from session | **EXISTS** |
| Tenant-scoped service queries | **EXISTS** (dominant pattern) |
| Central permission catalog (code) | **MISSING** (strings scattered) |
| Custom roles (V4) | **MISSING** |
| Route-level UI permission guards | **MISSING** |
| Platform vs Merchant separation | **PARTIAL** (schema yes; shared session) |
| Production-grade RBAC | **PARTIAL** — solid base, gaps below |

---

## 2. Repository structure (auth-relevant)

| Area | Path |
|---|---|
| AuthZ middleware | `apps/api/src/foundation/authz.ts` |
| Identity / sessions | `apps/api/src/foundation/identity-service.ts` |
| Identity phase 2 (invites, MFA step-up) | `apps/api/src/foundation/identity-phase2.ts` |
| API keys | `apps/api/src/foundation/api-keys.ts` |
| Auth context type | `apps/api/src/foundation/http.ts` |
| Audit writers | `apps/api/src/foundation/audit.ts` |
| `/api/v1` routes | `apps/api/src/interfaces/http/apiV1/{routes,phase2–phase6-routes}.ts` |
| RBAC schema | `database/migrations/postgres/002_foundation_rbac.sql` |
| Role/permission seeds | `005`, `007`, `011`, `014`, `017`, `020_*_rbac_seed.sql` |
| Frontend auth | `apps/web/src/v4/auth/AuthProvider.tsx` |
| Frontend Can | `apps/web/src/v4/rbac/Can.tsx` |
| Nav | `apps/web/src/v4/layouts/nav.ts` |
| Routes | `apps/web/src/v4/routes/index.tsx` |
| E2E | `apps/web/e2e/journeys.spec.ts` (Journey F) |

---

## 3. Existing roles (system)

From `005_foundation_rbac_seed.sql`:

### Merchant (`scope = MERCHANT`)
- `MERCHANT_OWNER`
- `MERCHANT_ADMIN`
- `MERCHANT_FINANCE`
- `MERCHANT_DEVELOPER`
- `MERCHANT_SUPPORT`
- `MERCHANT_VIEWER`

### Platform (`scope = PLATFORM`)
- `PLATFORM_OWNER`
- `PLATFORM_ADMIN`
- `PLATFORM_SUPPORT`
- `PLATFORM_FINANCE`

DB trigger `enforce_user_role_scope` enforces: PLATFORM roles must have `organization_id IS NULL`; MERCHANT roles require `organization_id`.

Registration assigns `MERCHANT_OWNER` (`identity-service.ts`).

---

## 4. Existing permissions (seeded)

### Foundation / Identity
`platform.admin`, `platform.support`, `platform.finance`, `org.read`, `org.manage`, `users.read`, `users.manage`, `users.deactivate`, `invites.manage`, `audit.read`, `security.read`, `errors.read`

### Merchant / KYB (Phase 3)
`merchant.read`, `merchant.manage`, `kyb.read`, `kyb.submit`, `kyb.review`, `documents.read`, `documents.manage`, `bank.read`, `bank.manage`, `bank.review`, `masterdata.manage`

### Payments (Phase 4)
`payments.read`, `payments.manage`, `payment_links.read`, `payment_links.manage`, `payment_config.read`, `payment_config.manage`

### Providers (Phase 5)
`providers.read`, `providers.manage`, `api_keys.read`, `api_keys.manage`, `webhooks.read`

### Billing (Phase 6)
`customers.read`, `customers.manage`, `products.read`, `products.manage`, `prices.read`, `prices.manage`, `subscriptions.read`, `subscriptions.manage`, `invoices.read`, `invoices.manage`, `billing.manage`

**Note:** Current model uses coarse `*.manage` aggregates rather than fine-grained `payments.refund`, `payments.capture`, etc. (many of those resources do not exist on V4 yet).

---

## 5. Existing guards / helpers

| Helper | Location | Behavior |
|---|---|---|
| `apiV1AuthHook` | `authz.ts` | Session or API key; rejects `X-Tenant-ID`; public allowlist |
| `requirePermission(...codes)` | `authz.ts` | OR match against `request.auth.permissions` |
| `requireOrganizationContext()` | `authz.ts` | Requires `auth.organizationId` |
| `requireStepUp()` | `authz.ts` | Consumes `X-Step-Up-Token`; blocked for API keys |
| `assertOrgAccess` | `phase2-routes.ts` | Path org vs session / platform override |
| `requireRole` | — | **MISSING** |
| Generic `authorize()` / `authorizeResource()` | — | **MISSING** as named API |

Frontend: `Can` (`anyOf` OR), `hasPermission` in AuthProvider (`platform.admin` client bypass). No `PermissionGate` / `RequirePermission` route wrappers.

---

## 6. Authentication model

- Opaque bearer session token (SHA-256 hashed in `sessions`) — **not JWT**
- API key via `x-api-key` or Bearer secret → org-bound permissions/scopes
- Login optional `organization_id` validated against membership
- MFA challenge + step-up token for sensitive ops
- Public: health, auth register/login/mfa/verify/password, invitation accept, `/checkout/*`, `/webhooks/providers/*`

---

## 7. Organization / membership model

Tables (foundation): `users`, `organizations`, `organization_users` (membership), `user_roles`, `roles`, `permissions`, `role_permissions`, `sessions`, invitations (phase 2).

Session resolve loads permissions for:
- PLATFORM roles (`organization_id IS NULL` on `user_roles`)
- MERCHANT roles for the session’s `organization_id`

---

## 8. Protected endpoints (pattern)

Nearly all merchant business routes use:

```text
preHandler: [requireOrganizationContext(), requirePermission('x.read'|'x.manage'|...)]
```

Files: `routes.ts`, `phase2-routes.ts` … `phase6-routes.ts`.

Intentionally public mutators: auth flows, checkout session/payment, inbound webhooks (signature-verified).

---

## 9. Frontend authorization status

| Capability | Status |
|---|---|
| Load roles/permissions from `/auth/me` | Yes |
| Permission-aware nav (`nav.ts` `anyOf`) | Yes |
| Action buttons via `<Can>` | Many manage CTAs |
| Route-level permission deny | **No** (auth token only) |
| Role `===` hardcoding | **None** in `src/v4` |
| Central typed catalog | **No** |
| E2E RBAC matrix | Thin (owner vs viewer Journey F) |

---

## 10. Database isolation status

- Merchant list/get services typically `WHERE organization_id = $sessionOrg`
- Cross-tenant resource access usually **404** (not found) in payment/billing/merchant tests
- Platform admin paths intentionally query by id without merchant org (permission-gated: `kyb.review`, `bank.review`, `platform.admin`)

---

## 11. Tests currently covering RBAC

| Suite | Coverage |
|---|---|
| `tests/foundation-api.test.ts` | Auth required, X-Tenant-ID reject, cross-tenant org |
| `tests/phase2-identity.test.ts` | MFA/step-up, invites cross-tenant |
| `tests/phase3-merchant-kyb.test.ts` | Bank/KYB step-up, cross-tenant 404 |
| `tests/phase4-payments.test.ts` | RBAC + isolation |
| `tests/phase5-providers.test.ts` | API key tenant isolation |
| `tests/phase6-billing.test.ts` | Invoice isolation; renewals not isolation-asserted |
| `apps/web/e2e` Journey F | Owner/viewer UI + 403 mutate |

---

## 12. What can be reused for Phase 6.6

1. `authz.ts` helpers — extend, do not duplicate  
2. `user_roles` / `roles.is_system` schema — foundation for custom roles  
3. Seeded system roles — keep codes stable  
4. Service-level `organization_id` filters — strengthen + test  
5. Frontend `Can` + AuthProvider — extend with catalog + route gates  
6. `requireStepUp` — expand sensitive-ops registry  
7. Audit event writers — attach to authz-sensitive mutations  

---

## 13. Duplicated / scattered authorization logic

- Permission string literals in every route file + every React page + nav  
- Frontend `can()` in `permissions/index.ts` unused duplicate of `hasPermission`  
- Coarse `billing.manage` used as OR alternative to many fine permissions in UI and routes  
- Platform “all permissions” via `CROSS JOIN` for `PLATFORM_OWNER`/`PLATFORM_ADMIN` in seed 005  

---

*End of current-state audit.*
