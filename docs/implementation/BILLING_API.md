# Billing API (`/api/v1`)

Auth: Bearer session or `Api-Key`. Mutating routes require `Idempotency-Key`.

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/customers` | customers.read / manage |
| GET/POST | `/products` | products.* |
| GET/POST | `/prices` | prices.* |
| GET/POST | `/subscriptions` | subscriptions.* |
| POST | `/subscriptions/:id/pause\|resume\|cancel` | subscriptions.manage |
| GET | `/invoices`, `/invoices/:id` | invoices.read |
| POST | `/invoices/:id/collect` | invoices.manage |
| POST | `/billing/renewals/run` | billing.manage |

Cancel body: `{ "at_period_end": true }` (default behavior when omitted / true) or `false` for immediate cancel.

Collection path: Billing → Payment Core → Provider Router → Sandbox only.
