# Card Data Flow — IMKAN Payments V4 (P15.0)

**Date:** 2026-08-10  
**Production Ready:** **NOT claimed**  
**PCI formal compliance:** **NOT claimed** — formal scope remains **BLOCKED** by DEC-011  
**Related:** `P12_SECURITY_PCI.md`, `P15_0_SECURITY_AUDIT.md`, `payment-core-service.ts`, Phase 4 checkout routes

---

## 1. Intended flow (high level)

```
Customer
  → Checkout UI (hosted page /checkout/:token)
    → IMKAN API (session + opaque payment_method_token only)
      → Payment Provider (sandbox today; live providers gated)
        → Authorization / capture at provider
```

| Hop | Card data allowed? | Notes |
|---|---|---|
| Customer browser → Provider hosted fields / redirect | Yes (provider scope) | Preferred path |
| Customer → IMKAN API | **No PAN/CVV** | Rejected if present |
| IMKAN → Provider | Token / redirect payload only | Sandbox uses tokenized path; no PAN persistence |
| IMKAN database | **No PAN/CVV columns** | Design constraint |

---

## 2. IMKAN must NOT store PAN/CVV

**Rule:** IMKAN Payments must never accept, log, or persist Primary Account Number (PAN) or CVV/CVC.

| Control | Evidence | Status |
|---|---|---|
| Service rejection | `payment-core-service` throws `CARD_DATA_FORBIDDEN` if `card_number` / `pan` / `cvv` / `cvc` / `card_cvv` present | **PASS** |
| Request schema | Phase 4 checkout pay body marks `card_number` / `pan` / `cvv` as `z.undefined()` | **PASS** |
| Method types | `payment_method_types: ['CARD']` is selection UI only — comment: no PAN; sandbox tokenized path | **PASS** (design) |
| Log redaction | Server redact regex includes `cvv` / `cvc` / `card-number` | **PASS** (defense in depth) |

Checkout payment accepts an **opaque `payment_method_token`** (+ method type code), not raw card fields.

---

## 3. Prefer hosted / tokenized / redirect

| Pattern | Preference | Current state |
|---|---|---|
| Provider-hosted fields | Preferred | Sandbox notes hosted fields not used; tokenized sandbox path only |
| Redirect / 3DS at provider | Preferred for live | Live provider rails gated; not Production Ready |
| Raw PAN POST to IMKAN | **Forbidden** | Explicit reject |
| Merchant server collecting PAN then forwarding to IMKAN | **Forbidden** | Same API reject; expands PCI scope |

**Product rule (from P12):** Prefer provider-hosted fields / redirect / tokenization. Do **not** expand PCI scope without DEC-011.

---

## 4. Explicit non-claims

| Claim | Allowed? |
|---|---|
| “IMKAN is PCI DSS compliant” | **No** |
| “SAQ complete” / AoC | **No** — **BLOCKED BY: DEC-011** |
| “Production Ready card processing” | **No** |
| “No PAN storage by design” (engineering control) | Yes — as a **control statement**, not a compliance certificate |
| Live card acquiring enabled | Only after DEC gates + external PCI assessment |

Penetration test and formal threat-model pack for PCI boundary: see `P12_SECURITY_PCI.md` (**NOT IMPLEMENTED** / **BLOCKED** items).

---

## 5. Residual risks

| Risk | Status | Mitigation / gap |
|---|---|---|
| Client mistakenly posts PAN | Mitigated by Zod + service reject | Keep reject forever |
| Logs / error reports capture card fields | PARTIAL — redaction present; nested keys may still leak (audit) | Expand `redact.ts` keys |
| Future “convenience” API that accepts PAN | Would invalidate architecture | Block without DEC-011 |
| Sandbox ≠ live PCI boundary | Live credentials / processors not production-certified here | External gate |

---

## 6. Summary

Customer → Checkout → IMKAN → Provider is the only supported money path for card-branded methods, and **IMKAN is a non-storage intermediary for PAN/CVV**. Tokenized / hosted / redirect paths are required. This document describes engineering controls only — **it is not a PCI Attestation of Compliance**.
