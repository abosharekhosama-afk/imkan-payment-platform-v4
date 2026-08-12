# Stripe — Production Deploy Checklist

**Goal:** At deploy time, add **API keys + env vars** only. Routing and checkout UI are already in the codebase.

---

## 1. One-time platform setup

```bash
npm run db:migrate:pg
npm run seed:stripe-routes    # all organizations → platform Stripe account
npm run stripe:preflight      # verify keys + webhook config
```

Or per-merchant in the dashboard: **Providers → Accounts & Routes → Configure payment provider → Stripe → Apply**.

---

## 2. Required environment (production)

```bash
NODE_ENV=production
APP_ENV=production

# Infrastructure (required by config.ts)
REDIS_URL=redis://...
RATE_LIMIT_STORE=redis
PAYMENT_PROVIDER=stripe
CORS_ORIGIN=https://your-app.example
TRUST_PROXY=true
APP_PUBLIC_URL=https://your-app.example

# Email (verification / invites)
EMAIL_TRANSPORT=smtp
SMTP_HOST=...
SMTP_USER=...
SMTP_PASS=...
EMAIL_FROM=noreply@your-app.example

# Stripe Live
STRIPE_ADAPTER_MODE=http
STRIPE_ENV=live
STRIPE_ALLOW_LIVE=true
STRIPE_AUTO_ROUTE=false
STRIPE_CHECKOUT_UI=elements
STRIPE_LIVE_SECRET_KEY=sk_live_...
STRIPE_LIVE_PUBLISHABLE_KEY=pk_live_...
STRIPE_LIVE_WEBHOOK_SECRET=whsec_...
STRIPE_SUCCESS_URL=https://your-app.example/checkout/return
STRIPE_CANCEL_URL=https://your-app.example/checkout/return?status=cancelled

# Security secrets (non-dev values)
WEBHOOK_SIGNING_SECRET=...
SANDBOX_WEBHOOK_SECRET=...
PAYMENT_TOKEN_ENCRYPTION_KEY=...
```

---

## 3. Stripe Dashboard

1. **Live mode** → Developers → API keys → copy `sk_live_` + `pk_live_`
2. **Webhooks** → Add endpoint:
   ```text
   https://api.your-app.example/api/v1/webhooks/providers/stripe
   ```
3. Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
4. Copy **Signing secret** → `STRIPE_LIVE_WEBHOOK_SECRET`

---

## 4. Frontend build

```bash
VITE_API_URL=https://api.your-app.example npm run build -w apps/web
VITE_SESSION_TRANSPORT=cookie
```

---

## 5. Verify

- [ ] `GET /health/ready` → 200 (Postgres + Redis)
- [ ] `npm run stripe:preflight` → `liveReady=true`
- [ ] Merchant: Providers → route shows **stripe / LIVE**
- [ ] Create payment link → checkout shows **Stripe** badge + card fields
- [ ] Test live charge (small amount) → webhook → payment **SUCCEEDED**

---

## 6. Still outside “keys only”

| Item | Notes |
|---|---|
| PCI assessment | DEC-011 — Payment Element reduces scope; formal SAQ still required |
| KYB | `REQUIRE_KYB_FOR_PAYMENTS=true` in production |
| Stripe Connect | Not implemented — single platform Stripe account for all merchants |
| Settlement / bank payout | Use Stripe Dashboard; IMKAN payout rail is sandbox-only |
| KMS secrets | `SECRET_BACKEND=env` today; wire AWS/GCP KMS for prod hardening |

See also: [PRODUCTION_GATE.md](./PRODUCTION_GATE.md), [PRODUCTION_CONFIGURATION.md](./PRODUCTION_CONFIGURATION.md)
