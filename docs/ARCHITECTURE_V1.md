# System Architecture v1.0 — Build Baseline

## Contexts
Identity, Merchant, Compliance, Customer, Payment Methods, Payments, Refunds, Disputes, Risk, Ledger, Balance, Settlement, Payout, Reconciliation, Developer Platform, Notifications, Reporting, Integrations and Advanced modules.

## Runtime
API application -> application services -> domain -> repository/provider ports -> adapters. MySQL is the first persistence adapter; Redis is infrastructure for caching/rate limits/queues. Outbox is the reliability boundary for domain events.

## Financial rule
No payment is considered production-safe until its financial effect is represented by balanced immutable ledger transactions, projected into balances, included in settlement/payout eligibility and reconciled against external sources.

## Isolation
Every tenant-owned query must carry tenant context. Production authentication and authorization will derive tenant context from verified credentials, not client-supplied headers.
