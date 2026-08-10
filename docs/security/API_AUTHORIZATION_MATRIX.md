# API Authorization Matrix

Generated from live route sources under `apps/api/src/interfaces/http/apiV1/`.
Date: 2026-08-09

Organization context for tenant mutators is taken from the authenticated session/API key, not from untrusted body/query `organization_id`.

| Endpoint | Method | Module | Required Permission | Role/Platform Scope | Organization Scope | Resource Scope | Sensitive? | Step-up | Source |
|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/admin/bank-accounts` | GET | phase3 | bank.review | platform allowed if perm | platform cross-tenant | platform cross-tenant | no | no | `phase3-routes.ts` |
| `/api/v1/admin/bank-accounts/:accountId/verification/decision` | POST | phase3 | bank.review | platform allowed if perm | platform cross-tenant | platform cross-tenant | yes | yes | `phase3-routes.ts` |
| `/api/v1/admin/bank-accounts/:accountId/verification/start` | POST | phase3 | bank.review | platform allowed if perm | platform cross-tenant | platform cross-tenant | no | no | `phase3-routes.ts` |
| `/api/v1/admin/documents/:documentId/review` | POST | phase3 | kyb.review | platform allowed if perm | platform cross-tenant | platform cross-tenant | no | no | `phase3-routes.ts` |
| `/api/v1/admin/kyb/cases` | GET | phase3 | kyb.review | platform allowed if perm | platform cross-tenant | platform cross-tenant | no | no | `phase3-routes.ts` |
| `/api/v1/admin/kyb/cases/:caseId` | GET | phase3 | kyb.review | platform allowed if perm | platform cross-tenant | platform cross-tenant | no | no | `phase3-routes.ts` |
| `/api/v1/admin/kyb/cases/:caseId/decision` | POST | phase3 | kyb.review | platform allowed if perm | platform cross-tenant | platform cross-tenant | yes | yes | `phase3-routes.ts` |
| `/api/v1/admin/kyb/cases/:caseId/request-information` | POST | phase3 | kyb.review | platform allowed if perm | platform cross-tenant | platform cross-tenant | no | no | `phase3-routes.ts` |
| `/api/v1/admin/kyb/cases/:caseId/start-review` | POST | phase3 | kyb.review | platform allowed if perm | platform cross-tenant | platform cross-tenant | no | no | `phase3-routes.ts` |
| `/api/v1/admin/kyb/cases/:caseId/suspend` | POST | phase3 | kyb.review | platform allowed if perm | platform cross-tenant | platform cross-tenant | yes | yes | `phase3-routes.ts` |
| `/api/v1/api-keys` | GET | phase5 | api_keys.read | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase5-routes.ts` |
| `/api/v1/api-keys` | POST | phase5 | api_keys.manage | platform.admin | platform allowed if perm | session org | org-owned | yes | api_keys.create | `phase5-routes.ts` |
| `/api/v1/api-keys/:id/revoke` | POST | phase5 | api_keys.manage | platform.admin | platform allowed if perm | session org | org-owned | yes | api_keys.revoke | `phase5-routes.ts` |
| `/api/v1/audit-events` | GET | routes | audit.read | platform.admin | platform allowed if perm | session org | org-owned | no | no | `routes.ts` |
| `/api/v1/auth/login` | POST | routes | (public) | merchant | n/a | n/a | no | no | `routes.ts` |
| `/api/v1/auth/logout` | POST | routes | authenticated session | merchant | handler | handler | no | no | `routes.ts` |
| `/api/v1/auth/me` | GET | routes | authenticated session | merchant | handler | handler | no | no | `routes.ts` |
| `/api/v1/auth/mfa/enable` | POST | routes | authenticated session | merchant | handler | handler | no | no | `routes.ts` |
| `/api/v1/auth/mfa/step-up` | POST | phase2 | authenticated session | merchant | handler | handler | no | no | `phase2-routes.ts` |
| `/api/v1/auth/mfa/verify` | POST | routes | (public) | merchant | n/a | n/a | no | no | `routes.ts` |
| `/api/v1/auth/password/change` | POST | phase2 | auth-only | merchant | handler | handler | yes | yes | `phase2-routes.ts` |
| `/api/v1/auth/password/forgot` | POST | phase2 | (public) | merchant | n/a | n/a | no | no | `phase2-routes.ts` |
| `/api/v1/auth/password/reset` | POST | phase2 | (public) | merchant | n/a | n/a | no | no | `phase2-routes.ts` |
| `/api/v1/auth/register` | POST | routes | (public) | merchant | n/a | n/a | no | no | `routes.ts` |
| `/api/v1/auth/resend-verification` | POST | phase2 | (public) | merchant | n/a | n/a | no | no | `phase2-routes.ts` |
| `/api/v1/auth/verify-email` | POST | phase2 | (public) | merchant | n/a | n/a | no | no | `phase2-routes.ts` |
| `/api/v1/billing/renewals/run` | POST | phase6 | billing.manage | platform.admin | platform allowed if perm | session org | org-owned | yes | billing.renewals.run | `phase6-routes.ts` |
| `/api/v1/checkout/:token` | GET | phase4 | (public) | merchant | n/a | n/a | no | no | `phase4-routes.ts` |
| `/api/v1/checkout/:token/payment` | POST | phase4 | (public) | merchant | n/a | n/a | no | no | `phase4-routes.ts` |
| `/api/v1/checkout/:token/session` | GET | phase4 | (public) | merchant | n/a | n/a | no | no | `phase4-routes.ts` |
| `/api/v1/checkout/:token/session` | POST | phase4 | (public) | merchant | n/a | n/a | no | no | `phase4-routes.ts` |
| `/api/v1/customers` | GET | phase6 | customers.read | billing.manage | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase6-routes.ts` |
| `/api/v1/customers` | POST | phase6 | customers.manage | billing.manage | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase6-routes.ts` |
| `/api/v1/error-reports` | GET | phase2 | errors.read | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase2-routes.ts` |
| `/api/v1/health` | GET | routes | (public) | merchant | n/a | n/a | no | no | `routes.ts` |
| `/api/v1/health/ready` | GET | routes | (public) | merchant | n/a | n/a | no | no | `routes.ts` |
| `/api/v1/invitations/accept` | POST | phase2 | (public) | merchant | n/a | n/a | no | no | `phase2-routes.ts` |
| `/api/v1/invoices` | GET | phase6 | invoices.read | billing.manage | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase6-routes.ts` |
| `/api/v1/invoices/:id` | GET | phase6 | invoices.read | billing.manage | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase6-routes.ts` |
| `/api/v1/invoices/:id/collect` | POST | phase6 | invoices.pay | invoices.manage | billing.manage | platform.admin | platform allowed if perm | session org | org-owned | yes | invoices.collect | `phase6-routes.ts` |
| `/api/v1/master-data/:type` | GET | phase3 | org.read | masterdata.manage | platform.admin | platform.support | platform allowed if perm | handler | handler | no | no | `phase3-routes.ts` |
| `/api/v1/master-data/:type` | POST | phase3 | masterdata.manage | merchant | handler | handler | no | no | `phase3-routes.ts` |
| `/api/v1/master-data/:type/:code` | PATCH | phase3 | masterdata.manage | merchant | handler | handler | no | no | `phase3-routes.ts` |
| `/api/v1/master-data/:type/:code/${action}` | POST | phase3 | masterdata.manage | merchant | handler | handler | no | no | `phase3-routes.ts` |
| `/api/v1/master-data/types` | GET | phase3 | org.read | masterdata.manage | platform.admin | platform.support | platform allowed if perm | handler | handler | no | no | `phase3-routes.ts` |
| `/api/v1/merchant/${path}` | POST | phase3 | merchant.manage | merchant | session org | org-owned | no | no | `phase3-routes.ts` |
| `/api/v1/merchant/${path}/:personId/remove` | POST | phase3 | merchant.manage | merchant | session org | org-owned | no | no | `phase3-routes.ts` |
| `/api/v1/merchant/bank-accounts` | GET | phase3 | bank.read | merchant | session org | org-owned | no | no | `phase3-routes.ts` |
| `/api/v1/merchant/bank-accounts` | POST | phase3 | bank.manage | merchant | session org | org-owned | yes | yes | `phase3-routes.ts` |
| `/api/v1/merchant/bank-accounts/:accountId` | GET | phase3 | bank.read | merchant | session org | org-owned | no | no | `phase3-routes.ts` |
| `/api/v1/merchant/bank-accounts/:accountId/activate` | POST | phase3 | bank.manage | merchant | session org | org-owned | yes | yes | `phase3-routes.ts` |
| `/api/v1/merchant/bank-accounts/:accountId/deactivate` | POST | phase3 | bank.manage | merchant | session org | org-owned | yes | yes | `phase3-routes.ts` |
| `/api/v1/merchant/bank-accounts/:accountId/set-default` | POST | phase3 | bank.manage | merchant | session org | org-owned | yes | bank.account.set_default | `phase3-routes.ts` |
| `/api/v1/merchant/business-profile` | PUT | phase3 | merchant.manage | merchant | session org | org-owned | no | no | `phase3-routes.ts` |
| `/api/v1/merchant/dashboard/summary` | GET | phase4 | payments.read | platform.admin | platform.support | platform allowed if perm | session org | org-owned | no | no | `phase4-routes.ts` |
| `/api/v1/merchant/documents` | GET | phase3 | documents.read | merchant | session org | org-owned | no | no | `phase3-routes.ts` |
| `/api/v1/merchant/documents` | POST | phase3 | documents.manage | merchant | session org | org-owned | no | no | `phase3-routes.ts` |
| `/api/v1/merchant/documents/:documentId/archive` | POST | phase3 | documents.manage | merchant | session org | org-owned | no | no | `phase3-routes.ts` |
| `/api/v1/merchant/kyb` | GET | phase3 | kyb.read | merchant | session org | org-owned | no | no | `phase3-routes.ts` |
| `/api/v1/merchant/kyb/submit` | POST | phase3 | kyb.submit | merchant | session org | org-owned | no | no | `phase3-routes.ts` |
| `/api/v1/merchant/legal-profile` | PUT | phase3 | merchant.manage | merchant | session org | org-owned | no | no | `phase3-routes.ts` |
| `/api/v1/merchant/payment-config` | GET | phase4 | payment_config.read | merchant | session org | org-owned | no | no | `phase4-routes.ts` |
| `/api/v1/merchant/payment-config` | PUT | phase4 | payment_config.manage | merchant | session org | org-owned | no | no | `phase4-routes.ts` |
| `/api/v1/merchant/payment-links` | GET | phase4 | payment_links.read | merchant | session org | org-owned | no | no | `phase4-routes.ts` |
| `/api/v1/merchant/payment-links` | POST | phase4 | payment_links.manage | merchant | session org | org-owned | no | no | `phase4-routes.ts` |
| `/api/v1/merchant/payment-links/:linkId` | GET | phase4 | payment_links.read | merchant | session org | org-owned | no | no | `phase4-routes.ts` |
| `/api/v1/merchant/payment-links/:linkId` | PATCH | phase4 | payment_links.manage | merchant | session org | org-owned | no | no | `phase4-routes.ts` |
| `/api/v1/merchant/payment-links/:linkId/${action}` | POST | phase4 | payment_links.manage | merchant | session org | org-owned | no | no | `phase4-routes.ts` |
| `/api/v1/merchant/payments` | GET | phase4 | payments.read | merchant | session org | org-owned | no | no | `phase4-routes.ts` |
| `/api/v1/merchant/payments/:paymentId` | GET | phase4 | payments.read | merchant | session org | org-owned | no | no | `phase4-routes.ts` |
| `/api/v1/merchant/payments/:paymentId/cancel` | POST | phase4 | payments.cancel | payments.manage | merchant | session org | org-owned | no | no | `phase4-routes.ts` |
| `/api/v1/merchant/profile` | GET | phase3 | merchant.read | merchant | session org | org-owned | no | no | `phase3-routes.ts` |
| `/api/v1/merchant/profile` | PUT | phase3 | merchant.manage | merchant | session org | org-owned | no | no | `phase3-routes.ts` |
| `/api/v1/organizations/:organizationId` | GET | routes | org.read | platform.admin | platform.support | platform allowed if perm | handler | handler | no | no | `routes.ts` |
| `/api/v1/organizations/:organizationId/invitations` | GET | phase2 | invites.manage | users.read | platform.admin | platform allowed if perm | handler | handler | no | no | `phase2-routes.ts` |
| `/api/v1/organizations/:organizationId/invitations` | POST | phase2 | invites.manage | users.manage | users.invite | merchant | session org | org-owned | yes | users.invite | `phase2-routes.ts` |
| `/api/v1/organizations/:organizationId/invitations/:invitationId/revoke` | POST | phase2 | invites.manage | users.manage | merchant | handler | handler | yes | yes | `phase2-routes.ts` |
| `/api/v1/organizations/:organizationId/members` | GET | routes | users.read | users.manage | platform.admin | platform allowed if perm | handler | handler | no | no | `routes.ts` |
| `/api/v1/organizations/:organizationId/users/:userId/deactivate` | POST | phase2 | users.deactivate | users.manage | merchant | handler | handler | yes | yes | `phase2-routes.ts` |
| `/api/v1/organizations/current` | GET | routes | org.read | platform.admin | platform.support | platform allowed if perm | session org | org-owned | no | no | `routes.ts` |
| `/api/v1/prices` | GET | phase6 | prices.read | billing.manage | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase6-routes.ts` |
| `/api/v1/prices` | POST | phase6 | prices.manage | billing.manage | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase6-routes.ts` |
| `/api/v1/products` | GET | phase6 | products.read | billing.manage | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase6-routes.ts` |
| `/api/v1/products` | POST | phase6 | products.manage | billing.manage | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase6-routes.ts` |
| `/api/v1/provider-accounts` | GET | phase5 | providers.read | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase5-routes.ts` |
| `/api/v1/provider-routes` | GET | phase5 | providers.read | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase5-routes.ts` |
| `/api/v1/provider-routes` | POST | phase5 | providers.manage | platform.admin | platform allowed if perm | session org | org-owned | yes | providers.credentials | `phase5-routes.ts` |
| `/api/v1/provider-webhooks` | GET | phase5 | webhooks.read | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase5-routes.ts` |
| `/api/v1/providers` | GET | phase5 | providers.read | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase5-routes.ts` |
| `/api/v1/providers/:code/capabilities` | GET | phase5 | providers.read | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase5-routes.ts` |
| `/api/v1/rbac/permissions` | GET | phase6_6-rbac | roles.read | users.read | org.read | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase6_6-rbac-routes.ts` |
| `/api/v1/rbac/roles` | GET | phase6_6-rbac | roles.read | users.read | org.read | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase6_6-rbac-routes.ts` |
| `/api/v1/rbac/roles` | POST | phase6_6-rbac | roles.manage | merchant | session org | org-owned | yes | roles.custom.manage | `phase6_6-rbac-routes.ts` |
| `/api/v1/rbac/roles/:roleId` | DELETE | phase6_6-rbac | roles.manage | merchant | session org | org-owned | yes | roles.custom.manage | `phase6_6-rbac-routes.ts` |
| `/api/v1/rbac/roles/:roleId/permissions` | PUT | phase6_6-rbac | roles.manage | merchant | session org | org-owned | yes | roles.custom.manage | `phase6_6-rbac-routes.ts` |
| `/api/v1/rbac/sensitive-operations` | GET | phase6_6-rbac | roles.read | security.read | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase6_6-rbac-routes.ts` |
| `/api/v1/rbac/users/:userId/assign-role` | POST | phase6_6-rbac | roles.manage | users.manage | merchant | session org | org-owned | yes | roles.assign | `phase6_6-rbac-routes.ts` |
| `/api/v1/security-events` | GET | routes | security.read | platform.admin | platform allowed if perm | session org | org-owned | no | no | `routes.ts` |
| `/api/v1/subscriptions` | GET | phase6 | subscriptions.read | billing.manage | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase6-routes.ts` |
| `/api/v1/subscriptions` | POST | phase6 | subscriptions.create | subscriptions.manage | billing.manage | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase6-routes.ts` |
| `/api/v1/subscriptions/:id/cancel` | POST | phase6 | subscriptions.cancel | subscriptions.manage | billing.manage | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase6-routes.ts` |
| `/api/v1/subscriptions/:id/pause` | POST | phase6 | subscriptions.pause | subscriptions.manage | billing.manage | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase6-routes.ts` |
| `/api/v1/subscriptions/:id/resume` | POST | phase6 | subscriptions.resume | subscriptions.manage | billing.manage | platform.admin | platform allowed if perm | session org | org-owned | no | no | `phase6-routes.ts` |
| `/api/v1/webhooks/providers/:providerCode` | POST | phase5 | (public) | merchant | n/a | n/a | no | no | `phase5-routes.ts` |

**Total routes inventoried:** 104

## Notes

- Regenerate: `node scripts/gen-api-authz-matrix.mjs`
- `*.manage` aggregates remain accepted alongside granular codes for backward compatibility (see ROLE_MATRIX).
- Deferred financial modules (refunds/payouts/settlements) have catalog permissions but no routes yet.
- Public checkout and inbound provider webhooks are intentionally unauthenticated; authorization is token/signature based.
- Audit required for sensitive mutations is enforced in services/routes (see SENSITIVE_OPERATIONS.md).
