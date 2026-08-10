# P15.0 — Threat Model

**Product:** IMKAN Payments V4  
**Date:** 2026-08-10  
**Method:** Assets → Threat Actors → Attack Surface → Threats → Controls → Residual Risk  
**Production Ready:** **NOT claimed**  
**Related:** `P15_0_SECURITY_AUDIT.md`, `P15_0_SECURITY_CONTROL_MATRIX.md`, `P15_0_RLS_ASSESSMENT.md`

---

## 1. Assets

| Asset | Confidentiality | Integrity | Availability | Notes |
|---|---|---|---|---|
| Merchant funds movement (PI, capture, refund, payout, settlement) | High | **Critical** | High | Ledger is SoT; immutability triggers added P15.0 |
| Customer PII (email, billing profile) | High | Medium | Medium | Tenant-scoped |
| Bank account / IBAN ciphertext | **Critical** | High | Medium | AES-GCM; env key (no KMS yet) |
| API keys & session tokens | **Critical** | High | Medium | Hash at rest; bearer in localStorage |
| Provider credentials / webhook secrets | **Critical** | High | Medium | Shared sandbox webhook secret today |
| KYB documents / `storage_key` | High | Medium | Low | Object store incomplete |
| Org RBAC membership & custom roles | High | High | Medium | Escalation guarded |
| Audit / security event trail | Medium | High | Medium | Non-repudiation |
| Platform admin capabilities | **Critical** | **Critical** | Medium | Cross-tenant by design |

---

## 2. Threat Actors

| Actor | Capability | Motivation |
|---|---|---|
| **Unauthenticated attacker** | Internet-facing `/api/v1`, checkout, webhooks, auth | Account takeover, fraud, DoS |
| **Compromised merchant user** | Valid session + some RBAC perms | Data theft, payout fraud, key creation |
| **Malicious employee** (merchant insider) | Assigned role within org | Privilege abuse, exfil |
| **Compromised API key** | Scoped machine auth; no step-up | Automated drain / scrape within scopes |
| **Malicious customer** | Public checkout token | Pay abuse, card testing, open-redirect phishing via return URLs |
| **Malicious webhook sender** | Can POST ingress if secret weak/leaked | Forge SUCCEEDED / refund; cross-tenant if org from payload (mitigated P15.0) |
| **Compromised provider** | Upstream processor trust | False captures, data return paths |
| **Platform insider** | `platform.*` permissions | Cross-org access; needs separate UI later |
| **Bot / automated scanner** | High-volume IP diversity | Credential stuffing, inventory scraping |

---

## 3. Attack Surface

| Surface | Examples | Exposure |
|---|---|---|
| Public HTTP API | Auth, checkout, webhook ingress | Internet |
| Authenticated merchant API | Payments, banking, RBAC, keys | Bearer / API key |
| Platform review APIs | KYB/bank review | Privileged sessions |
| Web app (V4) | SPA + localStorage token | XSS → ATO path |
| Legacy `/v1` | Dual stack | Default **off** in production (P15.0) |
| Postgres | App pool only (no merchant SQL) | Insider / misconfig |
| Env / config | Encryption keys, webhook secrets | Ops compromise |
| Outbound URLs | Success/cancel/webhook targets | SSRF / phishing (URL safety FIXED) |
| Workers | Renewals, webhook delivery | System actor |

---

## 4. Threats → Controls → Residual Risk

