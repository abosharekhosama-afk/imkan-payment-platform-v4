# Production closure — payments (Stripe Elements + one-time links)

**Goal:** Ship so production only needs live keys + env + webhook endpoint.

## Fixed in this release (local / sandbox)

| Issue | Fix |
|---|---|
| Return page always “حالة الدفع غير معروفة” | Reads Stripe `redirect_status` + `status=success\|cancel`; syncs via `POST /api/v1/checkout/stripe/sync` |
| DB / link not updated after Elements pay | Webhook + sync finalize session, order, transaction, and `recordSuccessfulUse` |
| Payment links reusable by default | Default `one_time=true`, `max_uses=1`; UI creates one-time links |
| Success/cancel URLs missing status | Defaults include `?status=success` / `?status=cancel`; session prefers link URLs |

## Books / API payment links (ready now)

`POST /api/v1/merchant/payment-links` (auth: merchant session or API key with `payment_links.manage`):

```json
{
  "title": "Invoice INV-1001",
  "amount_mode": "FIXED",
  "amount_minor": "15000",
  "currency_code": "SAR",
  "one_time": true,
  "max_uses": 1,
  "reusable": false,
  "external_invoice_ref": "books:INV-1001",
  "success_url": "https://books.example/invoices/1001/paid",
  "cancel_url": "https://books.example/invoices/1001",
  "activate": true
}
```

Response includes `public_token` → checkout URL: `{APP_PUBLIC_URL}/checkout/{public_token}`.

After successful Stripe payment (webhook or return sync), link status becomes `EXPIRED` and cannot be reused.

Set `"one_time": false` + `"max_uses": null` only if you intentionally want multi-use collection links.

## Deploy checklist (keys-only)

1. `npm run db:migrate:pg`
2. `npm run seed:stripe-routes` (or merchant Providers → Stripe)
3. `npm run seed:platform-owner` (once)
4. Env (production):

```bash
NODE_ENV=production
APP_ENV=production
REDIS_URL=redis://...
RATE_LIMIT_STORE=redis
PAYMENT_PROVIDER=stripe
REQUIRE_KYB_FOR_PAYMENTS=true
REQUIRE_EMAIL_VERIFICATION=true
EMAIL_TRANSPORT=smtp
# SMTP_* + EMAIL_FROM
APP_PUBLIC_URL=https://app.example
CORS_ORIGIN=https://app.example
TRUST_PROXY=true
STRIPE_ADAPTER_MODE=http
STRIPE_ENV=live
STRIPE_ALLOW_LIVE=true
STRIPE_AUTO_ROUTE=false
STRIPE_CHECKOUT_UI=elements
STRIPE_LIVE_SECRET_KEY=sk_live_...
STRIPE_LIVE_PUBLISHABLE_KEY=pk_live_...
STRIPE_LIVE_WEBHOOK_SECRET=whsec_...
STRIPE_SUCCESS_URL=https://app.example/checkout/return?status=success
STRIPE_CANCEL_URL=https://app.example/checkout/return?status=cancel
```

5. Stripe Dashboard → Webhooks → `https://api.example/api/v1/webhooks/providers/stripe`  
   Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
6. Build web: `VITE_API_URL=https://api.example VITE_SESSION_TRANSPORT=cookie npm run build -w apps/web`
7. Verify: `/health/ready`, small live charge, payment → SUCCEEDED, link → EXPIRED

## Still outside “keys only”

| Item | Notes |
|---|---|
| PCI SAQ | Payment Element reduces scope; formal SAQ still required |
| Stripe Connect | Not implemented — single platform Stripe account |
| Bank payout rail | Use Stripe Dashboard payouts; IMKAN bank accounts are future |
| KMS | `SECRET_BACKEND=env` today |
| API build TS debt | Pre-existing tsc errors in unrelated modules (S3 SDK, PayTabs tests, etc.) |

See also: [STRIPE_PRODUCTION_DEPLOY.md](./STRIPE_PRODUCTION_DEPLOY.md), [PRODUCTION_GATE.md](./PRODUCTION_GATE.md)
