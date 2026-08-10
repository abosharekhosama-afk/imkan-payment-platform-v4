# Tenant Isolation Model — Phase 6.6

**Status:** App-layer isolation **PASS** for V4 `/api/v1`  
**PostgreSQL RLS:** Not enabled (deliberate for this phase)

---

## Trust boundary

| Source | Trusted? |
|---|---|
| Session `organizationId` after login / MFA | **Yes** |
| API key resolved organization | **Yes** |
| Path `:organizationId` when matched to session via `assertOrgAccess` | **Yes** (must equal session unless platform) |
| Request body / query `organization_id` | **No** — ignored for authorization |
| Header `X-Tenant-ID` | **Rejected** (`TENANT_HEADER_FORBIDDEN`) |

Merchant mutators use `requireOrganizationContext()` → `request.auth.organizationId`.

---

## Enforcement chain

```
Authentication → Membership → Organization Scope → Permission
  → Resource Ownership (org_id match) → Step-up (if sensitive) → Audit
```

Cross-tenant resource access returns **404** (preferred, hide existence) or **403**.

---

## Verified resource classes

Organizations, Customers, Payments / Payment Links, Invoices, Subscriptions, API Keys, Webhooks (provider events), Providers / Routes, Bank Accounts, Roles (custom), Users / Invites, Audit / Security events, Reports (deferred — no API).

Evidence: `tests/phase6_6-rbac.test.ts`, prior phase suites, Playwright `role-matrix.spec.ts` cross-tenant cases.

---

## Why app-layer is sufficient for Phase 6.6 (not Production Ready)

- Single trusted SoR access path (`apps/api` → PostgreSQL pool)  
- No direct merchant DB access  
- All public routes are token- or signature-scoped  

**Not sufficient alone for Production Ready** without: RLS defense-in-depth, continuous authz regression CI on every route, and Phase 7+ financial modules. Documented as Remaining Limitation — not a Phase 6.6 blocker if app-layer tests pass.

---

## Platform exception

`kyb.review`, `bank.review`, and `platform.admin` routes intentionally operate across organizations. Merchants cannot grant these into custom roles.
