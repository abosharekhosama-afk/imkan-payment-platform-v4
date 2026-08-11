# Palestine Payment Providers — Research (DISCOVERED)

**Date:** 2026-08-11  
**Status:** Research complete — **no public API docs sufficient for integration**  
**Production Gate impact:** None (does not unlock LIVE / does not PASS gate)  
**Related:** [OUTREACH.md](./OUTREACH.md), [PLATFORM_MODEL_QUESTIONNAIRE.md](./PLATFORM_MODEL_QUESTIONNAIRE.md), [NEXT_ADAPTER_PLAN.md](./NEXT_ADAPTER_PLAN.md)

## Executive summary

| Provider | E-payment product? | Public API published? | Onboarding difficulty | Ready to code now? |
|---|---|---|---|---|
| **Bank of Palestine (BOP Gateway)** | Yes — Online Payment Gateway | No (private after contract; WooCommerce etc. plugins) | Medium | No |
| **Arab Bank (Palestine)** | Yes — Payment Gateway via CyberSource/Visa | No for acquiring (commercial contact; Open Banking is separate) | Medium–High | No |
| **Jawwal Pay** | Yes — online merchant gateway + wallet | No (contact to provision gateway) | Medium | No |
| **PalPay (Mahfazati)** | Yes — E-commerce + wallet + SoftPOS | No (private; often paired with BOP) | Medium | No |
| **Regional gateways (e.g. PayTabs)** | Yes regionally | Partial (PayTabs V4 adapter exists as SANDBOX only) | Depends on PS merchant acceptance | Partial (sandbox only, not LIVE) |

**Hard rule:** Do not build “real” adapters without merchant agreement + bank/wallet account + private API/sandbox docs. Any code without that is DISCOVERED scaffolding only — not money movement.

---

## 1) Bank of Palestine — Online Payment Gateway

| Field | Finding |
|---|---|
| Product URL | https://www.bop.ps/en/business/electronic-services/payment-gateway |
| Capabilities (marketing) | Local + international Visa/Mastercard, 3DS, real-time reports, multi-currency |
| Integration surface | Plugins: WooCommerce, Magento, OpenCart, PrestaShop + **Custom** |
| Stated fees | ~2.5% (confirm at contract) |
| Settlement | To merchant BOP current account — next business day (per product page) |
| Onboarding | Open current account; sign agreement at branch; accept T&Cs; ~3–5 business days after complete docs |
| Public developer portal | **None found** |
| Likely technical model | Hosted redirect / HPP (third-party plugins reference HPS PowerCARD-style flows) |
| Complexity | Medium — bank KYB + branch process; product is clear |

**Outreach package:** [OUTREACH.md § BOP](./OUTREACH.md#1-bank-of-palestine-bop)

---

## 2) Arab Bank (Palestine) — Payment Gateway

| Field | Finding |
|---|---|
| Product URL | https://www.arabbank.ps/mainmenu/home/smes-banking/digitalization-and-innovation/payment-gateway |
| Capabilities (marketing) | Online card acceptance via **CyberSource (Visa)**; payment links or platform integration |
| How to subscribe | Arabi Next app or call **02-2953333** — no self-serve API signup |
| Public acquiring API docs | **None found** for Palestine merchant gateway |
| Open Banking note | developer.arabbank.com / Open Banking (AIS/PIS) is **not** the merchant acquiring gateway — do not use as substitute |
| Complexity | Medium–High — bank contract + CyberSource credentials issued through bank |

**Outreach package:** [OUTREACH.md § Arab Bank](./OUTREACH.md#2-arab-bank-palestine)

---

## 3) Jawwal Pay

| Field | Finding |
|---|---|
| Online gateway | https://www.jawwalpay.ps/products/online-merchant-gateway.html |
| Merchant join | https://www.jawwalpay.ps/en/business/become-merchant |
| Capabilities | ILS e-wallet; pay-to-merchant (QR / name); online store gateway (provisioned on contact) |
| Contact | info@jawwalpay.ps (also WhatsApp +970 594 285555 per app store listing) |
| Public API docs | **None found** |
| Constraints | Wallet transactions in ILS; PMA limits apply |
| Complexity | Medium — wallet regulation + private tech pack |

**Outreach package:** [OUTREACH.md § Jawwal Pay](./OUTREACH.md#3-jawwal-pay)

---

## 4) PalPay / Mahfazati

| Field | Finding |
|---|---|
| Merchants | https://www.palpay.ps/index.php/en/merchants |
| Capabilities | E-commerce, SoftPOS, merchant wallet, POS, accounting/PINPAD integration |
| Relation to BOP | SoftPOS / BOP electronic services often require BOP current account + PalPay coordination |
| Contact | info@palpay.ps |
| Public API docs | **None found** (not Stripe-like) |
| Name collision | **Pallapay** (pallapay.com — crypto) is a **different** company — ignore for Palestine fiat rails |
| Complexity | Medium — leading local PSP; tech access closed until contract |

**Outreach package:** [OUTREACH.md § PalPay](./OUTREACH.md#4-palpay)

---

## 5) Regional gateways (PayTabs et al.)

| Field | Finding |
|---|---|
| In this repo | PayTabs V4 adapter — **SANDBOX only**; LIVE blocked (DEC-009); `supports_live=FALSE` |
| Palestine note | Internal docs: PS needs a separately contracted local/regional acquiring route — do **not** assume PayTabs LIVE covers PS merchants |
| Complexity | Technically easier if they accept your merchants; commercially requires explicit PS coverage |

---

## Difficulty of the full path (platform view)

```text
Choose provider → Merchant KYB + contract → Bank/wallet account
  → Private API docs + sandbox → V4 ProviderAdapter
  → Sandbox + webhook certification → DEC-009 LIVE evidence
  → Production Gate (PCI, payout rail, ops) — broader than one provider
```

| Stage | Difficulty | Note |
|---|---|---|
| Open account / sign contract | Medium | Branch process; BOP cites ~3–5 days if docs complete |
| Obtain API docs | Hard without contract | All private |
| Build IMKAN V4 adapter | Medium after docs | Mirror PayTabs pattern under `apps/api/src/providers/` |
| Webhooks + 3DS + refunds | Medium–High | Depends on what provider exposes |
| Production Gate PASS | High | PCI, live payout, ops — not solved by one adapter |

---

## Recommended priority (commercial → technical)

1. **Bank of Palestine Gateway** — clearest e-commerce product, Custom option, published requirements  
2. **Arab Bank / CyberSource** — strong stack if merchant credentials are issued  
3. **PalPay + Jawwal Pay** — local ILS wallet coverage; APIs unpublished  
4. **PayTabs** — only after explicit confirmation of Palestine merchant acceptance  

---

## Explicit non-goals of this research package

- No LIVE payment enablement  
- No Production Gate PASS claim  
- No production adapters without private docs  

When the first provider returns docs (even a PDF), follow [NEXT_ADAPTER_PLAN.md](./NEXT_ADAPTER_PLAN.md).
