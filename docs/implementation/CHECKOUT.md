# Public Checkout (Phase 4)

## Properties

- Public payment URL — no customer account / login required
- Merchant branding from `merchant_payment_config`
- Amount + currency from link (FIXED) or customer input (CUSTOMER_ENTERED)
- Customer name/email/phone collected on session create
- Payment method **selection** only (`CARD` listed); confirmation accepts opaque `payment_method_token` only
- Secure payment session (unique token, TTL 60 minutes, org-scoped rows)
- Success / failure / cancel outcomes with optional return URLs

## Flow

1. `GET /api/v1/checkout/:token` — link summary + branding + allowed method types
2. `POST /api/v1/checkout/:token/session` — creates Order + Intent (`CREATED`→`REQUIRES_PAYMENT`) + Session (`OPEN`)
3. `GET /api/v1/checkout/:token/session?session_token=` — session/intent status (expires if TTL passed)
4. `POST /api/v1/checkout/:token/payment` — creates Attempt, Intent→`PROCESSING`, sandbox confirm → `SUCCEEDED`/`FAILED` + Transaction

## Branding fields used

`company_display_name`, `logo_url`, brand colors, description, support contacts, `checkout_theme_json`, default success/cancel URLs.

## Explicit non-goals (Phase 4)

- No PAN/CVV capture in this API
- No real 3DS / hosted fields provider
- No production UI page (API contracts only; legacy web console still on `/v1`)
