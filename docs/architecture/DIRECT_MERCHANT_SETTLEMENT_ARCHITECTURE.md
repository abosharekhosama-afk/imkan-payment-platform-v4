# DIRECT MERCHANT SETTLEMENT ARCHITECTURE

**Date:** 2026-08-14  
**Status:** ANALYSIS ONLY — no Payment Core / Ledger / LIVE changes executed  
**Product:** IMKAN Payments V4  
**Verdict (readiness):** **PARTIAL**

---

## 1. Current-state finding (from code, not assumption)

**Answer to “where does money go today?”: C — it differs by provider, but the implemented money rails are platform-pooled.**

| Rail | Where funds land (real money) | Evidence |
|---|---|---|
| Internal Sandbox | No real money | `sandbox` adapter; `supports_live=FALSE` |
| Stripe | **IMKAN platform Stripe account** (Checkout Session / PaymentIntent on platform keys) | `apps/api/src/providers/stripe/credentials.ts` loads global `STRIPE_*_SECRET_KEY`; adapter does **not** set `stripeAccount`, `transfer_data`, or `application_fee_amount` |
| PayTabs | **IMKAN PayTabs profile** (`PAYTABS_*_PROFILE_ID` + `SERVER_KEY`) | `apps/api/src/providers/paytabs/credentials.ts` — single env/SecretResolver profile; `profile_id` sent on every request |
| Bank of Palestine (`bop`) | **Not moving money** | Adapter returns `NOT_AVAILABLE` / `BOP_DOCS_PENDING` |
| Jawwal Pay / PalPay | **Not moving money** | Catalog seed only (`040_direct_payout_and_regional_providers.sql`); **no adapters** |

Org-scoped `provider_accounts` **exist** (`015_phase5_providers.sql`) and Router can prefer an org account, then fall back to **`organization_id IS NULL` shared accounts**. Credential loaders still use **global** env keys, so even an org-row in PostgreSQL does not isolate funds.

**Honest classification of live-capable adapters today:**

```text
Customer → IMKAN Checkout → Payment Intent → Provider Router
  → Stripe/PayTabs Adapter
  → IMKAN platform merchant account at the provider
  → Provider settles to IMKAN (or IMKAN-controlled profile)
  → IMKAN Ledger (pending_settlement / merchant_payable)
  → Settlement draft + dual-control Payout
  → mark-paid = evidence that an OUTSIDE bank transfer happened
```

`mark-paid` is **not** a bank API. See `docs/implementation/P15_1E_PAYOUT.md`.

---

## 2. Current money flow (ownership at each step)

```text
Customer
    ↓  (PAN never hits IMKAN — hosted Checkout / HPP)
IMKAN Checkout (software)
    ↓
Payment Intent + Payment Attempt (org-scoped)
    ↓
Provider Router  (org route → org default → regional shared → sandbox shared)
    ↓
Provider Adapter (Stripe / PayTabs / sandbox / BOP stub)
    ↓
Provider merchant account owned by IMKAN (global keys / profile)
    ↓
Webhook → state apply → Ledger credit merchant_payable
    ↓
Settlement (IMKAN books) → Payout record → operator mark-paid
    ↓
Merchant bank (payout_accounts)  — outside IMKAN
```

| Step | Who owns funds? | Who owns provider relationship? | Fees | Ledger | IMKAN holds cash? |
|---|---|---|---|---|---|
| Checkout | Customer | IMKAN software | n/a | none | No |
| Authorize on Stripe/PayTabs | Provider holds pending/captured on **IMKAN’s** merchant profile | IMKAN platform credentials | Provider fee on IMKAN profile | none until SUCCEEDED | **Yes (at provider)** |
| PAYMENT_SUCCEEDED | IMKAN still owns provider balance | IMKAN | Accrued `platform_fees_minor` + `provider_fees_minor` on PI | DR pending_settlement / CR merchant_payable | **Yes** |
| Settlement FINALIZED | Books only | IMKAN | Fee lines | fee journals | **Yes until payout** |
| Payout mark-paid | Operator claims bank transfer done | IMKAN ops | n/a | DR merchant_payable / CR cash_provider | **Should be No** if transfer real |

**Is IMKAN orchestration-only today?** No. Software orchestration exists, but **cash custody is platform-pooled** on Stripe/PayTabs. Ledger “available” is a **payable**, not proof the merchant bank received funds.

**When is Settled?** IMKAN `settlements.status=FINALIZED` is an internal period close, **not** provider settlement or bank credit.

