# RBAC Architecture — Phase 6.6

## Principles

1. **Backend is authoritative.** Frontend `Can` / `RequirePermission` / nav filters are UX only.  
2. **Permissions over roles** for AuthZ decisions. Roles are assignment packages.  
3. **No silent privilege escalation.** Custom roles and role assignment require permission subset + step-up.  
4. **Tenant from session/API key**, never from client-supplied org as trust root.  
5. **Granular permissions preferred.** `*.manage` remains as an aggregate for backward-compatible grants (see ROLE_MATRIX) and must not be the only code for new sensitive operations.

## Components

| Layer | Location |
|---|---|
| Permission catalog | `apps/api/src/foundation/permissions-catalog.ts` |
| Sensitive ops registry | `apps/api/src/foundation/sensitive-operations.ts` |
| AuthZ middleware | `apps/api/src/foundation/authz.ts` |
| Custom roles | `apps/api/src/foundation/custom-roles-service.ts` + `phase6_6-rbac-routes.ts` |
| DB grants | Migrations `021`–`023` (+ earlier seeds) |
| FE guards | `RequirePermission`, `Can`, `nav.ts`, form `fieldset disabled` |
| FE step-up | `apps/web/src/v4/rbac/stepUp.ts` |

## Request pipeline

```
apiV1AuthHook (session | API key)
  → reject X-Tenant-ID
  → requireOrganizationContext (merchant)
  → requirePermission(...)
  → requireStepUp(op) when registry.stepUpRequired
  → service query scoped by organization_id
  → writeAuditEvent for sensitive mutations
```

## Custom roles

- `is_system=false`, `organization_id` set  
- Cannot mutate/delete system roles  
- Cannot assign platform roles via merchant API  
- Cannot assign `MERCHANT_OWNER` unless actor is already owner (or `platform.admin`)  
- Permission grants must be subset of actor’s permissions  

## Aggregates (`*.manage`) — documented BC

Routes accept `payments.cancel | payments.manage` (and similar) so existing API keys / roles seeded with aggregates keep working after granular codes were added. New custom roles should prefer granular codes. Full revocation of aggregates is a future migration (out of Phase 6.6 scope to avoid breaking sandboxes).
