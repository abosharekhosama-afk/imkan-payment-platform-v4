# GCC / Palestine Configuration

The platform now exposes regional policy presets through `/v1/regional-supported` and tenant-specific policies through `/v1/regional-policies`.

| Market | Currency default | Tax preset | E-invoicing preset |
|---|---|---:|---|
| Saudi Arabia (SA) | SAR | 15% | ZATCA |
| UAE (AE) | AED | 5% | UAE_VAT |
| Bahrain (BH) | BHD | 10% | BAHRAIN_VAT |
| Kuwait (KW) | KWD | 0% | NONE |
| Qatar (QA) | QAR | 0% | NONE |
| Oman (OM) | OMR | 5% | OMAN_VAT |
| Palestine (PS) | ILS | 16% product default | PALESTINE_TAX |

These are configuration defaults only. Rates, invoice mandates, e-invoicing schemas, payment-method availability, licensing and settlement rails must be confirmed for the merchant's exact jurisdiction and effective date before production.