**Who pays out?** IMKAN operators via dual-control + evidence (`rail_code` default `audited_manual`). Not Stripe Connect payouts, not PayTabs Split Payout API, not BOP.

---

## 3. Target model

```text
Merchant A  →  Provider Account A  →  Merchant Bank A
Merchant B  →  Provider Account B  →  Merchant Bank B
Merchant C  →  Provider Account C  →  Merchant Bank C

Payment A → Provider Account A only
Refund A  → Provider Account A only
Webhook A → identified by provider_account_id (not only provider code)
```

IMKAN remains:

- Checkout / Payment Links / Payment Core / Router / Webhooks / Ledger / KYB / reporting  
- Platform fee collector (Connect application fee, PayTabs split remainder, or invoice)  
- **Not** the default acquiring merchant of record when the provider supports direct settlement

**Allowed exception:** Internal Sandbox + (optional) **Sandbox-only** shared platform accounts. Production MUST NOT auto-use global credentials for every org.

---

## 4. Binding each company to a provider

**Keep table name:** `provider_accounts` (already org-scoped). Do **not** invent a parallel `merchant_provider_accounts` table as SoR.

Extend metadata / columns (target — **no migration in this phase**):

| Field | Purpose |
|---|---|
| `organization_id` | Tenant (NULL = platform shared, SANDBOX only) |
| `provider_id` / `code` | stripe, paytabs, bop, … |
| `environment` | SANDBOX / LIVE |
| `external_provider_account_id` | Stripe acct_… / PayTabs profile_id / BOP MID |
| `settlement_account_reference` | Provider-side settlement dest (opaque) |
| `country_code`, `default_currency` | Routing |
| `onboarding_status` | See §5 |
| `capabilities_json` or child table | charges, refunds, payouts |
| `verified_at`, `disabled_at` | Gates |
| `payout_account_id` | FK to IMKAN `payout_accounts` when local IBAN tracking needed |

Secrets stay in SecretResolver via `provider_credentials_metadata.secret_ref` and/or `merchant_provider_credentials.secret_ref` (**039** already added the latter; loaders do not use it yet — GAP).

**Unique:** `(organization_id, provider_id, environment)` already exists (`NULLS NOT DISTINCT`).

---

## 5. Provider account lifecycle (target)

```text
DISCOVERED
→ APPLICATION_REQUIRED
→ ONBOARDING
→ KYC_KYB_PENDING
→ PROVIDER_ACCOUNT_CREATED
→ PROVIDER_ACCOUNT_VERIFIED
→ SETTLEMENT_CONFIGURED
→ SANDBOX_READY
→ LIVE_READY
→ LIVE_ENABLED
→ SUSPENDED
```

| Question | Target answer |
|---|---|
| Who creates it? | Provider (Stripe Account Links / PayTabs dashboard / bank branch). IMKAN stores IDs + secret refs. |
| IMKAN API create? | Stripe: yes (Connect). PayTabs: usually dashboard + AM. BOP/Jawwal/PalPay: bank/PSP, not IMKAN. |
| Redirect onboarding? | Stripe Account Links: yes. Others: unknown until private docs. |
| Ready for funds? | `onboarding_status=LIVE_ENABLED` AND KYB PASS AND settlement dest verified AND capability READY |
| Disabled? | Router must refuse; webhooks still ingest for refunds/disputes on historical attempts |

---

## 6. Stripe architecture (recommended, not implemented)

**Current:** Platform Checkout on IMKAN `sk_test` / `sk_live`. Connect **not implemented**. Docs already say settlement is Stripe Dashboard, not IMKAN import (`STRIPE_V4_ADAPTER.md`).

**Target for IMKAN (merchant-branded Payment Links, customer pays the merchant):**

**Stripe Connect + Direct Charges on Connected Accounts**, hosted Checkout (already PCI-safe).

Sources:

