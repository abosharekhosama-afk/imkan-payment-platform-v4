# Phase 6 — Billing (V4)

**Status:** Implemented (Sandbox collection). **Not Production Ready.**  
**Decisions:** DEC-006 INTERIM, DEC-007 RESOLVED (Option A — deferred ledger).

## Flow

```
Catalog (Product/Price) → Subscription → Invoice (per period)
  → Billing renewal worker
  → Payment Core.collectForBilling
  → Provider Router → Sandbox Adapter
```

Billing never calls providers directly. No ledger posting (Phase 7).

## DEC-007 summary

- Due: `next_billing_at <= NOW()` (UTC), eligible statuses
- One invoice per subscription period (unique index)
- Max 3 attempts; backoff after fail: 5 min then 10 min
- Ambiguous/timeout: query-before-retry
- Fail → `PAST_DUE` → max retries → `UNPAID` + 3-day grace → `EXPIRED`
- Success → invoice `PAID`, subscription `ACTIVE`, advance period

## Tables

`customers`, `products`, `prices`, `subscriptions`, `subscription_items`, `subscription_transitions`, `invoices`, `invoice_items`, `billing_collection_attempts`  
(+ nullable session/link FKs on payment attempts/sessions for off-session billing)

## APIs

`/api/v1/customers|products|prices|subscriptions|invoices` + `/billing/renewals/run` + `/invoices/:id/collect`

## UI

Merchant console: Customers / Subscriptions / Invoices via `/api/v1` (V4 login).

## Production gate

Sandbox only. Live recurring blocked by DEC-009 + PCI. No Production Ready claim.
