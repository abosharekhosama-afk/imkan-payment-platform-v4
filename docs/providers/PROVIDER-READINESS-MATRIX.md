# Provider Readiness Matrix

**Date:** 2026-08-11 (Palestine DISCOVERED research)  
**Rule applied:** a capability is marked only from repository evidence (working code + tests). Vendor documentation alone is NOT verification (DEC-009).

**Evidence statuses (V4 `provider_capabilities.evidence_status`):**  
`VERIFIED` | `PARTIAL` | `UNSUPPORTED` | `UNKNOWN`

| Provider | Auth | Sandbox | Live | Webhook verify | Refund | Capture | Void | Tokenization | Status |
|---|---|---|---|---|---|---|---|---|---|
| **Internal Sandbox** (V4 adapter via Router) | n/a | **VERIFIED** (contract + PG integration) | **UNSUPPORTED** (`supports_live=false`; LIVE resolve rejected) | **VERIFIED** (HMAC + replay/dedupe tests) | **UNSUPPORTED** | **VERIFIED** (coalesced) | **PARTIAL** (local only) | **PARTIAL** (opaque ref, no vault) | ⚠️ TEST/SANDBOX ONLY — not production activation |
| PayTabs (legacy MySQL adapter) | PARTIAL (legacy) | PARTIAL (legacy) | UNKNOWN | PARTIAL (legacy; bypass risk on old path) | UNSUPPORTED | UNKNOWN | UNKNOWN | PARTIAL | 🟡 Legacy only — not on V4 Router |
| Generic Remote | PARTIAL | UNKNOWN | UNKNOWN | UNSUPPORTED | PARTIAL | UNKNOWN | UNKNOWN | PARTIAL | 🟡 Legacy shell |
| Stripe / Adyen / Checkout.com / others | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | 🔴 No V4 adapter |
| **Bank of Palestine Gateway** (`bop`) | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | 🔴 DISCOVERED — [palestine/RESEARCH.md](./palestine/RESEARCH.md); no public API |
| **Arab Bank PS** (`arabbank_ps`) | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | 🔴 DISCOVERED — CyberSource via bank; no public acquiring docs |
| **Jawwal Pay** (`jawwalpay`) | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | 🔴 DISCOVERED — contact for online gateway pack |
| **PalPay** (`palpay`) | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | 🔴 DISCOVERED — not Pallapay crypto; no public API |

Palestine outreach kits + next adapter plan: [docs/providers/palestine/](./palestine/).

## V4 Sandbox capability rows (seeded)

| capability_code | evidence_status | notes |
|---|---|---|
| payment.authorize | VERIFIED | Contract + checkout via Router |
| payment.capture | VERIFIED | Sandbox capture coalesced |
| payment.void | PARTIAL | Local void; no remote cancel rail |
| payment.refund | UNSUPPORTED | Deferred to Financial phase |
| payment.status | VERIFIED | Deterministic status probe |
| payment.tokenize | PARTIAL | Opaque token reference only |
| webhook.verify | VERIFIED | HMAC; no `signature_valid=true` bypass |
| webhook.normalize | VERIFIED | Normalized event → outbox |

## Architecture readiness (Phase 5)

Implemented on V4 PostgreSQL `/api/v1`:

- Provider catalog / accounts / credentials metadata / capabilities / routes / transactions
- Canonical `ProviderAdapter` + registry
- Provider Router (env, capability, isolation, idempotency, timeout)
- Inbound webhook ingress (verify → replay → dedupe → normalize → outbox)
- API keys (hashed) + scopes + revocation
- In-process rate limiting + audit hits

## Production gate

Sandbox-through-Router ≠ Production Ready. Live provider activation still requires DEC-009 matrices, checklist, agreements, credentials, sandbox+webhook evidence, and security review.