- [Connect charge types](https://docs.stripe.com/connect/charges)  
- [Direct charges](https://docs.stripe.com/connect/direct-charges.md?platform=web&ui=stripe-hosted)

| Topic | Direct charges (recommended) | Destination charges | Separate charges & transfers |
|---|---|---|---|
| Money owner after capture | Connected account | Platform then transfer | Platform until transfer |
| Merchant of record | Connected account | Platform | Platform |
| IMKAN fee | `application_fee_amount` → platform | fee then transfer | later Transfer |
| Fit for “no IMKAN pool” | **Best** | Worse (platform MoR, platform negative-balance risk) | Worst for this goal |
| Refunds/disputes | On connected account | Platform-managed | Platform-managed |

**Express vs Standard vs Custom:**

- **Express:** IMKAN drives onboarding via Account Links; merchant gets Stripe Express dashboard; good default for new merchants.  
- **Standard:** Merchant already has Stripe; OAuth/connect existing account.  
- **Custom:** Highest IMKAN KYC burden — not needed for V4 MVP.

**Funds flow (target):**

```text
Customer → IMKAN Checkout Session
  → created with Stripe-Account: acct_XXX
  → application_fee_amount = platform fee
  → Stripe fee + app fee
  → net to Connected Account balance
  → Stripe payouts to merchant bank (Stripe’s payout schedule)
```

IMKAN does **not** payout SAR/ILS from its own bank for this rail. IMKAN **tracks** `PAYMENT_SUCCEEDED` vs Stripe payout status if imported later.

**Refunds:** Must use the same connected account (`Stripe-Account` header) from `payment_attempts.provider_account_id` / stored `acct_`.

**GAPs:** Connect onboarding, Account Links, per-account webhook identity (`account` field on events), adapter charge flags, secret isolation per connected account (platform secret + connected account id, not merchant secret for Direct Charges).

**Do not implement Connect in this phase.**

---

## 7. PayTabs architecture

**Current:** One `profile_id` + `server_key` for the whole platform (sandbox; LIVE gated by `PAYTABS_ALLOW_LIVE`).

**Official capabilities (docs.paytabs.com):**

- A merchant account can have **multiple profiles** (test/live). Source: [Profile menu](https://support.paytabs.com/en/support/solutions/articles/60000714922-profile-menu-via-merchant-dashboard).  
- **Split Payout** exists but is **PSP merchants only** and must be **enabled by Account Manager**. Source: [Split Payout prerequisites](https://docs.paytabs.com/manuals/PT-API-Endpoints/Deposit-and-Payouts/Split-Payouts/Step-1-Understanding-Workflow-and-Prerequisites/Split-Payouts-Prerequisites).  
- Split workflow: collect on PayTabs then distribute to beneficiaries. Source: [Split Payout workflow](https://docs.paytabs.com/manuals/PT-API-Endpoints/Deposit-and-Payouts/Split-Payouts/Step-1-Understanding-Workflow-and-Prerequisites/Split-Payouts-Workflow).

**Two commercial patterns:**

| Pattern | Money path | When to use |
|---|---|---|
| **A. Per-merchant Profile** | Customer → Merchant Profile → PayTabs settlement to **that profile’s** bank (must be confirmed per contract) | Preferred if PayTabs issues a profile (or full merchant) per IMKAN org |
| **B. Platform PSP + Split Payout** | Customer → IMKAN/PSP profile → split to beneficiaries | Only if IMKAN is contracted as PSP; **not** true “merchant owns acquiring account” |

**EXTERNAL REQUIREMENT:** Written confirmation from PayTabs AM:

1. Can each IMKAN merchant have a dedicated profile whose settlement IBAN is the merchant’s?  
2. Or must IMKAN be PSP + Split Payout?  
3. Does PayTabs accept **Palestine** merchants on which regional host? (Code maps `PS` → `secure-jordan.paytabs.com` — **not verified commercially**.)

Palestine LIVE via PayTabs remains **blocked** without bank/local acquiring contract (existing product rule).

---

## 8–9. Palestine / Bank of Palestine

**Official BOP product page** ([bankofpalestine.com payment gateway](https://bankofpalestine.com/en/business/electronic-services/payment-gateway) / [bop.ps](https://www.bop.ps/en/business/electronic-services/payment-gateway)):

- Current account at BOP required  
- Merchant agreement signed at a branch + T&Cs  
- Approval ~3–5 working days when docs complete  
- **Settlement: merchant’s BOP current account, next working day**  
- Fee stated **2.5%** (confirm in contract)  
- 3DS Visa/Mastercard; plugins + Custom  
- **No public developer API**

**Is “Merchant → BOP Gateway → Merchant bank” possible?**  
**Yes, commercially, as a per-merchant bank product** — that **is** direct settlement.  
**Not possible in IMKAN software today:** adapter is DISCOVERED stub; **PRIVATE API / PARTNER ACCESS REQUIRED**.

**Each company needs its own:** current account, merchant agreement, MID/gateway credentials (issued after contract), callback/webhook pack, 3DS config, settlement reports.

IMKAN as a **single BOP MID for all merchants** would recreate the pooled model and likely violate the bank’s merchant-of-record rules unless BOP explicitly offers a facilitator program (**questionnaire unanswered** — `PLATFORM_MODEL_QUESTIONNAIRE.md`).

**Jawwal Pay:** Online merchant gateway exists ([jawwalpay.ps](https://www.jawwalpay.ps/products/online-merchant-gateway.html)); **contact to provision**. **OFFICIAL PUBLIC API DOCUMENTATION NOT FOUND.**

**PalPay:** Merchant / e-commerce / SoftPOS ([palpay.ps](https://www.palpay.ps/index.php/en/merchants)); often coordinated with BOP. **OFFICIAL PUBLIC API DOCUMENTATION NOT FOUND.** Do not confuse with Pallapay crypto.

---

## 10. Model comparison

| | A Direct merchant settlement | B Split payout | C Platform collect + manual payout |
|---|---|---|---|
| Funds owner | Merchant’s provider/bank | Platform/PSP then split | IMKAN until ops transfer |
| Risk | Merchant + provider | Platform residual | **Highest IMKAN** (safeguarding, AML) |
| KYC | Per merchant at provider/bank | Platform + beneficiaries | IMKAN KYB + bank KYB |
| PCI | Hosted/HPP (keep) | Hosted/HPP | Hosted/HPP |
| Recon | PI ↔ provider txn ↔ merchant bank | + split legs | + IMKAN bank statements |
| Refunds | Same merchant account | From pool / rules | From IMKAN pool |
| Engineering | Per-account routing + secrets | Split API | **Current IMKAN** |
| Scalability | High if onboarding APIs exist | Medium | Ops-bound |
| **Use** | Stripe Direct Charges; BOP per-MID; PayTabs per-profile if confirmed | PayTabs PSP if AM enables | Sandbox; interim LIVE only with legal approval |

---

## 11. Target data model (design only)

Existing: `organizations`, `providers`, `provider_accounts`, `provider_credentials_metadata`, `merchant_provider_credentials`, `provider_capabilities`, `provider_routes`, `provider_transactions`, `payout_accounts`, `settlements`, `payouts`.

**Add later (not now):**

- `provider_account_capabilities` (per-account, not only per-provider catalog)  
- `provider_onboarding_sessions` (Account Links, return URLs, expires)  
- `provider_account_events` (audit of status changes)  
- `external_provider_account_id` + `onboarding_status` on `provider_accounts`

**Security:** RLS/org filter; unique org+provider+env; never store raw keys; RBAC `providers.manage` + platform dual-control for LIVE bind.

---

## 12. Routing algorithm (target)

1. Organization  
2. Environment (SANDBOX/LIVE) — LIVE refused without gates  
3. Currency  
4. Payment method  
5. Country / regional preference (`preferredProviderCodes`)  
6. **Org `provider_accounts` row** (never LIVE shared NULL org)  
7. Account `onboarding_status` ∈ {SANDBOX_READY, LIVE_ENABLED}  
8. Capability evidence VERIFIED|PARTIAL for required op  
9. KYB PASS for LIVE  
10. Settlement dest verified  
11. Resolve adapter + **that account’s secret_ref**  
12. Persist `provider_account_id` on attempt + provider_transactions  

**Forbidden in Production:** silent fallback to `organization_id IS NULL` shared LIVE account.  
**Allowed:** SANDBOX fallback to internal `sandbox` shared account (already in Router).

---

## 13. Configuration

```text
organization_id + provider + environment
  + provider_accounts.id
  + external_provider_account_id (acct_ / profile_id / MID)
  + secret_ref → SecretResolver
```

Global `STRIPE_SECRET_KEY` / `PAYTABS_SANDBOX_PROFILE_ID` = **platform account only**.  
Sandbox may use them for shared testing. Production routing must bind org-specific refs.

---

## 14. KYB / activation gate (LIVE)

LIVE charge allowed only if **all** true:

1. Merchant KYB PASS  
2. Provider account VERIFIED / LIVE_ENABLED  
3. Settlement / bank account VERIFIED (Stripe: Connect payouts bank; BOP: current account; PayTabs: profile bank)  
4. Capability READY for `payment.authorize`  
5. Environment LIVE flags (`STRIPE_ALLOW_LIVE`, `PAYTABS_ALLOW_LIVE`, DEC-009)  
6. Palestine: local contract — **not** assumed via GCC PayTabs  

---

## 15. Refunds

`payment_attempts.provider_account_id` + `provider_transactions.provider_account_id` are SoR.  
Refund adapter call MUST load **that** account’s credentials / Stripe-Account.  
Cross-account refund = security incident.

---

## 16. Webhooks

Today: `POST /api/v1/webhooks/providers/:code` then correlate `provider_reference` → attempt. Secret is largely **global** (`resolveMerchantWebhookSecret(providerCode, environment)`).

Target: identify **provider_account_id** via:

- Stripe: event `account` (connected account id)  
- PayTabs: `profile_id` in payload  
- BOP: TBD from private docs  

Then verify with **that** account’s webhook secret (or platform secret + account id).  
Never assume `provider=stripe` implies one account.

---

## 17. Ledger implications

Keep books **even when cash never hits IMKAN**:

| Event | Meaning | Ledger |
|---|---|---|
| PAYMENT_SUCCEEDED | Provider authorized/captured on **merchant** account | Optional: memo / fee-only journals |
| SETTLED | Provider settled to merchant (or Stripe available) | Distinct from SUCCEEDED |
| PAYOUT_INITIATED / COMPLETED | Only if IMKAN or provider payout API used | Current payout journals **only if IMKAN still moves cash** |

**Do not treat Ledger credit as bank receipt.**

Direct settlement: platform fee may be the **only** IMKAN cash (Connect application fee / invoice). Merchant net **must not** sit in `merchant_payable` as if IMKAN owed a bank transfer — that is the core ledger GAP.

---

## 18. Reconciliation identifiers

| Layer | ID |
|---|---|
| IMKAN | `payment_intent_id`, `payment_attempt_id`, `organization_id` |
| Provider | `provider_transaction_id`, `provider_reference`, `provider_account_id` |
| Settlement | provider settlement batch id (when API/file exists) |
| Bank | `bank_reference`, `payout_accounts` fingerprint (masked) |

---

## 19. Payout after direct settlement

| Rail | IMKAN Payout engine |
|---|---|
| Stripe Direct Charges | **Tracking / recon**, not money movement |
| PayTabs per-profile | Tracking if PayTabs pays the merchant bank |
| PayTabs Split | May call Split/External Payout APIs |
| BOP | Bank settles T+1 — IMKAN tracking |
| Current platform pool | Keep dual-control `audited_manual` |

---

## 20. Security

- Tenant isolation on `provider_accounts` (Router already checks org mismatch)  
- Secret isolation per account (GAP: loaders ignore org)  
- Webhook verify per account  
- Replay/dedupe already in webhook engine  
- RBAC + step-up for binding LIVE accounts  
- Merchant A cannot use account/credential/bank of B  

---

## 21. Can IMKAN become “money goes to each company’s bank without IMKAN pool”?

**Yes, per provider, if and only if:**

| Provider | How (architecture) | IMKAN pool avoided? |
|---|---|---|
| Stripe | Connect Direct Charges + Connected Account payouts to merchant bank | **Yes** (IMKAN only receives application fees) |
| PayTabs | Dedicated merchant profile settling to merchant IBAN **or** AM-enabled split to merchant beneficiary | **Yes if AM confirms**; else **No** |
| BOP | Each merchant’s own gateway MID; bank credits merchant current account T+1 | **Yes commercially**; software **No** until private API |
| Jawwal Pay / PalPay | Per-merchant wallet/gateway if contract says so | **NOT_VERIFIED** — no public API |

**Cannot** claim this for Production today: adapters charge the **platform** Stripe/PayTabs account; Palestine adapters do not charge.

---

## 22. Recommended target architecture (summary)

1. **SoR:** org `provider_accounts` + SecretResolver refs + `external_provider_account_id`.  
2. **Stripe:** Connect Direct Charges (Express + Standard).  
3. **PayTabs GCC:** per-org profile if possible; else PSP split (EXTERNAL).  
4. **Palestine:** per-merchant BOP MID as primary ILS rail; Jawwal/PalPay wallets as secondary after private docs.  
5. **Sandbox:** shared internal sandbox OK.  
6. **LIVE shared platform MID:** forbidden as default.  
7. **Ledger:** split “IMKAN owes merchant” vs “provider already paid merchant”.  
8. **Payout module:** remains for pooled/manual rails and evidence; not the happy path for Connect/BOP.

No Payment Core / Ledger / LIVE activation was changed for this document.
