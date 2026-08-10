# Phase 2 Implementation Status

## Scope
Payment Core refactor + Provider abstraction + stateful payment-method sessions + Hosted Checkout hardening + Webhook delivery worker.

## Implemented

### 1. Provider abstraction
- `domain/payments/provider.ts`
- `PaymentProvider` interface
- `SandboxProvider` implements the interface
- provider name is persisted on payment attempts/payments
- provider receives an idempotency key

### 2. Payment application split
- `application/payments/payment-service.ts`
- `application/payments/refund-service.ts`
- `application/payments/payment-link-service.ts`
- `application/payments/checkout-service.ts`
- `application/payments/service.ts` is now a compatibility facade for existing routes

### 3. Ledger separation
- `application/ledger/service.ts`
- Payment and refund postings are no longer embedded inside the payment application service.

### 4. Idempotency
Payment session creation, payment execution and refunds now use the same idempotency record pattern.

### 5. Payment method sessions
- New `payment_method_sessions` table
- Session secret is stored hashed
- Sandbox provider and expiry are explicit
- Existing fake random endpoint has been replaced with a persisted session workflow

### 6. Hosted Checkout
- Public checkout loads the payment link through the checkout service
- Payment execution requires `Idempotency-Key`
- Successful payment transitions the payment link to `PAID`
- No PAN/CVV is collected by this platform

### 7. Webhook worker
- New `application/webhooks/worker.ts`
- Outbox events are expanded into endpoint deliveries
- HMAC SHA-256 signing
- 10 second request timeout
- exponential retry with a 1 hour cap
- 10 attempt limit then `FAILED`
- delivery attempts are persisted
- successful/failed deliveries are visible via API
- manual retry endpoint added

## New API

- `GET /v1/webhook-deliveries`
- `POST /v1/webhook-deliveries/:id/retry`

Existing payment execution now requires an idempotency key:

- `POST /v1/payment-sessions/:id/pay`
- `POST /checkout/public/:token/pay`

## Database

Migration:

`004_payment_core_phase2.sql`

Adds:

- `payment_method_sessions`
- provider columns/indexes
- operational indexes for payment/refund/outbox queries

## Intentionally still sandbox

- Card authorization
- Payment processor connectivity
- Tokenization with a real processor
- 3DS
- Settlement
- Payouts
- Reconciliation
- Risk/Fraud
- Disputes

## Validation

The repository does not contain installed npm dependencies in the execution environment, and the configured package registry returned HTTP 404 for the Fastify package. Therefore a full `npm install && npm build` could not be completed here.

A TypeScript pass was still run with the global compiler. After filtering dependency/ambient-type errors caused by missing installed packages, no additional implementation type errors were reported by the compiler.

## Next phase

Phase 3 should introduce a real processor adapter contract beyond sandbox behavior, provider webhook verification/state transitions, asynchronous payment orchestration, and a proper checkout/payment-method tokenization flow.
