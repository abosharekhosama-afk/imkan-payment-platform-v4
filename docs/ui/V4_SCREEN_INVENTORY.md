# V4 Screen Inventory

| UI route | Screen | `/api/v1` dependencies | Permissions (UX) |
|---|---|---|---|
| `/login` | Login / MFA | `/auth/login`, `/auth/mfa/verify` | public |
| `/` | Dashboard | `/merchant/dashboard/summary` | `payments.read` |
| `/payments` | Payments list | `/merchant/payments` | `payments.read` |
| `/payments/:id` | Payment detail | `/merchant/payments/:id`, cancel | `payments.read` / `.manage` |
| `/transactions` | Transactions (composed) | payments + payment detail | `payments.read` |
| `/payment-links` | Links list/create | `/merchant/payment-links` | `payment_links.*` |
| `/payment-links/:id` | Link detail/actions | link get + activate/… | `payment_links.*` |
| `/payment-config` | Branding config | `/merchant/payment-config` | `payment_config.*` |
| `/checkout/:token` | Public checkout | `/checkout/:token`… | public |
| `/customers` | Customers | `/customers` | `customers.*` |
| `/products` | Products | `/products` | `products.*` |
| `/prices` | Prices | `/prices` | `prices.*` |
| `/subscriptions` | Subscriptions | `/subscriptions`, renewals | `subscriptions.*` / `billing.manage` |
| `/subscriptions/:id` | Sub detail | list + actions | `subscriptions.*` |
| `/invoices` | Invoices | `/invoices`, collect | `invoices.*` |
| `/invoices/:id` | Invoice detail | `/invoices/:id` | `invoices.*` |
| `/merchant/profile` | Profile/legal | `/merchant/profile`, legal | `merchant.*` |
| `/merchant/business` | Business | business-profile | `merchant.*` |
| `/merchant/kyb` | KYB | `/merchant/kyb` | `kyb.*` |
| `/merchant/documents` | Documents | `/merchant/documents` | `documents.read` |
| `/merchant/bank-accounts` | Bank accounts | `/merchant/bank-accounts` | `bank.read` |
| `/providers` | Providers + caps | `/providers`, capabilities | `providers.read` |
| `/providers/accounts` | Accounts/routes | accounts, routes | `providers.read` |
| `/providers/webhooks` | Webhook events | `/provider-webhooks` | `webhooks.read` |
| `/developers/api-keys` | API keys | `/api-keys` | `api_keys.*` |
| `/security/users` | Users/invites | members, invitations | `users.read` |
| `/security/roles` | Roles (session RO) | `/auth/me` | — |
| `/security/audit` | Audit | `/audit-events` | `audit.read` |
| `/security/events` | Security events | `/security-events` | `security.read` |
| `/security/errors` | Errors | `/error-reports` | `errors.read` |
| `/settings/organization` | Org | `/organizations/current` | `org.read` |
| `/settings/appearance` | Theme/lang | client-only | — |
| `/coming-soon/*` | Placeholders | none | — |

## Placeholders (no Legacy reconnect)

Refunds, Balances, Settlements, Payouts, Reconciliation, Risk, Disputes, Reports, Ledger.
