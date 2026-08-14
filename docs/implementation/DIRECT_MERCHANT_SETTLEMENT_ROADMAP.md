# DIRECT MERCHANT SETTLEMENT — IMPLEMENTATION ROADMAP

**Date:** 2026-08-14  
**Status:** PLAN ONLY. Do **not** start these phases in this task. Do **not** start P15.6 / LIVE / money movement.

Prerequisite: legal review of facilitator vs orchestration; DEC-018 open items below.

---

### Phase A — Merchant Provider Account Model

- Treat `provider_accounts` as SoR for org ↔ provider binding.
- Add (later) `external_provider_account_id`, `onboarding_status`, settlement reference, verified/disabled timestamps.
- Unique org+provider+env already exists; enforce LIVE rows never NULL org.
- Admin + merchant APIs to list/bind accounts **without** storing secrets in PG.

### Phase B — Provider Onboarding

- `provider_onboarding_sessions` (Stripe Account Links; others: external URL / manual ticket).
- Gate: KYB PASS before LIVE_READY.
- Events/audit for status transitions.

### Phase C — Provider-specific Merchant Credentials

- Loaders: `secret_ref` from org account metadata / `merchant_provider_credentials`.
- Stripe Direct Charges: **platform** secret + `Stripe-Account` header (merchant does not get sk_live).
- PayTabs: per-org `profile_id` + `server_key` refs.
- BOP: per-org MID + private credentials refs when docs exist.
- Ban Production auto-use of global Stripe/PayTabs keys for tenant charges.

### Phase D — Direct Settlement Routing

- Algorithm: org → country → currency → method → availability → **org provider account** → capability → KYB → settlement readiness → environment.
- Remove LIVE shared-account fallback.
- Persist `provider_account_id` on every attempt/transaction.

### Phase E — Stripe Connect

- Direct Charges + hosted Checkout.
- `application_fee_amount` = IMKAN platform fee.
- Refunds/disputes on connected account from attempt.
- Webhooks: `account` → `provider_account_id`.
- **Do not start until Phases A–D model is approved.**

### Phase F — PayTabs Merchant Profiles / Split Settlement

- Confirm with AM: per-profile bank settlement vs PSP Split Payout.
- Implement only the confirmed pattern.
- Palestine via PayTabs remains blocked without local acquiring contract.

### Phase G — Palestinian Provider Integration

- BOP first: private API/HPP after partner pack; per-merchant MID.
- Jawwal Pay / PalPay: adapters **only** after official/partner docs (no fake adapters).
- IMKAN payout becomes tracking for bank T+1 settlement.

### Phase H — Reconciliation

- Match PI ↔ provider txn ↔ provider settlement ↔ merchant bank reference.
- Import settlement files when providers supply them.
- Ledger: do not credit `merchant_payable` as IMKAN cash debt on direct rails.

### Phase I — Production Certification

- Per-provider sandbox then LIVE cert.
- Production Gate + DEC-009 still apply.
- Dual-control for LIVE credential bind.

---

## Explicit non-goals for now

- No migrations in this analysis.
- No Ledger / Payment Core / adapter code.
- No LIVE credentials.
- No P15.6.
