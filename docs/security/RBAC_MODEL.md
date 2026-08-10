# RBAC Model — IMKAN Payments V4

## Actors

- **Merchant users** — membership in one org session; merchant system or custom roles  
- **Platform users** — platform-scoped roles (`organization_id IS NULL` on `user_roles`)  
- **API keys** — org-bound machine credentials with scoped permissions  

## Hierarchy

```text
User → Organization membership → Role → Permissions → Resource (org-scoped)
```

## System roles

Merchant: OWNER, ADMIN, FINANCE, DEVELOPER, SUPPORT, VIEWER  
Platform: OWNER, ADMIN, SUPPORT, FINANCE  

## Custom roles

Org-scoped rows in `roles` (`is_system=false`, `organization_id` set).  
Escalation prevention: assignable permissions ⊆ actor permissions.

## Separation

Merchant high privilege never implies platform APIs. Platform permissions are explicit `platform.*` / review codes.
