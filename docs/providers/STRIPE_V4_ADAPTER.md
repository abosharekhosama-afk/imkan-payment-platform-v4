# Stripe V4 Provider — Test + Live

**Date:** 2026-08-11  
**Adapter:** `apps/api/src/providers/stripe/`  
**Webhook:** `POST /api/v1/webhooks/providers/stripe`  
**Production Gate:** Still **NOT PASSED** overall — Stripe enables a real provider rail when credentials + ops are complete; it does not alone close PCI/payout/backup gates.

---

## What was added

| Piece | Detail |
|---|---|
| Checkout | Stripe **Checkout Session** (hosted) — PAN never hits IMKAN |
| Test plane | `sk_test_…` + `whsec_…` (or `STRIPE_TEST_*`) |
| Live plane | `sk_live_…` + live webhook secret — requires `STRIPE_ALLOW_LIVE=true` |
| Simulate mode | `STRIPE_ADAPTER_MODE=simulate` for CI without Stripe account |
| DB | Migration `035_stripe_provider.sql` — `supports_sandbox=TRUE`, `supports_live=TRUE` |

---

## Environment variables

```bash
# Mode: simulate | http
STRIPE_ADAPTER_MODE=http
# Plane: test (default) | live  — also follows APP_ENV=production → live
STRIPE_ENV=test

# --- Test / sandbox (Stripe Dashboard → Developers → API keys → Test mode) ---
STRIPE_TEST_SECRET_KEY=sk_test_...
STRIPE_TEST_PUBLISHABLE_KEY=pk_test_...
STRIPE_TEST_WEBHOOK_SECRET=whsec_...
# Aliases also accepted:
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_...

# --- Live (separate keys; never reuse test keys) ---
STRIPE_ALLOW_LIVE=false
STRIPE_LIVE_SECRET_KEY=sk_live_...
STRIPE_LIVE_PUBLISHABLE_KEY=pk_live_...
STRIPE_LIVE_WEBHOOK_SECRET=whsec_...

# Return URLs (Checkout success/cancel)
STRIPE_SUCCESS_URL=https://your-app.example/checkout/return
STRIPE_CANCEL_URL=https://your-app.example/checkout/return?status=cancelled

# 3DS / Radar policy on card intents (automatic | any | challenge)
STRIPE_REQUEST_3DS=automatic
```

### Enable live money (explicit)

```bash
STRIPE_ENV=live
# or APP_ENV=production
STRIPE_ALLOW_LIVE=true
STRIPE_ADAPTER_MODE=http
STRIPE_LIVE_SECRET_KEY=sk_live_...
STRIPE_LIVE_WEBHOOK_SECRET=whsec_...
```

Webhook endpoint (test and live should use separate Stripe webhook endpoints pointing at the same path; secrets differ):

```text
https://<public-api>/api/v1/webhooks/providers/stripe
```

Events to enable: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `radar.early_fraud_warning.created`, `payout.paid`, `payout.failed`.

Register from the CLI (writes signing secret only on create):

```bash
STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_URL=https://<public-api>/api/v1/webhooks/providers/stripe npm run stripe:register-webhooks
```

Dispute and Radar events create IMKAN `disputes` / `risk_signals` rows. `payout.*` is recorded as an outbox notice only (IMKAN payouts remain dual-control; this is not Stripe Connect).

Card PaymentIntents and Checkout Sessions request 3DS via `payment_method_options[card][request_three_d_secure]` (`STRIPE_REQUEST_3DS=automatic|any|challenge`, default `automatic`). Radar runs on the Stripe account; IMKAN stores early-fraud webhooks.

Platform commission is tested from **Finance → Fee schedules** (SANDBOX `fee_schedules`). That is IMKAN’s fee, not Stripe `application_fee_amount` / Connect.

---

## Safety rules

1. `sk_live_` refused on test/sandbox plane.  
2. Live plane refused without `STRIPE_ALLOW_LIVE=true`.  
3. Live events rejected when `environment=SANDBOX` (and vice versa).  
4. Secrets via env / SecretResolver — not PostgreSQL.  
5. Hosted Checkout only — no card fields on IMKAN.

---

## Ops checklist

### Test mode
- [ ] Create Stripe account  
- [ ] Copy test secret + publishable keys  
- [ ] Create webhook endpoint for test mode → copy signing secret  
- [ ] Set `STRIPE_ADAPTER_MODE=http`, `STRIPE_ENV=test`  
- [ ] Route org to provider `stripe` / SANDBOX account  
- [ ] Complete a Checkout payment with test card `4242…`  
- [ ] Confirm webhook → payment SUCCEEDED  

### Live mode
- [ ] Activate Stripe live account (business verification)  
- [ ] Live keys + live webhook secret  
- [ ] `STRIPE_ALLOW_LIVE=true`  
- [ ] Minimal live charge  
- [ ] Monitoring / refund runbook  
- [ ] Still complete platform Production Gate (Redis, PCI scope, backups, etc.)

---

## Tests

```bash
npx vitest run --config vitest.config.ts tests/stripe-provider-contract.test.ts
```

Simulate authorize / refund / webhook HMAC covered without network.

---

## Limits (honest)

- Not a full Billing/Subscriptions Stripe integration.  
- Disputes: webhook types create/update IMKAN dispute rows; evidence upload API not implemented.  
- Radar early-fraud warnings become risk signals.  
- Settlement/payout: Stripe `payout.*` notices are stored; money movement still uses IMKAN Financial Core / Dashboard — not Connect.  
- Enabling Stripe does **not** auto-PASS `docs/ops/PRODUCTION_GATE.md`.
