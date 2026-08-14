# DIRECT MERCHANT SETTLEMENT — GAP ANALYSIS

**Date:** 2026-08-14  
**Scope:** Analysis only. No migrations, Payment Core, Ledger, LIVE, or adapter changes.

---

## Existing

- Payment Core: Payment Intent, Attempt, Checkout, Payment Links, idempotency, outbox.
- Provider Router with org-scoped `provider_accounts`, explicit account id, regional preference (ILS → bop/jawwalpay/palpay; GCC → paytabs; USD/EUR/GBP → stripe), SANDBOX fallback to Internal Sandbox.
- Unique constraint `(organization_id, provider_id, environment)` on `provider_accounts` (`NULLS NOT DISTINCT`).
- SecretResolver + `provider_credentials_metadata.secret_ref` + `merchant_provider_credentials` (refs only; no raw keys in PG).
- Stripe adapter: hosted Checkout / PaymentIntent on **platform** keys. PCI: no PAN on IMKAN.
- PayTabs adapter: HPP on **platform** `profile_id` + `server_key`. LIVE gated.
- Webhook engine: provider-code URL, signature verify, replay/dedupe, state apply → ledger on SUCCEEDED.
- Ledger: SUCCEEDED → `pending_settlement` / `merchant_payable`. Settlement + dual-control payout + `mark-paid` (`audited_manual`).
- KYB + `payout_accounts` (IBAN/bank evidence for IMKAN payouts).
- Catalog: BOP / Jawwal Pay / PalPay DISCOVERED; BOP adapter stub `NOT_AVAILABLE`.
- Capability matrix and Palestine research questionnaires (unanswered commercially).

---

## Missing

- Charge creation bound to **merchant-owned** provider account (Stripe Connect `Stripe-Account`, PayTabs per-org `profile_id`, BOP MID).
- `external_provider_account_id` as first-class routing identity (acct_ / profile / MID).
- Lifecycle: DISCOVERED → LIVE_ENABLED → SUSPENDED (today: ACTIVE/DISABLED/PENDING).
- `provider_onboarding_sessions`, `provider_account_capabilities` (per account), `provider_account_events`.
- Webhook identity by `provider_account_id` (Stripe `account` field, PayTabs `profile_id`).
- Per-account webhook secrets.
- Ledger distinction: PAYMENT_SUCCEEDED vs SETTLED vs PAYOUT_* when cash never hits IMKAN.
- Merchant UI: Connect / profile / MID onboarding.
- Platform UI: approve LIVE bind; forbid global LIVE credentials for all tenants.
- Stripe Connect: Account Links, Direct Charges, `application_fee_amount`, connected-account refunds/disputes.
- PayTabs: AM confirmation of per-merchant settlement vs PSP Split Payout.
- BOP / Jawwal / PalPay: public APIs, adapters, sandbox, webhooks.

---

## Needs modification (document only — do not implement now)

| Area | Change |
|---|---|
| Stripe/PayTabs credential loaders | Resolve `secret_ref` + external account id from org `provider_accounts`; do not always use global env |
| Router | Forbid LIVE fallback to `organization_id IS NULL` shared accounts |
| Adapters | Pass connected account / profile / MID on every charge, refund, query |
| Webhooks | Map payload identity → `provider_account_id` before verify/apply |
| Refunds | Always use attempt’s `provider_account_id` |
| Ledger | Platform fee vs merchant net vs IMKAN payable (pooled rail only) |
| Payout | Dual path: money-movement (pooled) vs tracking (direct settlement) |
| Config | Global LIVE keys = platform account only, never default tenant rail |

---

## External dependency

| Party | Need |
|---|---|
| Stripe | Connect platform enabled; Express/Standard policy; fee model; webhook endpoint for connected accounts |
| PayTabs AM | Per-merchant profile settlement IBAN **or** PSP + Split Payout enablement; Palestine host/contract |
| Bank of Palestine | Per-merchant current account, merchant agreement, MID, **private** gateway API/HPP docs, sandbox, callbacks, 3DS, settlement files |
| Jawwal Pay | Partner API pack, merchant gateway contract, sandbox, webhooks |
| PalPay | Partner API pack, merchant contract, settlement destination (often BOP account) |
| Legal | Facilitator vs MoR; safeguarding if any pooled LIVE remains; Palestine licensing |

---

## Legal / compliance

- **Pooled LIVE Stripe/PayTabs** makes IMKAN merchant of record / funds holder — higher AML/safeguarding burden.
- **Direct Charges / per-MID** shifts MoR to the merchant + provider/bank; IMKAN is orchestration + fee.
- Each Palestinian merchant typically needs **its own** bank/PSP contract — IMKAN cannot “share” one MID without a documented facilitator program.
- PCI: keep hosted Checkout / HPP (already true).
- Do not store provider secrets in PostgreSQL (already policy).
- LIVE / P15.6 remains blocked independently of this analysis.

---

## Verdict

Foundation (org accounts, secrets refs, KYB, sandbox isolation) exists. **Money rails do not implement Direct Merchant Settlement.** Status: **PARTIAL**.
