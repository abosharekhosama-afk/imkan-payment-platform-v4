# Phase 3 Implementation Status

Implemented on top of Phase 2.

- Provider contract expanded to tokenization/authorize/capture/refund.
- Sandbox adapter updated.
- Provider token vault added.
- Payment method session confirmation added.
- Payment attempts now record authorization/capture/action-required state.
- Hosted checkout accepts an opaque token.
- Migration `005_phase3_processor_ready.sql` added.

Not yet production: real processor adapter, real hosted card fields, 3DS callback/webhook handling, dispute flows, settlement, payout and reconciliation.
