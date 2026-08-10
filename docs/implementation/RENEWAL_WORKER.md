# Renewal Worker (Phase 6 / DEC-007)

- Interval: `BILLING_RENEWAL_WORKER_INTERVAL_MS` (default from `SUBSCRIPTION_RENEWAL_WORKER_INTERVAL_MS` / 5s)
- Disable: `BILLING_RENEWAL_WORKER_ENABLED=false`
- Manual: `POST /api/v1/billing/renewals/run`
- Idempotency: `billing-collect:{invoiceId}:{attempt}` + unique period invoices
- Path: Payment Core → Provider Router → Sandbox
- Ambiguous: query-before-retry; no blind second charge
- Backoff after failed attempts: 5 minutes, then 10 minutes; max 3 attempts
