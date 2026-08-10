# Phase 4 — Payment Core

**Status:** COMPLETE (not Production Ready)  
**Verified:** 2026-08-09 on PostgreSQL 16.14  
**API base:** `/api/v1`

## Domain chain (required)

```
Organization
  -> Merchant Profile
  -> Payment Link
  -> Payment Session
  -> Payment Attempt
  -> Payment Transaction
  -> Provider (sandbox adapter in Phase 4)
```

Also modeled: `payment_orders` (commercial reference) and `payment_intents` (primary state machine).

## Tables (migration 013)

| Table | Role |
|---|---|
| `merchant_payment_config` | Branding + checkout defaults (1:1 org) |
| `payment_links` | Merchant payment links |
| `payment_orders` | Order/reference grouping |
| `payment_intents` | Payment state machine + DEC-001 amounts |
| `payment_intent_transitions` | Append-only history |
| `payment_sessions` | Public checkout sessions |
| `payment_attempts` | Provider tries (no card data) |
| `payment_transactions` | Recorded SUCCEEDED/FAILED outcomes |

Money: `amount_minor NUMERIC(30,0)` + `currency_code CHAR(3)` FK → `master_currencies(code)`.

## Services

| File | Responsibility |
|---|---|
| `apps/api/src/payments/payment-state-machine.ts` | Allowed transitions + versioned updates |
| `apps/api/src/payments/payment-core-service.ts` | Checkout session/payment + merchant payment reads/cancel |
| `apps/api/src/payments/payment-links-service.ts` | Link lifecycle |
| `apps/api/src/payments/payment-config-service.ts` | Branding/config |
| `apps/api/src/payments/provider-interfaces.ts` | PaymentProvider / CheckoutProvider / Webhook interfaces + sandbox |
| `apps/api/src/payments/rate-limit-prep.ts` | Hook points only (not enforced) |

## Provider abstraction

Interfaces only + internal `sandbox` adapter. No external provider APIs or credentials invented. Real integrations belong to the provider phase. Sandbox magic: payment method token containing `FAIL` forces failure; otherwise success.

## Events (outbox)

`payment.created`, `payment.processing`, `payment.succeeded`, `payment.failed`, `payment.cancelled`, `payment.expired`, plus `payment_link.created`. Payloads include organization, amounts, currency, link/order/session/attempt ids for future Books/webhook consumers. Worker stubs mark them PROCESSED (no external delivery).

## Security

Tenant-scoped merchant APIs; public checkout is token-scoped (no customer account). RBAC permissions `payments.*`, `payment_links.*`, `payment_config.*`. Idempotency on create/cancel/checkout mutations. No PAN/CVV accepted or stored. Sensitive keys redacted in error reports. Audit + security events on success/fail/cancel.

## Not in Phase 4

Ledger postings, refunds execution, settlements/payouts, real providers, production rate limiting, hosted card fields UI, customer first-class entity (DEC-006 still OPEN — checkout stores customer name/email/phone on order/intent only).