| ID | Threat | Primary actors | Controls (evidence-oriented) | Residual risk | Status |
|---|---|---|---|---|---|
| T01 | Credential stuffing on login | Unauth, bot | scrypt; lockout; Helmet/CORS | No dedicated auth rate-limit bucket; in-memory RL weak multi-instance | **PARTIAL** |
| T02 | Session theft via XSS | Unauth→user | React escape; CSP in prod helmet | Token in **localStorage** | **PARTIAL** |
| T03 | Step-up token reuse across ops | Compromised user | Purpose binding FIXED P15.0 | Some sensitive ops still DEF (no API) | **PASS**/PARTIAL mix |
| T04 | Cross-tenant IDOR | Compromised user/key | App-layer org filters; lock hardening | No RLS; SQL bug risk | **PARTIAL** (RLS **BLOCKED** deferred) |
| T05 | Privilege escalation to platform | Malicious employee | Custom-role guards; platform perms excluded | No separate Platform Admin UI | **PASS** API; UI **NOT IMPLEMENTED** |
| T06 | API key offline cracking | DB leak + attacker | SHA-256 hash; show-once; revoke | No pepper/HMAC | **PARTIAL** |
| T07 | Checkout card testing / flood | Malicious customer, bot | `checkout.*` buckets; no PAN accept | Single-instance RL only | **PARTIAL** / Redis **BLOCKED** |
| T08 | Forged provider webhook | Malicious webhook | Signature + dedupe; org from PI DB FIXED | **Shared** sandbox signing secret | **PARTIAL** |
| T09 | Cross-tenant money via webhook org spoof | Malicious webhook | Org not taken from payload alone (P15.0) | Depends on PI integrity | **PASS** (fix applied) |
| T10 | Unverified merchant processes payments | Compromised/malicious merchant | Onboarding persist + money API enforce FIXED | Ops bypass paths if any | **PASS** (P15.0) |
| T11 | Settlement without MFA | Compromised user | `requireStepUp` on settlements POST FIXED | Other finance edges | **PASS** (settlements) |
| T12 | Ledger tampering | Platform insider, SQL access | Triggers block UPDATE/DELETE FIXED | App bugs still insert wrong journals | **PASS** (immutability) |
| T13 | Bank data key compromise | Ops / insider | Env AES key; production required | No KMS/rotation automation | **PARTIAL** / KMS **BLOCKED** |
| T14 | SSRF via merchant URLs | Malicious employee/customer | `url-safety.ts` rejects private/localhost | Bypass via DNS rebinding residual Low | **PASS** (P15.0) |
| T15 | PAN entered into IMKAN | Malicious/misbuilt client | Zod + `CARD_DATA_FORBIDDEN` | Formal PCI DEC-011 open | **PASS** eng; PCI **BLOCKED** |
| T16 | Dual-stack `/v1` authz drift | Unauth/user | Prod default disable FIXED | Legacy code still in tree | **PASS** (default) |
| T17 | Redis-less RL bypass | Bot across instances | Abstraction ready | Distributed limit **NOT IMPLEMENTED** | **BLOCKED** |
| T18 | Provider account takeover | Compromised provider / leaked creds | Metadata refs; sandbox shared | Live provider + per-account secrets pending | **PARTIAL** / live **BLOCKED** |
| T19 | Document storage_key disclosure | Compromised user | Opaque key design | May still return in API | **PARTIAL** |
| T20 | Insider platform abuse | Platform insider | RBAC + audit + step-up | Dedicated admin surface missing; monitoring incomplete | **PARTIAL** |

---

## 5. Trust boundaries (summary diagram)

```
[Internet]
    |  TLS (assumed at edge — ops)
    v
[Web SPA] --Bearer localStorage--> [API /api/v1]
    |                                  |
    |                         AuthZ: session/API key org
    |                                  v
    |                            [Postgres]  ← no RLS (deferred)
    |                                  ^
[Checkout public] -------------> Payment Core → [Provider]
[Webhook sender] --HMAC secret--> Webhook ingress
[Worker/system] -----------------> DB (all tenants)
```

---

## 6. Residual risk statement

P15.0 closed several **Critical/High** findings (webhook tenant, onboarding, step-up binding, settlements step-up, ledger triggers, SSRF URLs, legacy prod default). Remaining residual risk is dominated by:

1. **In-memory rate limits** (multi-instance)  
2. **No Postgres RLS** (deferred by design to P15.4)  
3. **localStorage sessions**  
4. **Shared sandbox webhook secret**  
5. **Env-based crypto keys without KMS**  
6. **No formal PCI / live provider production gate**

These prevent any honest **Production Ready** claim for the security program as a whole.
