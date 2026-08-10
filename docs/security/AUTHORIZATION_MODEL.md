# Authorization Model — V4

```text
Authentication (session | API key)
    → Organization membership (session.organization_id)
    → Role(s) → Permission set
    → requirePermission / requireAllPermissions
    → Resource org match (authorizeResource / service WHERE)
    → requireStepUp (sensitive ops)
    → Handler
```

## Backend helpers (`apps/api/src/foundation/authz.ts`)

| Helper | Meaning |
|---|---|
| `apiV1AuthHook` | Bind auth; reject `X-Tenant-ID` |
| `requirePermission(...codes)` | OR match (aliases resolved) |
| `requireAllPermissions(...codes)` | AND match |
| `authorize` | Alias of `requirePermission` |
| `requireOrganizationContext` / `requireOrganizationMembership` | Session org required |
| `requireRole` / `requirePlatformRole` | Coarse role gates (prefer permissions) |
| `authorizeResource` / `assertSameOrganization` | Tenant resource check (default 404) |
| `requireStepUp(op?)` | Consume `X-Step-Up-Token` |

## Frontend

- `Can` — hide buttons  
- `RequirePermission` — route UX gate → `/forbidden`  
- Never trust UI alone  

## API keys

- Org-bound permissions/scopes  
- Cannot perform step-up or enable MFA  
