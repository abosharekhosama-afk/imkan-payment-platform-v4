# API GAP ANALYSIS — `/api/v1`

**Date:** 2026-08-10  
**Inventory authority:** live route files under `apps/api/src/interfaces/http/apiV1/` + `docs/security/API_AUTHORIZATION_MATRIX.md`

## Present (major)

- Auth / MFA / step-up / password / invitations
- Organizations / members / audit / security / errors
- Merchant profile, KYB, documents, bank accounts
- Platform admin KYB/bank review
- Payment config, payment links, payments (+ cancel), public checkout
- Dashboard summary
- Providers, accounts, routes, inbound webhooks, API keys
- Customers, products, prices, subscriptions, invoices, renewals/run, invoice collect
- Custom RBAC roles

## Missing (production-critical)

| API area | Status | Blocker |
|---|---|---|
| Refunds create/list/get | Missing | Phase P6 |
| Webhook → Payment Intent / Invoice state apply | Missing (ingress only) | BG-W1 / P4 |
| Transactions dedicated list | Missing (UI composed) | BG-T1 |
| Bill-now / force subscription due | Missing | BG-E1 |
| Ledger accounts/entries/post | Missing | P7 |
| Balances | Missing | P7 |
| Settlements | Missing | P8 |
| Payouts (money movement) | Missing | P8 |
| Reconciliation | Missing | P8 |
| Risk / Disputes | Missing | P9 |
| Books payment-link / sync APIs | Missing | P10 / DEC-016 |
| Outbound merchant webhook endpoints | Missing | P4–P11 |
| Live provider credential store APIs | Partial (route upsert only) | DEC-009 / P5 |

## Deferred permission codes without routes

`payments.refund`, `payments.partial_refund`, `balances.*`, `settlements.*`, `payouts.*`, `disputes.*`, `reports.*`, `books.*`, `provider_credentials.manage`
