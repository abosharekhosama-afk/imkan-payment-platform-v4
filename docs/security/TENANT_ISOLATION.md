# Tenant Isolation — V4

See the full model: [`TENANT_ISOLATION_MODEL.md`](./TENANT_ISOLATION_MODEL.md).

## Trust source

`organization_id` comes from **session** or **API key** — never from client body as sole authority for business mutations.

## Enforcement

1. `requireOrganizationContext()` on merchant routes  
2. Services: `WHERE organization_id = $sessionOrg`  
3. Cross-tenant reads → **404** (preferred) or **403**  
4. `X-Tenant-ID` → **403 TENANT_HEADER_FORBIDDEN**  

## Renewals (F-01 fixed)

`POST /billing/renewals/run`:

- Merchant / non-platform → scoped to `request.auth.organizationId`  
- `platform.admin` → may run global (worker-equivalent)  
- Requires step-up + audited as `billing.renewals.run`  

Background worker may still process all tenants (system actor) — not a merchant HTTP path.

## Platform exception

Admin review routes (`kyb.review`, `bank.review`, `platform.*`) intentionally cross orgs under platform permissions.
