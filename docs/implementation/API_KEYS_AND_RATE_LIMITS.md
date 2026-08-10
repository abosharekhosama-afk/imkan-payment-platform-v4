# V4 API Keys & Rate Limits (Phase 5)

## API keys

- Stored as SHA-256 `key_hash`; plaintext secret returned **once** at creation
- Prefixes: `pk_test_` (SANDBOX), `pk_live_` (LIVE)
- LIVE creation blocked unless `ALLOW_LIVE_API_KEYS=true`
- Auth: `Authorization: Api-Key <secret>` or `X-Api-Key: <secret>`
- Scopes map to route permissions (`payments.read`, `providers.read`, …)
- Revocation sets `status=REVOKED` + audit/security events

## Rate limits

In-process fixed windows (`apps/api/src/foundation/rate-limit.ts`), audited to `rate_limit_events`.

Sensitive buckets include `checkout.payment`, `api_keys.manage`, `webhooks.ingress`.
