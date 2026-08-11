# P15.3 — PayTabs V4 Adapter (SANDBOX ONLY)

**Date:** 2026-08-10  
**Scope:** DEC-009 partial closure — PayTabs Sandbox via Provider Abstraction  
**Production Ready:** **NO**  
**Live PayTabs:** **BLOCKED**

---

## 1. Architecture

```text
Payment Core
    ↓
Provider Router (resolve + idempotency + timeout)
    ↓
Provider Interface (ProviderAdapter)
    ├── Internal Sandbox Adapter  (unchanged)
    └── PayTabs V4 Adapter        (SANDBOX only)
            ↓
        PayTabs Sandbox API / simulate client
            ↓
        Webhook Engine (signature → dedupe → state apply → ledger)
```

Payment Core **never** imports PayTabs types or calls PayTabs HTTP directly.

---

## 2. Module layout

| Path | Role |
|---|---|
| `apps/api/src/providers/adapter.ts` | Canonical provider contract |
| `apps/api/src/providers/router.ts` | Route resolution, idempotency, metrics |
| `apps/api/src/providers/registry.ts` | Registers `sandbox` + `paytabs` |
| `apps/api/src/providers/paytabs/adapter.ts` | PayTabsAdapter |
| `apps/api/src/providers/paytabs/credentials.ts` | SecretResolver + simulate/http mode |
| `apps/api/src/providers/paytabs/http-client.ts` | HTTP + simulate client |
| `apps/api/src/providers/paytabs/mappers.ts` | Request/response/status/error mapping |
| `apps/api/src/providers/paytabs/webhook.ts` | HMAC-SHA256 callback verification |
| `apps/api/src/providers/webhook-service.ts` | Shared webhook ingress |
| `apps/api/src/providers/webhook-state-apply.ts` | State machine + ledger on success |

---

## 3. Provider contract operations

| Operation | PayTabs mapping | Internal status |
|---|---|---|
| `authorize` | `POST /payment/request` `tran_type=sale` | `REQUIRES_ACTION` (HPP redirect) |
| `capture` | Coalesced with sale | `SUCCEEDED` (no-op) |
| `voidPayment` | Not verified | `NOT_AVAILABLE` |
| `refund` | `POST /payment/request` `tran_type=refund` | `SUCCEEDED` / `FAILED` |
| `getStatus` | `POST /payment/query` | `SUCCEEDED` / `PENDING` / `FAILED` |
| `verifyWebhook` | HMAC callback signature | normalized event |
| `prepareCheckout` | Metadata only | `PENDING` |

Canonical models only cross the adapter boundary. PayTabs JSON stays inside `providers/paytabs/`.

---

## 4. Configuration

| Variable | Purpose |
|---|---|
| `PAYTABS_ADAPTER_MODE` | `simulate` (tests/default) or `http` (real sandbox HTTP) |
| `PAYTABS_SANDBOX_SERVER_KEY` | API key + webhook HMAC (via SecretResolver) |
| `PAYTABS_SANDBOX_PROFILE_ID` | Merchant profile id |
| `PAYTABS_SANDBOX_BASE_URL` | Default `https://secure-egypt.paytabs.com` |
| `PAYTABS_SANDBOX_CALLBACK_URL` | Webhook URL registered at PayTabs |
| `PAYTABS_SANDBOX_RETURN_URL` | Customer return URL after HPP |
| `PAYTABS_TIMEOUT_MS` / `PROVIDER_TIMEOUT_MS` | HTTP timeout (default 12s) |

PostgreSQL stores **metadata only** (`provider_credentials_metadata.secret_ref`). No secret values in DB.

Migration `034_p15_3_paytabs_provider.sql` seeds provider, capabilities, platform sandbox account, and secret refs.

---

## 5. Payment lifecycle (async HPP)

```text
Checkout payment → authorize → REQUIRES_ACTION + redirect_url
    → customer completes on PayTabs hosted page
    → callback webhook (HMAC verified)
    → Webhook Engine correlates tran_ref → payment_attempt
    → PROCESSING → SUCCEEDED + ledger post
```

