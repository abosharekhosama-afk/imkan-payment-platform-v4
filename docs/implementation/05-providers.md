# Phase 5 — Provider Architecture (V4)

**Status:** Implemented (Sandbox-through-Router). **Not** production provider activation.

## Flow

```
Payment Core → Provider Router → Provider Adapter → External Provider
```

Payment Core never imports Stripe/PayTabs/Adyen SDKs. It resolves via `providerRouter` and executes operations through the canonical `ProviderAdapter` contract.

## Domain tables (PostgreSQL)

| Table | Purpose |
|---|---|
| `providers` | Platform catalog (`sandbox` seeded; `supports_live=false`) |
| `provider_accounts` | Tenant or platform accounts bound to `SANDBOX`/`LIVE` |
| `provider_credentials_metadata` | Secret **references** only (env/secret manager); never secret values |
| `provider_capabilities` | Capability + `evidence_status` (`VERIFIED`/`PARTIAL`/`UNSUPPORTED`/`UNKNOWN`) |
| `provider_routes` | Org routing rules (currency / method / priority) |
| `provider_transactions` | Provider op audit + idempotency |
| `provider_webhook_events` | Inbound webhook ledger (signature result, status, attempts) |
| `provider_webhook_nonces` | Replay protection |
| `api_keys` | Hashed API keys + scopes + env |
| `rate_limit_events` | Rate-limit hit audit |

## Adapter contract

`apps/api/src/providers/adapter.ts`: authorize, capture, void, refund, getStatus, tokenize, prepareCheckout, verifyWebhook.

## Router

`apps/api/src/providers/router.ts`:

- Environment selection (`SANDBOX` vs `LIVE`)
- Route / default account / platform shared sandbox fallback
- Capability gate (UNKNOWN/UNSUPPORTED blocked)
- Credential environment mismatch rejected
- Timeout wrapper + idempotent `provider_transactions`
- Ambiguous/timeout → **query-before-retry** (no blind re-charge)

## Sandbox adapter

`apps/api/src/providers/sandbox-adapter.ts` — **TEST/SANDBOX ONLY**.

Magic tokens: `FAIL`, `TIMEOUT`, `AMBIGUOUS`.

Webhook HMAC headers: `X-Sandbox-Signature`, `X-Sandbox-Timestamp`, `X-Sandbox-Event-Id`, `X-Sandbox-Nonce`. Secret: `SANDBOX_WEBHOOK_SECRET` (env only).

## Webhooks

`POST /api/v1/webhooks/providers/:providerCode`

Pipeline: verify → nonce replay check → event-id dedupe → normalize → outbox `provider.webhook.received` → `PROCESSED`.

`signature_valid` is set **only** after cryptographic verification success. No bypass.

## API keys & rate limiting

- Create: `POST /api/v1/api-keys` (secret returned once; SHA-256 hash stored)
- Auth: `Authorization: Api-Key pk_test_…` or `X-Api-Key`
- LIVE key creation blocked unless `ALLOW_LIVE_API_KEYS=true`
- In-process rate limits on checkout/payment/webhook/api-key buckets (`foundation/rate-limit.ts`)

## Evidence rule

Do not claim capabilities from vendor docs alone. See `docs/providers/PROVIDER-READINESS-MATRIX.md`.

## Production gate

Sandbox-through-Router ≠ Production Ready. Live activation needs DEC-009, checklist, credentials, sandbox+webhook evidence, security review.
