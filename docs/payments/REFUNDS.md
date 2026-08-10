# Refunds

**Status:** PARTIAL (sandbox path)  
**Live provider refunds:** BLOCKED BY: DEC-009

## Rules

- Only SUCCEEDED payments
- Currency must match
- Sum of PENDING+SUCCEEDED refunds ≤ captured amount
- Idempotency key supported
- Step-up required on `POST /api/v1/refunds`
- Audit + outbox `refund.created` / `payment.refunded|partially_refunded`
- Ledger compensating entry via `ledgerService.postRefund`

## API

- `GET /refunds`
- `GET /refunds/:id`
- `POST /refunds` — permissions `payments.refund|payments.manage` + step-up
