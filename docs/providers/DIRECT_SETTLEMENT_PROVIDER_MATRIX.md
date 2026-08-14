# DIRECT SETTLEMENT PROVIDER MATRIX

**Date:** 2026-08-14  
**Rule:** `SUPPORTED` only if proven in IMKAN **and** official provider capability. Otherwise PARTIAL / NOT_SUPPORTED / NOT_VERIFIED / EXTERNAL_REQUIREMENT.

Sources:

- Stripe Connect charges: https://docs.stripe.com/connect/charges
- Direct charges: https://docs.stripe.com/connect/direct-charges.md?platform=web&ui=stripe-hosted
- PayTabs profiles: https://support.paytabs.com/en/support/solutions/articles/60000714922-profile-menu-via-merchant-dashboard
- PayTabs Split Payout (PSP + AM enablement): https://docs.paytabs.com/manuals/PT-API-Endpoints/Deposit-and-Payouts/Split-Payouts/Step-1-Understanding-Workflow-and-Prerequisites/Split-Payouts-Prerequisites
- Bank of Palestine gateway: https://www.bop.ps/en/business/electronic-services/payment-gateway
- Jawwal Pay merchant gateway: https://www.jawwalpay.ps/products/online-merchant-gateway.html
- PalPay merchants: https://www.palpay.ps/index.php/en/merchants

| Provider | Country | Merchant Account | Direct Settlement | Split Payout | API | Sandbox | Webhook | Refund | KYC/KYB | Requirements | Status |
|----------|---------|------------------|-------------------|--------------|-----|---------|----------|--------|---------|--------------|--------|
| Stripe | Global (IMKAN uses platform keys today) | PARTIAL — platform account only; Connect not in code | NOT_SUPPORTED in IMKAN; SUPPORTED at Stripe via Connect Direct Charges | N/A (use application fee on Direct Charges) | SUPPORTED (Checkout/PI) | SUPPORTED | SUPPORTED (platform secret; not per connected account) | SUPPORTED on platform account | EXTERNAL_REQUIREMENT (Connect KYC) | Enable Connect; Account Links; `acct_` on attempts | PARTIAL |
| PayTabs | GCC hosts in adapter; PS mapped to Jordan host (NOT_VERIFIED commercially) | PARTIAL — one IMKAN profile | NOT_VERIFIED per merchant profile bank; EXTERNAL_REQUIREMENT | EXTERNAL_REQUIREMENT (PSP merchants + AM) | SUPPORTED (HPP SANDBOX) | SUPPORTED (cert blocked on creds) | SUPPORTED (platform) | SUPPORTED (adapter) | EXTERNAL_REQUIREMENT | AM: profile-per-org vs PSP split; no global LIVE profile for all tenants | PARTIAL |
| Bank of Palestine | PS | EXTERNAL_REQUIREMENT — per-merchant current account + agreement | SUPPORTED commercially on product page (T+1 to merchant BOP account); NOT_SUPPORTED in IMKAN | NOT_VERIFIED | NOT_VERIFIED — OFFICIAL PUBLIC API DOCUMENTATION NOT FOUND; PRIVATE API / PARTNER ACCESS REQUIRED | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED | EXTERNAL_REQUIREMENT (bank KYC) | MID, private HPP/API, sandbox, callbacks, 3DS, contract | DISCOVERED / NOT_SUPPORTED in software |
| Jawwal Pay | PS | EXTERNAL_REQUIREMENT | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED — OFFICIAL PUBLIC API DOCUMENTATION NOT FOUND | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED | EXTERNAL_REQUIREMENT | Partner pack, MID, settlement rules | DISCOVERED |
| PalPay | PS | EXTERNAL_REQUIREMENT | NOT_VERIFIED (often BOP current account commercially) | NOT_VERIFIED | NOT_VERIFIED — OFFICIAL PUBLIC API DOCUMENTATION NOT FOUND | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED | EXTERNAL_REQUIREMENT | Partner pack; do not confuse with Pallapay crypto | DISCOVERED |
| Internal Sandbox | n/a | N/A (test ledger only) | N/A — no real money | N/A | SUPPORTED | SUPPORTED | Simulated | Simulated | N/A | SANDBOX only; never LIVE | SUPPORTED (test) |

## IMKAN implementation vs provider product

| Provider | IMKAN money destination today |
|---|---|
| Stripe | IMKAN platform Stripe account |
| PayTabs | IMKAN platform PayTabs profile |
| BOP / Jawwal / PalPay | No charges |
| Internal Sandbox | No real money |

Shared `provider_accounts.organization_id IS NULL` is a **catalog/fallback** row, not proof of merchant-owned settlement.
