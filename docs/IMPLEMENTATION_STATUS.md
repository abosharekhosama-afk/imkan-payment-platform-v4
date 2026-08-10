# Implementation Status — v1.1

## Completed

- [x] Tenant-aware merchant/customer validation
- [x] Payment Session + idempotency
- [x] Payment Attempt lifecycle (sandbox execution)
- [x] Tokenized Payment Methods
- [x] Payment State enforcement at session level
- [x] Sandbox provider
- [x] Outbox/Inbox event persistence
- [x] Double-entry payment posting
- [x] Merchant payable balance projection
- [x] Full/partial refund invariant
- [x] Refund compensating ledger posting
- [x] Refund idempotency
- [x] Payment Links
- [x] Provider webhook ingestion + deduplication
- [x] Webhook endpoint registration foundation
- [x] Audit trail for payment/refund operations

## Next implementation milestone

1. Real event worker: Outbox -> signed merchant webhook delivery -> retry/backoff/DLQ.
2. Balance rules for pending/available/reserve and negative balance.
3. Settlement engine and settlement imports.
4. Payout engine + bank abstraction + sandbox bank.
5. Reconciliation matching/exceptions.
6. Hosted Checkout UI and Payment Link public checkout.
7. API key/OAuth authentication and granular RBAC.
8. Disputes, KYC/KYB, Risk, Reports and Admin.
9. Integration/contract/E2E tests.
10. Production hardening/compliance.
