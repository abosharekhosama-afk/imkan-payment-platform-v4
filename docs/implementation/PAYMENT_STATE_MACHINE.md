# Payment Intent State Machine (Phase 4)

## States

`CREATED` · `REQUIRES_PAYMENT` · `PROCESSING` · `SUCCEEDED` · `FAILED` · `CANCELLED` · `EXPIRED`

## Allowed transitions

```
CREATED
  -> REQUIRES_PAYMENT
  -> CANCELLED
  -> EXPIRED

REQUIRES_PAYMENT
  -> PROCESSING
  -> CANCELLED
  -> EXPIRED

PROCESSING
  -> SUCCEEDED
  -> FAILED

SUCCEEDED | FAILED | CANCELLED | EXPIRED  (terminal)
```

Happy path: `CREATED -> REQUIRES_PAYMENT -> PROCESSING -> SUCCEEDED`

## Enforcement

- Application: `PAYMENT_INTENT_TRANSITIONS` table in `apps/api/src/payments/payment-state-machine.ts` — any other transition throws `PAYMENT_INVALID_TRANSITION` (409).
- Concurrency: `UPDATE ... WHERE id=? AND status=? AND version=?` — mismatch throws `PAYMENT_CONCURRENT_MODIFICATION` (409).
- History: every transition appends to `payment_intent_transitions` (append-only trigger).
- Attempts: partial unique index allows at most one `CREATED|PROCESSING` attempt per intent (`PAYMENT_ATTEMPT_IN_FLIGHT`).

## Extensions beyond the brief

Cancel/expire from `REQUIRES_PAYMENT` (not only `CREATED`) so an open checkout can be aborted without inventing a parallel machine. Documented here; unit-tested.
