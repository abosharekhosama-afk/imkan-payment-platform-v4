# PRODUCT CONFORMANCE MATRIX

**Date:** 2026-08-10  
**Source of truth:** Code under `apps/`, `database/migrations/postgres/`, `tests/`, `apps/web/e2e/`  
**Production Ready:** NOT claimed

Statuses: `PASS` | `PARTIAL` | `BLOCKED` | `NOT IMPLEMENTED`

| Area | Feature | Expected | Current | API | DB | UI | AuthZ | Security | Tests | E2E | Status | Evidence | Missing |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Auth | Sign up | Create user+org+owner | Works + country | POST `/auth/register` | users, orgs | `/signup` | public | rate limit | phase2 | journeys partial | **PASS** | SignupPage, identity-service | Production email DEC-017 |
| Auth | Login / Logout | Session | Works | login/logout | sessions | LoginPage | session | brute-force | phase2 | role-matrix | **PASS** | | |
| Auth | Email verify | Required | Dev token path | verify-email | | signup message | | | phase2 | | **PARTIAL** | | DEC-017 mail |
| Auth | Forgot/reset password | Flow | API exists | password/forgot, reset | | no dedicated UI | | | phase2 | | **PARTIAL** | phase2-routes | Merchant UI |
| Auth | Change password | Authenticated | API | password/change | | Settings limited | step-up candidate | | | | **PARTIAL** | | UI |
| Auth | MFA | Enable + login | Works | mfa/enable, verify | | enable path | | | phase2/6.6 | | **PASS** | | |
| Auth | Step-up | Sensitive ops | Works | mfa/step-up + header | | refund/API keys | requireStepUp | short TTL | refund-conformance | | **PASS** | authz.ts | |
| Auth | Sessions list/revoke | Device visibility | Limited | me/logout | sessions | | | | | | **PARTIAL** | | Full session UI |
| Onboarding | Guided wizard | Block empty dashboard | Wizard + skip | kyb | | `/onboarding` + Gate | | | | | **PARTIAL** | OnboardingGate allows sessionStorage skip | Hard block mandatory fields |
| Onboarding | Legal/business/KYB/bank | Complete before ops | Pages exist | merchant/* | profiles | merchant/* | perms | | phase3 | | **PARTIAL** | | Enforce completion policy |
| Dashboard | Metrics | Real API aggregates | Payment counts from API | dashboard/summary | payment_intents | DashboardPage | payments.read | | phase6_5 | | **PASS** | no fake ledger numbers | Charts/filters limited |
| Dashboard | Balances | Ledger-derived | GET `/balances` | ledger | BalancesPage | balances.read | | phase7 | | **PARTIAL** | reserved/settled=0 | Settlement posts |
| Dashboard | Provider/KYB widgets | Status | KYB card; sandbox pill | kyb | | Dashboard | | | | | **PARTIAL** | | Rich provider health |
| Payment Links | CRUD lifecycle | Create/edit/disable/expire/copy | Service + UI | merchant/payment-links | payment_links | PaymentLinks* | payment_links.* | | phase4 | journeys | **PASS** | | |
| Payment Links | Books refs | external_invoice_ref + URLs | Columns + create wired | POST accepts external_invoice_ref, success/cancel_url | 025 cols | not full form fields | | | | | **PARTIAL** | payment-links-service | UI fields; Books sync |
| Payments | List/detail/timeline | Professional | List + detail + history | merchant/payments | intents/transitions | Payments* | payments.* | | phase4 | | **PASS** | | Advanced filters limited |
| Payments | Refund/cancel | Capability gated | Cancel + refund UI/API | refunds, cancel | refunds | PaymentDetail refund modal | refund+step-up | | refund-conformance | | **PASS** (sandbox) | DEC-009 live |
| Payments | Capture | Capability | State machine; UI limited | | | | | | | | **PARTIAL** | | Capture UI |
| Customers | Drawer detail | Side panel | Drawer with profile fields | /customers | customers | CustomersPage | | | phase6 | | **PARTIAL** | No payment/refund history in drawer | Nested history APIs |
| Customers | External IDs | Books refs | Columns + create API | external_customer_id, source_system | 025 | drawer shows | | | | | **PARTIAL** | customer-service | Upsert-by-external; checkout auto-link |
| Customers | Dedup | No bad duplicates | Email unique per org when present | | unique index | | | | phase6 | | **PARTIAL** | | External-id unique |
| Products | Catalog SoR | Must NOT be IMKAN SoR | Product/price APIs exist (billing interim) | /products | products | ProductsPage | | | phase6 | | **PARTIAL** | Spec: Books owns catalog | DEC-016 cutover; de-emphasize UI |
| Checkout | Hosted pay | Secure token | Public checkout | /checkout/:token | | CheckoutPage | public rate limit | amount from server | phase4 | journeys | **PASS** (sandbox) | | Live PCI DEC-011 |
| Providers | Adapter arch | Core free of provider code | Adapter+router+registry | providers/* | | ProvidersPage | | | phase5 | | **PASS** | sandbox only registered | Live adapters DEC-009 |
| Providers | Capability matrix | Declared | capability-profile + DB caps | | provider_capabilities | | | | phase5/7 | | **PASS** (sandbox) | | Live |
| Sandbox/Live | Isolation | Strong | Env on credentials/refunds SANDBOX | | | SANDBOX pill | client cannot set LIVE refund env | | phase5 | | **PARTIAL** | DEC-012 UX | Live activation |
| RBAC | Merchant roles | 6 roles | Catalog + matrix | | roles | nav gated | requirePermission | | phase6_6 + e2e | role-matrix | **PASS** | Remaining: F-04 BC, no RLS | Platform UI |
| RBAC | Platform roles | Separate | Permissions exist | | | **no Platform Admin UI** | | | phase6_6 | partial | **PARTIAL** | | Admin console |
| Ledger | Double-entry | Balanced immutable | Journals/entries; webhook posts payment; refund compensating | /ledger/* /balances | ledger_* | Balances | | | phase7 + refund-conformance | | **PARTIAL** | Fees/FX DEC-008; settle/payout no ledger yet | |
| Refunds | Lifecycle | Full/partial/idempotent/tenant | Hardened service | /refunds | refunds | Refunds + PaymentDetail | step-up | | **refund-conformance 9/9** | | **PASS** (sandbox) | | Live DEC-009 |
| Settlement | Draft→finalize | Ledger + lines | Draft from SUCCEEDED; fees=0 | /settlements | settlements | SettlementsPage | | | | | **PARTIAL** | No ledger post on finalize | Fees DEC-008 |
| Payout | From settlement | Step-up | Create PENDING | /payouts | payouts | PayoutsPage | step-up | | | | **PARTIAL** | No rail; no ledger | DEC-009 |
| Reconciliation | Discrepancies | Explicit records | Count mismatch run | /reconciliation/runs | reconciliation_* | coming-soon mostly | | | | | **PARTIAL** | Amount/currency checks thin | UI |
| Risk/Disputes | Foundation | Records | CRUD signals/disputes | /risk /disputes | | pages | | | | | **PARTIAL** | | Scoring/evidence |
| Books | Connector | Sync events | Internal SYNCED state | /books/sync-state | books_sync_state | | | | | | **PARTIAL** | Internal only | DEC-016 Zoho |
| Platform Admin | Separate console | Independent | **Missing UI** | some platform perms | | none | | | | | **NOT IMPLEMENTED** | | Build admin surface |
| i18n | AR/EN RTL | Full | messages.ts + Appearance dir | | | hard-coded EN majority | | | | | **PARTIAL** | AppearancePage sets dir | Wire t() across console |
| Monitoring/Backup | Ops | Required for gate | Docs only | health | | | | | | | **NOT IMPLEMENTED** / **BLOCKED** | P11 docs | Restore drills |
| Security/PCI | Formal | DEC-011 | Controls present; PCI blocked | | | | | | | | **BLOCKED** | DEC-011 | Pen test |

## Summary counts (matrix rows above)

| Status | Count |
|---|---|
| PASS | 12 |
| PARTIAL | 24 |
| BLOCKED | 2 |
| NOT IMPLEMENTED | 2 |
