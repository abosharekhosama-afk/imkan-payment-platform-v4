# Permission Catalog — V4 (Phase 6.6 Final)

**Source of truth (code):** `apps/api/src/foundation/permissions-catalog.ts`  
**Frontend mirror (UX):** `apps/web/src/v4/permissions/catalog.ts`  
**DB seeds:** `005`–`020` + `021` / `022` / `023_phase6_6_rbac_hardening.sql`  
**Live listing:** `GET /api/v1/rbac/permissions`

## Aliases

| Alias | Canonical |
|---|---|
| `organization.read` | `org.read` |
| `organization.manage` | `org.manage` |
| `audit_logs.read` | `audit.read` |

## Status legend

- **active** — enforced on existing APIs  
- **deferred** — reserved (Phase 7+ / missing product surface); seeded but not claimed as live features  

## Coverage (required domains)

| Domain | Read | Write / lifecycle | Sensitive / deferred |
|---|---|---|---|
| Authentication | session self | password change (step-up) | MFA enable self-service |
| Organization | org.read | org.manage | ownership DEF |
| Users / Invites | users.read | users.manage, users.invite, invites.manage, users.deactivate | step-up |
| Roles | roles.read | roles.manage | step-up + escalation guards |
| KYB | kyb.read | kyb.submit / kyb.manage | kyb.review (platform) |
| Merchant | merchant.read | merchant.manage | — |
| Bank Accounts | bank.read | bank.manage | step-up |
| Payments | payments.read | create / cancel / manage | capture/refund DEF |
| Refunds | — | payments.refund DEF | step-up planned |
| Customers | customers.read | customers.manage | — |
| Payment Links | payment_links.read | payment_links.manage | — |
| Checkout | checkout.read | checkout.manage | public token checkout |
| Invoices | invoices.read | create / pay / manage | send/void/refund DEF; collect step-up |
| Billing | billing.read | billing.manage | renewals step-up |
| Subscriptions | subscriptions.read | create/pause/resume/cancel/manage | — |
| Products / Prices / Plans | *.read | *.manage | — |
| Balances / Settlements / Payouts / Disputes / Reports | *.read DEF | *.manage DEF | — |
| Providers | providers.read | providers.manage | credentials DEF + route upsert step-up |
| Provider Credentials | — | provider_credentials.manage DEF | — |
| API Keys | api_keys.read | api_keys.manage | create/revoke step-up |
| Webhooks / Events | webhooks.read, events.read | webhooks.manage DEF | — |
| Integrations | integrations.read DEF | integrations.manage DEF | — |
| Books / Notifications | books.* / notifications.* DEF | DEF | — |
| Transactions | transactions.read | — | composed from payments |
| Audit Logs | audit.read | — | — |
| Security / Settings | security.read, settings.read | security.manage, settings.manage | — |

Do not invent fee/settlement/payout/ledger behavior solely because a deferred permission exists.
