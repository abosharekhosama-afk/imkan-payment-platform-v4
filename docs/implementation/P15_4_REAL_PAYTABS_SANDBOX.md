# P15.4 — Real PayTabs Sandbox Certification

**Date:** 2026-08-10  
**Scope:** Real PayTabs Sandbox HTTP + webhook security hardening  
**Production Ready:** **NO**  
**Verdict:** **PARTIAL / BLOCKED** — merchant sandbox credentials required for full real HTTP certification

---

## 1. Goal

Move from P15.3 simulate certification to **real PayTabs Sandbox API** integration while keeping:

```text
Payment Core -> Provider Router -> Provider Interface -> PayTabs Adapter -> PayTabs Sandbox
```

No direct Payment Core -> PayTabs coupling. No LIVE activation.

---

## 2. Architecture (unchanged from P15.3)

See `P15_3_PAYTABS_ADAPTER.md`. P15.4 adds:

- `paytabs/config.ts` — `PAYTABS_ENV=sandbox` guard, credential validation
- `paytabs/query-recovery.ts` — query-before-retry for unknown outcomes
- Enhanced HTTP client — correlation ID, HTTP status classification, secret redaction
- V4 Checkout `REQUIRES_ACTION` redirect handling

---

## 3. Configuration

| Variable | Required | Purpose |
|---|---|---|
| `PAYTABS_ENV` | Yes | Must be `sandbox`. `live` throws error. |
| `PAYTABS_ADAPTER_MODE` | No | `simulate` (default in tests) or `http` |
| `PAYTABS_REAL_SANDBOX_CERT` | For real HTTP | Must be `true` to opt into real sandbox tests |
| `PAYTABS_SANDBOX_SERVER_KEY` | Real HTTP | Via SecretResolver / env |
| `PAYTABS_SANDBOX_PROFILE_ID` | Real HTTP | Via SecretResolver / env |
| `PAYTABS_SANDBOX_BASE_URL` | No | Default `https://secure-egypt.paytabs.com` |
| `PAYTABS_SANDBOX_CALLBACK_URL` | Real flow | Public HTTPS webhook URL |
| `PAYTABS_SANDBOX_RETURN_URL` | Real flow | Customer return after HPP |

Credentials are **never** stored in PostgreSQL, source code, or logs.

### Enable real sandbox certification

```bash
PAYTABS_ENV=sandbox
PAYTABS_ADAPTER_MODE=http
PAYTABS_REAL_SANDBOX_CERT=true
PAYTABS_SANDBOX_SERVER_KEY=<from PayTabs merchant portal>
PAYTABS_SANDBOX_PROFILE_ID=<from PayTabs merchant portal>
PAYTABS_SANDBOX_CALLBACK_URL=https://<public-host>/api/v1/webhooks/providers/paytabs
PAYTABS_SANDBOX_RETURN_URL=https://<checkout-host>/checkout/return
```

---

## 4. Credential handling

- Resolved via `SecretResolver` (P15.2)
- `assessPayTabsCredentialStatus()` reports missing fields without exposing values
- Simulate placeholders (`SIM_PROFILE`, `SIM_SERVER_KEY`) rejected for real certification
- `assertPayTabsSandboxOnly()` blocks `PAYTABS_ENV=live`

---

## 5. HTTP integration

Enhanced `http-client.ts`:

- `X-Request-Id` correlation header
- Latency tracking in error details (redacted)
- HTTP status mapping: 401/403 -> AUTHENTICATION, 429 -> RATE_LIMITED, 5xx -> RETRYABLE
- Timeout -> TIMEOUT (query before retry)
- No blind retry on payment creation

Unknown outcome flow:

```text
TIMEOUT / AMBIGUOUS -> resolveUnknownPayTabsOutcome() -> payment/query -> decide retry safety
```

---

## 6. Checkout / redirect

V4 `CheckoutPage.tsx` handles `REQUIRES_ACTION`:

- Reads `redirect_url` or `action.url` from Payment Core response
- Redirects browser to PayTabs hosted page
- No PayTabs credentials in frontend

Return URL alone is **not** financial confirmation — webhook required.

---

## 7. Webhook flow

Uses existing Webhook Engine (`webhook-service.ts`):

- HMAC-SHA256 signature verification
- Duplicate detection + nonce replay protection
- Provider reference correlation to `payment_attempts`
- State machine guards + ledger on SUCCEEDED
- `webhook_failures_total` metric on signature reject

**Real inbound webhook from PayTabs servers** requires public HTTPS endpoint — **NOT VERIFIED** in local dev without tunnel.

---

## 8. Idempotency

| Layer | Status |
|---|---|
| IMKAN `provider_transactions` key | SUPPORTED (P15.3 + regression) |
| PayTabs-side idempotency | NOT VERIFIED |
| Query before retry | SUPPORTED (`query-recovery.ts`) |

---

## 9. Refund

Refund adapter path exists (P15.3). **Real sandbox refund** requires completed real payment — **BLOCKED** until real HTTP + webhook certification.

---

## 10. Security

- No secrets in DB, API responses, frontend, or logs
- LIVE webhooks rejected
- Tenant isolation preserved
- P15.2 regression PASS (CSRF, sessions, rate limits)

---

## 11. Testing

| Suite | Tests | Status |
|---|---|---|
| `p15-4-paytabs-config` | 6 | PASS |
| `p15-4-paytabs-webhook-security` | 8 | PASS |
| `p15-4-paytabs-real-sandbox` | 5 run + 2 skipped | BLOCKED (no credentials) |
| Full `npm run test:pg` | 214 pass / 2 skip | PASS |

Real HTTP tests skip unless credentials + `PAYTABS_REAL_SANDBOX_CERT=true`.

---

## 12. Limitations / blockers

| Item | Status |
|---|---|
| Real PayTabs HTTP payment creation | **BLOCKED** — credentials not in environment |
| Real PayTabs inbound webhook | **NOT VERIFIED** — needs public HTTPS |
| 3DS real sandbox | **BLOCKED** — depends on account + HPP completion |
| Real sandbox refund | **BLOCKED** — depends on real payment |
| LIVE PayTabs | **BLOCKED** |
| Production Gate | **NOT PASSED** |

---

## 13. Related docs

- `P15_4_FINAL_AUDIT.md`
- `PAYTABS_SANDBOX_CERTIFICATION.md` (updated with P15.4 section)
- `PROVIDER_CAPABILITY_MATRIX.md`
- `PROVIDER_CHECKLIST.md`
