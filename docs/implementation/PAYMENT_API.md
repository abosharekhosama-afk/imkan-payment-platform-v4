# Payment API Contracts (Phase 4, `/api/v1`)

Envelope: `{data, meta:{request_id}}` / `{error:{code,message,request_id}}`. Merchant routes require Bearer session + org context. Public checkout routes are unauthenticated and token-scoped.

## Merchant — payment config / branding

| Method | Path | AuthZ | Notes |
|---|---|---|---|
| GET | `/merchant/payment-config` | `payment_config.read` | Auto-creates defaults |
| PUT | `/merchant/payment-config` | `payment_config.manage` | Branding + theme + default return URLs |

## Merchant — payment links

| Method | Path | AuthZ | Notes |
|---|---|---|---|
| GET | `/merchant/payment-links` | `payment_links.read` | `?status=` |
| POST | `/merchant/payment-links` | `payment_links.manage` + Idempotency-Key | Create |
| GET | `/merchant/payment-links/:linkId` | `payment_links.read` | |
| PATCH | `/merchant/payment-links/:linkId` | `payment_links.manage` | Update |
| POST | `/merchant/payment-links/:linkId/activate` | `payment_links.manage` | |
| POST | `/merchant/payment-links/:linkId/deactivate` | `payment_links.manage` | |
| POST | `/merchant/payment-links/:linkId/cancel` | `payment_links.manage` | |
| POST | `/merchant/payment-links/:linkId/expire` | `payment_links.manage` | |
| POST | `/merchant/payment-links/:linkId/reuse` | `payment_links.manage` | |

Create body (selected): `title`, `amount_mode` (`FIXED`\|`CUSTOMER_ENTERED`), `amount_minor`, `currency_code`, `reference`, `expires_at`, `max_uses`, `one_time`, `reusable`, `metadata`, `activate`.

## Merchant — payments

| Method | Path | AuthZ | Notes |
|---|---|---|---|
| GET | `/merchant/payments` | `payments.read` | Intent list |
| GET | `/merchant/payments/:paymentId` | `payments.read` | Intent + order + sessions + attempts + transactions + history |
| POST | `/merchant/payments/:paymentId/cancel` | `payments.manage` + Idempotency-Key | From CREATED/REQUIRES_PAYMENT |

## Public checkout

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/checkout/:token` | public | Link + branding |
| POST | `/checkout/:token/session` | public + Idempotency-Key | Start session |
| GET | `/checkout/:token/session?session_token=` | public | Session status |
| POST | `/checkout/:token/payment` | public + Idempotency-Key | Confirm (sandbox) |

Payment body: `session_token`, optional `payment_method_type_code`, optional `payment_method_token`. Fields `card_number` / `pan` / `cvv` / `cvc` are rejected (400 `CARD_DATA_FORBIDDEN` / validation).
