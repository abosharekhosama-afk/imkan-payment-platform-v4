# Provider Activation Checklist

**Purpose:** the mandatory checklist that must be completed and evidenced **per provider, per environment** before the provider can be activated (spec `00` §13–§14, `07`; DEC-009). Copy this checklist into `docs/providers/<provider>/CHECKLIST.md` for each integration and fill it in with evidence links. A capability without verified evidence is documented as UNSUPPORTED or UNKNOWN — never assumed.

## 1. Access & authentication
- [ ] API authentication mechanism documented (API key / OAuth / HMAC / certificate)
- [ ] OAuth flow or key provisioning procedure documented
- [ ] Sandbox credentials obtained and stored outside the repository/database (env/secret manager); only metadata in `provider_credentials_metadata`
- [ ] Live credentials obtained, stored separately from sandbox, never present in sandbox config
- [ ] Credential rotation procedure documented

## 2. Webhooks
- [ ] Webhook URL(s) registered per environment (sandbox URL ≠ live URL)
- [ ] Webhook secret per environment, stored in secret manager
- [ ] Signature verification implemented and covered by tests (valid, invalid, replayed)
- [ ] Replay protection (event id dedupe + timestamp window)
- [ ] Event mapping table: provider event → internal `webhook_events` normalized type

## 3. Core capabilities (verify each; mark SUPPORTED / PARTIAL / UNSUPPORTED / UNKNOWN)
- [ ] Idempotency (provider-side idempotency keys honored)
- [ ] Refund API (full)
- [ ] Partial refund API
- [ ] Recurring payments / mandates
- [ ] Tokenization (hosted fields / vault; PAN never touches our API)
- [ ] 3DS / SCA flow
- [ ] Payout API
- [ ] Dispute API (retrieval + evidence submission)
- [ ] Settlement API / settlement file ingestion

## 4. Behavior mapping
- [ ] Capability mapping recorded in `provider_capabilities` (DB), matching the verified matrix
- [ ] Error mapping: provider error codes → internal error taxonomy (with retryable/non-retryable classification)
- [ ] Retry strategy: which operations are safe to retry, backoff policy, max attempts
- [ ] Timeout strategy per operation (auth/capture/refund/payout) and ambiguous-outcome handling (query-before-retry; no double charge)
- [ ] Amount/currency handling verified (minor units vs decimal strings; zero-decimal currencies)
- [ ] Provider transaction mapping: provider ids persisted in `provider_transactions` and correlated to attempts/payments/refunds/payouts

## 5. Security verification
- [ ] No PAN/CVV path into our API (hosted/tokenized only)
- [ ] Credentials never logged; redaction rules cover provider fields
- [ ] TLS verified; no insecure endpoints
- [ ] Webhook forgery test executed and passing

## 6. Evidence gates
- [ ] Sandbox test evidence: successful payment, failed payment, refund, (3DS if claimed), webhook round-trip — with dates and test ids
- [ ] Production readiness evidence: live credentials verified with minimal-value transaction per provider policy, monitoring/alerting wired, rollback/disable switch tested
- [ ] Capability matrix approved and recorded under DEC-009 for this provider
- [ ] Health check integrated (provider status endpoint or synthetic probe)

## Current status (2026-08-09)

No provider has completed this checklist. See `PROVIDER-READINESS-MATRIX.md` — PayTabs has partial legacy-era code (hosted page request; unwired callback); all other named providers (Stripe, Adyen, Checkout.com, Nuvei, Worldpay, MyFatoorah, Paymob, HyperPay, Moyasar, Tap, Amazon Payment Services) have no code.