HTTP 200 on authorize does **not** mean payment succeeded. Ledger posts only on webhook-confirmed `SUCCEEDED`.

---

## 6. Webhooks

- Ingress: `POST /api/v1/webhooks/providers/paytabs`
- Signature: HMAC-SHA256 over sorted `key=value` pairs (evidence: legacy `infrastructure/providers/paytabs.ts`)
- Duplicate detection: `provider_event_id` + nonce store
- Correlation: `provider_reference` → `payment_attempts.provider_reference` (provider-agnostic in webhook-service)
- Invalid transitions blocked (e.g. success → failed downgrade after capture)
- LIVE environment webhooks rejected in adapter (`SANDBOX-only in P15.3`)

---

## 7. Idempotency

| Layer | Mechanism |
|---|---|
| IMKAN | `provider_transactions.request_idempotency_key` via `providerRouter.run` |
| PayTabs | **NOT VERIFIED** — no documented idempotency header; IMKAN protects duplicates |

On timeout/ambiguous: `queryBeforeRetry` surfaced; no blind re-charge.

---

## 8. Retry safety

| Outcome | Classification | Action |
|---|---|---|
| 5xx / network | `RETRYABLE` / `AMBIGUOUS` | Query before retry |
| 4xx / PayTabs `response_status=E` | `NON_RETRYABLE` | Fail |
| Timeout | `TIMEOUT` → `AMBIGUOUS` | Query before retry |
| Simulate `TIMEOUT_KEY` cart | Throws `ProviderError TIMEOUT` | Test evidence |

---

## 9. Refunds

- Full and partial refund via `tran_type=refund` (PayTabs docs + simulate client)
- Refunds service resolves provider from payment transaction (not hardcoded sandbox)
- SANDBOX-only enforcement for paytabs + sandbox providers
- Ledger compensating entry via existing refund path

---

## 10. Environment isolation

| Rule | Enforcement |
|---|---|
| PayTabs LIVE blocked | `supports_live=FALSE`, adapter rejects LIVE webhooks |
| No silent sandbox default | P15.2 config behavior preserved |
| No sandbox→live fallback | Router throws if no route; no silent provider switch |
| Org routes explicit | `provider_routes` per org+currency+environment |

Internal Sandbox adapter remains default platform fallback when no org route is bound.

---

## 11. Observability

Metrics via `incrMetric`:

- `provider_requests_total`
- `provider_failures_total`
- `ambiguous_payments_total`

Labels: `provider`, `operation`, `environment`. Secrets and auth headers never logged.

---

## 12. Tests

| Suite | Tests | Purpose |
|---|---|---|
| `tests/paytabs-provider-contract.test.ts` | 10 | Mapping, signature, simulate client |
| `tests/p15-3-paytabs-integration.test.ts` | 6 | Checkout HPP, webhook, idempotency |
| Regression | 195 total | `npm run test:pg` PASS |

Simulate mode (`PAYTABS_ADAPTER_MODE=simulate`) used in tests — no LIVE credentials required.

---

## 13. Known gaps (honest)

| Gap | Status |
|---|---|
| PayTabs LIVE credentials / activation | **BLOCKED** |
| Void API | **NOT VERIFIED** |
| Tokenization / recurring | **UNSUPPORTED** |
| Disputes / settlement files | **UNKNOWN / not integrated** |
| Real PayTabs sandbox HTTP certification | Requires merchant sandbox keys |
| PCI (DEC-011) | **BLOCKED** — hosted flow alone does not close PCI |
| Frontend REQUIRES_ACTION UI | Backend returns redirect; web checkout UI not updated in P15.3 |

---

## 14. Related docs

- `docs/providers/PROVIDER_CAPABILITY_MATRIX.md`
- `docs/providers/PAYTABS_SANDBOX_CERTIFICATION.md`
- `docs/providers/PROVIDER_CHECKLIST.md`
- `docs/implementation/P15_3_FINAL_AUDIT.md`
