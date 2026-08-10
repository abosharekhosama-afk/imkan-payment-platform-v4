# Phase 3 — Processor-ready Checkout and Tokenization

## Goal
Move payment processing from a single sandbox function to a provider contract that supports tokenized payment methods, authorization, capture and refunds without exposing card data to the core API.

## Implemented
- `PaymentProvider.createPaymentMethod()`
- `PaymentProvider.authorize()` accepts an opaque provider token
- `PaymentProvider.capture()`
- `PaymentProvider.refund()`
- `payment_method_sessions/:id/confirm`
- Provider token encryption with AES-256-GCM
- Payment attempt authorization/capture state
- `REQUIRES_ACTION` / 3DS-shaped provider result
- Hosted checkout accepts an opaque payment-method token
- Sandbox scenarios: success, `FAIL`, `3DS`

## Production boundary
The sandbox adapter is still the only configured provider. A real processor cannot be safely selected until its exact API/SDK and country/payment-method requirements are chosen. The next integration should implement the same interface in a dedicated adapter and use the processor's hosted fields/tokenization so PAN/CVV never enter this API.

## New endpoints
- `POST /v1/payment-method-sessions/:id/confirm`
- `POST /v1/payment-sessions/:id/pay` accepts `payment_method_token`
- `POST /checkout/public/:token/pay` accepts `payment_method_token`

## Security
`provider_token_encrypted` is encrypted at rest. `provider_token` remains in the schema for backward compatibility with old seed data and should be removed after a one-time migration/backfill. `PAYMENT_TOKEN_ENCRYPTION_KEY` must be replaced with a real 32+ byte secret in production.
