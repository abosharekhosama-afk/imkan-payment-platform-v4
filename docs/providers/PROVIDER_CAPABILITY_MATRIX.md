# Provider Capability Matrix

**Last updated:** 2026-08-10 (P15.5)  
**Rule:** Capabilities are **SUPPORTED** only with verified evidence. Otherwise: `NOT VERIFIED`, `NOT SUPPORTED`, `BLOCKED`, or `UNKNOWN`.

Evidence sources: PayTabs Technical Portal, legacy `apps/api/src/infrastructure/providers/paytabs.ts`, P15.3 adapter + tests.

---

## PayTabs

| Capability | PayTabs Sandbox | PayTabs Live | Evidence | Status | Notes |
|---|---|---|---|---|---|
| Provider | PayTabs HPP | Same product | Migration 034 + adapter | SANDBOX ONLY | `supports_live=FALSE` |
| Environment | SANDBOX | LIVE | Adapter + migration | SANDBOX ONLY | LIVE blocked DEC-009 |
| Authentication | Server key header | Same | Legacy + PayTabs docs | SUPPORTED | Via SecretResolver |
| Payment creation | `POST /payment/request` sale | Same API | P15.3 simulate PASS; P15.5 real HTTP BLOCKED | PARTIAL | Simulate SUPPORTED; real HTTP NOT VERIFIED |
| Payment status/query | `POST /payment/query` | Same | P15.3 simulate; P15.5 real BLOCKED | PARTIAL | Real query NOT VERIFIED |
| Refund | `tran_type=refund` | Documented | P15.3 simulate PASS; real BLOCKED | PARTIAL | Real refund NOT VERIFIED |
| Partial refund | Documented by PayTabs | Same | P15.3 simulate | PARTIAL | Real partial NOT VERIFIED |
| Webhooks | Callback POST | Separate URL | P15.3 simulate; real inbound BLOCKED | PARTIAL | Real PayTabs delivery NOT VERIFIED |
| Webhook signature verification | HMAC-SHA256 | Same | Contract tests PASS; PayTabs-issued NOT VERIFIED | PARTIAL | Real callback signature NOT VERIFIED |
| Idempotency (PayTabs-side) | — | — | Not in PayTabs docs | NOT VERIFIED | No native idempotency documented |
| Idempotency (IMKAN-side) | provider_transactions key | Same | P15.3 simulate PASS | SUPPORTED | Real sandbox NOT VERIFIED |
| 3DS / SCA | Hosted redirect | Same | P15.3 simulate REQUIRES_ACTION | PARTIAL | Real 3DS NOT VERIFIED |
| Tokenization | Hosted only | — | No direct API in adapter | NOT SUPPORTED | PAN never in IMKAN API |
| Recurring | — | — | Not verified | NOT SUPPORTED | |
| Disputes | — | — | Not integrated | UNKNOWN | |
| Settlement information | — | — | No file import | UNKNOWN | Internal settlement separate |
| Payout | — | — | Not in scope | NOT SUPPORTED | |
| Supported currencies | Multi (region profiles) | Multi | PayTabs docs (not exhaustive list verified) | PARTIAL | SAR tested |
| Supported countries | MENA focus | Global regions | PayTabs marketing docs | NOT VERIFIED | No exhaustive matrix |
| Known limitations | HPP async; void unverified | LIVE blocked | P15.3 scope | DOCUMENTED | |
| Error model | response_status A/D/E/P/H | Same | Legacy + mappers | PARTIAL | Mapped to canonical |
| Retry behavior | No idempotency key documented | — | Adapter classification | PARTIAL | Query-before-retry |
| Documentation/evidence | Technical Portal + legacy code | — | P15.3–P15.5 tests + preflight | PARTIAL | Real E2E BLOCKED on credentials |
| Preflight gating | P15.5 preflight module | — | p15-5-preflight tests | SUPPORTED | No secrets in output |
| Certification status | SANDBOX_TESTED | — | P15.5 audit | SANDBOX_TESTED | CERTIFIED = BLOCKED (real E2E incomplete) |

---

## Internal Sandbox (regression baseline)

| Capability | Sandbox | Evidence | Status |
|---|---|---|---|
| Payment authorize | Magic tokens | phase5 tests | SUPPORTED |
| Webhooks | x-sandbox-* headers | phase5 tests | SUPPORTED |
| Refunds | Full + partial | refund-conformance | SUPPORTED |
| LIVE | Rejected | adapter | BLOCKED |

---

## Future providers (placeholder)

Add rows for Stripe, Adyen, Checkout.com, etc. when integration starts. Do not mark SUPPORTED without evidence.

| Provider | Status |
|---|---|
| Stripe | DISCOVERED |
| Adyen | DISCOVERED |
| Checkout.com | DISCOVERED |
| MyFatoorah | DISCOVERED |
| Paymob | DISCOVERED |
| HyperPay | DISCOVERED |
| Moyasar | DISCOVERED |
| Tap | DISCOVERED |
| Amazon Payment Services | DISCOVERED |
| Worldpay | DISCOVERED |
| Nuvei | DISCOVERED |
| Bank of Palestine Gateway (`bop`) | DISCOVERED — [palestine/RESEARCH.md](./palestine/RESEARCH.md) |
| Arab Bank Palestine (`arabbank_ps`) | DISCOVERED — CyberSource via bank |
| Jawwal Pay (`jawwalpay`) | DISCOVERED |
| PalPay Palestine (`palpay`) | DISCOVERED — not Pallapay crypto |

Palestine package: [docs/providers/palestine/](./palestine/).
