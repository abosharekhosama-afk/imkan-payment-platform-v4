# v1.1 Implementation Changelog

## Financial Core connected

The v1.0 foundation has been extended with executable financial behavior:

- Payment success now creates a balanced double-entry ledger transaction.
- Merchant payable balance is projected from posted payment/refund entries.
- Refunds are constrained by the remaining refundable amount and create compensating ledger entries.
- Payment methods are stored as provider tokens/metadata only.
- Payment Links create Payment Sessions and can be paid in Sandbox.
- Provider webhook ingestion is persisted in an Inbox-style store and deduplicated by external event ID.
- Outbox events and audit entries are emitted for payment/refund changes.

## Scope boundary

This release deliberately does not claim production readiness. Settlement, payout, bank movement, reconciliation, real provider adapters, secure authentication, webhook delivery workers, KYC/Risk/Disputes, reports, hosted checkout, and production security/compliance remain explicit milestones.
