# V4 UI → API Dependency Map

Central client: `apps/web/src/v4/api/client.ts` (`apiV1`)  
Endpoint facade: `apps/web/src/v4/api/endpoints.ts`  
Feature modules: `features/payments/api.ts`, `features/billing/api.ts`

## Additive Phase 6.5 backend (minimal)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/merchant/dashboard/summary` | Dashboard KPIs from `payment_intents` |
| GET | `/api/v1/security-events` | Security events list |

## Existing endpoints consumed (non-exhaustive)

Auth, org, audit, error-reports, merchant profile/legal/business/kyb/documents/bank, payment-config, payment-links (+ lifecycle), payments (+ cancel), public checkout, customers/products/prices/subscriptions/invoices/collect/renewals, providers/capabilities/accounts/routes, provider-webhooks, api-keys.

## Explicitly NOT called

- Any `/v1/*` MySQL route
- Legacy `/checkout/public/*`, `/pay/*`
- Refund / balance / settlement / payout / reconciliation / risk / dispute / ledger APIs (absent on V4)
