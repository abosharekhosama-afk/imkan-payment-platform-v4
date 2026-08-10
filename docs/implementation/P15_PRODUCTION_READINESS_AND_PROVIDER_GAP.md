# P15 — Production Readiness & Provider Gap Analysis

**Date:** 2026-08-10  
**Scope:** Read-only assessment after P15.1-A → P15.1-E (all PASS in sandbox financial core)  
**Verdict:** **NOT Production Ready** — PostgreSQL test success ≠ live money movement  
**Action:** **No code changes in this document.** **P15.1-F NOT started.**

---

## Executive summary

IMKAN Payments V4 has a **credible sandbox financial core** (model, ledger, balances, settlement, internal payout lifecycle) and a **well-architected provider abstraction** tested only with the **internal Sandbox adapter**. The platform can run end-to-end in development:

```text
Payment Link → Checkout → Sandbox Provider → Webhook → Ledger → Settlement (finalize) → Payout (mark-paid)
```

That path is **not** production money movement. `POST /payouts/:id/mark-paid` is an **internal sandbox state transition + ledger post**, not a bank rail. Only `sandbox` is registered in the V4 provider registry; **DEC-009 blocks all live providers**.

Production readiness requires **three parallel tracks**, not more sandbox financial phases alone:

1. **Production infrastructure & security gate** (Redis RL, KMS, cookies, monitoring, backups, PCI process)  
2. **First live provider integration** (DEC-009 closure + real V4 adapter — PayTabs is the only documented first candidate)  
3. **Financial completeness for ops** (reconciliation depth, events/Internal Books contract — P15.1-F/G; **not blocking first live capture**)

**P15.1-F (Reconciliation) is not a prerequisite for first live provider authorization/capture**, but **is required** before claiming production-grade settlement/payout reconciliation.

---

## A. Current Production Status

| Dimension | Status | Notes |
|---|---|---|
| **Overall Production Gate** | **NOT PASSED** | `docs/ops/PRODUCTION_GATE.md` — forbidden to claim Production Ready |
| **P15.0 Security** | **PARTIAL (closed)** | Strong app-layer; Redis/KMS/cookies/PCI/live provider open |
| **P15.1 Financial Core (A–E)** | **PASS (sandbox scope)** | 149 PG tests; audits per phase |
| **Live payment capture** | **BLOCKED** | DEC-009; registry = `sandbox` only |
| **Live payout / settlement rail** | **BLOCKED** | Internal API + ledger only |
| **PCI compliance claim** | **BLOCKED** | DEC-011; engineering controls exist, no external assessment |
| **Multi-instance production** | **BLOCKED** | In-memory rate limits |
| **Observability / DR** | **NOT IMPLEMENTED** | No verified backup/restore or alerting |

**Honest label today:** *Sandbox-capable financial platform with production-oriented architecture, not production-operated.*

---

## B. Completed Production-grade Components

These are **real, tested, and suitable as foundations** for production (subject to infra wrapping):

### B.1 Identity, authorization, tenant isolation

| Component | Evidence | Production-grade? |
|---|---|---|
| RBAC + custom roles | `requirePermission`, `tests/phase6_6-rbac.test.ts` | **Yes (app-layer)** |
| Tenant isolation | Org-scoped queries; P15.0 hardening; `tests/security/p15-0-security.test.ts` | **Yes (app-layer; RLS deferred)** |
| MFA (TOTP) | `identity-service.ts`, phase2 routes | **Yes** |
| Step-up (purpose-bound) | `requireStepUp`, `sensitive-operations.ts`, settlement/payout/refund routes | **Yes** |
| Account lockout | Failed login counters | **Yes** |
| API keys (hashed) | Phase 5; scopes | **Partial** (pepper/HMAC not done) |

### B.2 Payment core (sandbox path)

| Component | Evidence | Production-grade? |
|---|---|---|
| Payment intents + state machine | `payment-core-service.ts`, phase4 tests | **Yes (logic)** |
| Payment links + checkout sessions | phase4 routes/tests | **Yes (logic)** |
| Provider Router | `providers/router.ts` — env, capability, idempotency, timeout | **Yes (architecture)** |
| Sandbox adapter + webhooks | `sandbox-adapter.ts`, `webhook-service.ts`, phase5 tests | **Yes (test adapter only)** |
| Ambiguous / query-before-retry | Router + payment-core + billing renewal | **Yes** |
| No PAN/CVV at API boundary | `docs/security/CARD_DATA_FLOW.md` | **Yes (design)** |

### B.3 Financial core (P15.1-A → E)

| Phase | What is production-grade | Caveat |
|---|---|---|
| **A — Model / DEC-008** | Fee schedules, net equation, half-up, eligibility formula, invariants doc | Platform fees default 0 until configured; FX/tax deferred |
| **B — Ledger** | Double-entry, immutability trigger `028`, unique journal source `030`, idempotent post | Fee/settlement posts exist; not live-provider fee import |
| **C — Balances** | SoT in Financial Core; pending/available/settled formulas documented | Pending adjusted by FINALIZED gross (not separate clearing journal) |
| **D — Settlement** | DRAFT→FINALIZE→CANCEL; anti-double PI; fee ledger on finalize; outbox | No provider settlement file import |
| **E — Payout** | Lifecycle + bank account binding + cap vs unpaid net + ledger on mark-paid | **Sandbox API only — not a bank rail** |

### B.4 Refunds & ledger integrity

| Component | Evidence |
|---|---|
| Refund caps + idempotency | `refunds-service.ts`, `tests/refund-conformance.test.ts` |
| Balanced journals | `postBalancedJournal`, conformance tests |
| Ledger immutability | Migration `028`, compensating entries only |
| Webhook refund apply | `webhook-state-apply.ts` |

### B.5 Database & migrations

| Component | Evidence |
|---|---|
| PostgreSQL SoR (V4) | `/api/v1`, migrations `000`–`032` |
| Additive migration discipline | P15.1 audits |
| Financial invariants documented | `P15_1_FINANCIAL_INVARIANTS.md` |

---

## C. Sandbox-only / Mock / API-only Components

**Do not treat these as production money movement:**

| Component | What it actually is | Risk if mislabeled |
|---|---|---|
| **Internal Sandbox provider** | Deterministic test adapter (`FAIL`, `TIMEOUT`, `AMBIGUOUS` tokens) | Assuming live behavior |
| **`POST /payouts/:id/mark-paid`** | Internal status + ledger journal | Believing funds reached a bank |
| **`POST /payouts/:id/submit`** | Sandbox runner simulation | No ACH/SARIE/wire |
| **Settlement provider fees on create** | Manual `provider_fees_minor` field | No provider settlement file/API |
| **Reconciliation `run()`** | Count PI vs `provider_transactions` | No amount/reference matching |
| **Refunds via API (non-webhook)** | Forced `SANDBOX` in `refunds-service.ts` | Live refund rail absent |
| **Books connector** | Read stub / sync state | No Internal Books product |
| **Legacy MySQL `/v1` stack** | Frozen; PayTabs partial legacy | Must not be production path |
| **`application/payments/provider-callback.ts`** | MySQL trap (`signature_valid: true`) | Security debt if revived |
| **Dashboard “balances” from PI aggregates** | UI note says ledger when available | Frontend must not sum money |

### C.1 Partial / API-only (needs live wiring)

| Area | Gap |
|---|---|
| **3DS / REQUIRES_ACTION** | V4 `payment-core-service.ts` handles `SUCCEEDED` and `AMBIGUOUS`; **`REQUIRES_ACTION` falls through to failure path** — no redirect/challenge UX on V4 checkout |
| **Tokenization** | Sandbox opaque `sbx_pm_*`; no vault; checkout expects token, no production PM storage |
| **Provider credentials API** | Schema + metadata exist; **no V4 upsert/manage credentials service** |
| **Live environment activation** | `resolvePaymentEnvironment()` can label LIVE; **no live adapter registered**; sandbox account rejects LIVE |
| **Settlement → PAID** | Internal when sum(payouts PAID) ≥ net | No provider payout confirmation |
| **Disputes** | Internal CRUD only | No provider dispute sync |
| **Observability** | Basic health endpoints | No metrics/alerts/runbooks |

---

## D. Provider Integration Gap

### D.1 Current V4 architecture (real, sandbox-tested)

```text
payment-core-service → providerRouter → registry[sandbox] → sandbox-adapter
                              ↑
webhook ingress → verify → dedupe → webhook-state-apply → PI / refunds / ledger
```

**Key files:**

| Layer | Path |
|---|---|
| Contract | `apps/api/src/providers/adapter.ts` |
| Registry | `apps/api/src/providers/registry.ts` — **only `sandbox`** |
| Router | `apps/api/src/providers/router.ts` |
| Errors | `apps/api/src/providers/errors.ts` |
| Webhooks | `webhook-service.ts`, `webhook-state-apply.ts` |
| Admin | `provider-admin-service.ts`, `phase5-routes.ts` |
| Capabilities | `capability-matrix.ts` |

### D.2 Capability assessment (honest)

| Capability | Sandbox (V4) | Live (any provider) |
|---|---|---|
| Authorize / capture | VERIFIED (coalesced) | **NOT IMPLEMENTED** |
| Void | PARTIAL (local) | **NOT IMPLEMENTED** |
| Refund | VERIFIED (sandbox + webhook) | **BLOCKED** (env forced SANDBOX) |
| Webhook verify + apply | VERIFIED (HMAC, replay) | **BLOCKED** (DEC-009) |
| 3DS | Capability false; not wired in checkout | **GAP** |
| Tokenization | PARTIAL (opaque ref) | **NOT IMPLEMENTED** |
| Provider settlements | N/A | **NOT IMPLEMENTED** |
| Provider payouts | N/A | **NOT IMPLEMENTED** |
| Disputes | N/A (internal only) | **NOT IMPLEMENTED** |
| Error mapping / retries | VERIFIED taxonomy | Live mapping **per provider TBD** |
| Reconciliation | Internal count only | **NOT IMPLEMENTED** |
| Observability (provider) | Audit/outbox partial | **NOT IMPLEMENTED** |

### D.3 Sandbox vs Live separation (today)

| Mechanism | Status |
|---|---|
| `provider_accounts.environment` SANDBOX/LIVE | **Schema exists** |
| Router rejects env/credential mismatch | **Enforced** |
| `supports_live` / `supports_sandbox` flags | **Enforced** |
| Separate credential metadata per env | **Schema exists; no live secrets workflow** |
| Registry isolation | **Only sandbox registered** |
| **Flipping APP_ENV to production** | **Does NOT enable live money** — no live adapter |

**Required for production:** Real adapter registration + DEC-009 checklist + live credentials in secret manager — **not a flag toggle**.

### D.4 First production provider candidate

| Provider | Evidence in repo | Recommendation |
|---|---|---|
| **PayTabs** | Documented in `CAPABILITY_MATRIX.md`; partial **legacy** adapter `infrastructure/providers/paytabs.ts` (HPP + 3DS redirect); **not on V4 router** | **First candidate for MENA/Saudi** — requires new V4 `ProviderAdapter` implementation |
| **Stripe / Adyen / Checkout.com** | UNKNOWN in `PROVIDER-READINESS-MATRIX.md` | Not ready — no code, no checklist |
| **Zoho Payments** | **Explicitly out of scope** | Not a payment provider substitute |
| **Internal Sandbox** | Permanent test adapter | **Never production** |

**PayTabs first integration requires (minimum):**

1. **DEC-009 closure** — per-provider capability matrix verified with sandbox + webhook evidence  
2. **V4 adapter** — authorize/capture/refund/status/webhook verify (not legacy MySQL path)  
3. **Credential vault** — live API keys via KMS/secret manager (not env-only)  
4. **3DS flow** — handle `REQUIRES_ACTION` in payment-core + checkout UI redirect  
5. **Webhook endpoints** — per-account or rotatable secrets (today: shared sandbox secret)  
6. **Refund path** — remove forced SANDBOX in refunds-service for live env  
7. **Integration tests** — provider sandbox certification + PG suite extensions  
8. **Runbooks** — failure, ambiguous, reconciliation playbooks  
9. **PCI / DEC-011** — hosted payment page vs direct API scope decision  

---

## E. Production Gate Blockers

Consolidated from `docs/ops/PRODUCTION_GATE.md`, `P15_0_PRODUCTION_SECURITY_CHECKLIST.md`, and codebase inspection.

| # | Blocker | Status | Impact |
|---|---|---|---|
| E1 | **First live provider (DEC-009)** | BLOCKED | No real authorization/capture |
| E2 | **PCI scope / external assessment (DEC-011)** | BLOCKED | Cannot claim compliant card acceptance |
| E3 | **Redis / distributed rate limiting (DEC-005)** | BLOCKED | Multi-instance unsafe; `RedisRateLimitStore` throws |
| E4 | **KMS / secret rotation** | BLOCKED | Env keys only; planned P15.4 |
| E5 | **HttpOnly Secure session cookies** | MISSING | Bearer in `localStorage` — XSS theft risk |
| E6 | **Monitoring & alerting** | NOT IMPLEMENTED | No SLOs, on-call, or alert runbooks |
| E7 | **Backup & restore verification** | NOT IMPLEMENTED | No scripts or drill evidence |
| E8 | **Penetration test** | NOT IMPLEMENTED | Required for production claim |
| E9 | **Load testing** | NOT IMPLEMENTED | Unknown capacity |
| E10 | **E2E security role-matrix** | PARTIAL | Spec exists; not re-run at P15.0 closure |
| E11 | **Platform Admin UI** | NOT IMPLEMENTED | Ops gaps |
| E12 | **Postgres RLS** | DEFERRED | Defense-in-depth only; app-layer primary |
| E13 | **Internal Books / Zoho** | BLOCKED (DEC-016) | Accounting export — not payment rail |
| E14 | **Production Gate doc stale rows** | PARTIAL | Gate still lists settlement `fees=0`, payout `no rail` — **code has moved on (P15.1-D/E)**; gate doc needs refresh at next audit |

### E.15 What **does** pass the gate today

Authentication, MFA, step-up, RBAC, tenant isolation (tests), sandbox payments/refunds, integration test suite (`test:pg` 149 tests).

---

## F. Recommended Provider Integration Order

**Principle:** Do not connect live money on weak infra. Do not use mock/sandbox success as sign-off.

| Order | Work | Unblocks |
|---|---|---|
| **F1** | Production infra minimum: **Redis RL**, **KMS/secret refs**, **HttpOnly cookies**, health/readiness for Redis | Safe multi-instance API |
| **F2** | **DEC-009 checklist** for PayTabs (capabilities, webhooks, refunds, 3DS, errors) | Formal go-ahead for adapter work |
| **F3** | **PayTabs V4 adapter** + register in `registry.ts` (SANDBOX cert first, then LIVE) | Real authorization/capture/refund |
| **F4** | **3DS / REQUIRES_ACTION** in payment-core + checkout UI | Card payments in KSA/regions requiring 3DS |
| **F5** | **Credential management API** + per-org live routes | Merchant onboarding to live |
| **F6** | **Provider reconciliation** (amount/reference) — overlaps P15.1-F | Ops confidence before scale |
| **F7** | **Live payout rail** (bank file/API — **not** mark-paid) | Real merchant settlements |
| **F8** | Second provider (e.g. Stripe) only after F1–F6 template proven | Redundancy / markets |

**Zoho:** Not in this order — Internal Books is a **separate product track** (DEC-016), not a payment provider.

---

## G. Required Architecture Changes

| Change | Why | Depends on |
|---|---|---|
| Wire **RedisRateLimitStore** | Multi-instance rate limits | DEC-005, Redis deployment |
| **KMS-backed** `secret_ref` resolution | Live provider keys, webhook secrets | P15.4 / ops |
| **Session cookie** transport + CSRF strategy | XSS-resistant auth | Frontend + API |
| **`REQUIRES_ACTION` branch** in payment-core | 3DS / redirect flows | Provider adapter |
| **Live adapter registration** pattern | Sandbox/Live isolation at registry, not env flag alone | DEC-009 |
| **Credential service** (CRUD + rotation) | Merchants cannot go live without it | KMS |
| **Provider fee import** (optional phase) | Replace manual `provider_fees_minor` | Provider settlement API/file |
| **Payout rail adapter** (separate from ledger helper) | Real bank movement | Banking partner / PayTabs payout if supported |
| **Reconciliation engine** (amount match) | Production ops | P15.1-F scope |
| **Financial events outbox contract** | Internal Books consumer | P15.1-G |
| **Refresh Production Gate doc** | Reflect P15.1-D/E reality | Audit only |

**No architectural rewrite of Payment Core or Checkout required** — gaps are adapter, infra, and ops layers.

---

## H. Required Security / Compliance Work

| Item | Type | Notes |
|---|---|---|
| DEC-011 PCI scope document + SAQ/AoC path | Compliance | Hosted page may reduce scope — must be decided |
| External penetration test | Compliance | Gate requirement |
| KMS + key rotation runbooks | Security | Bank data encryption keys |
| Per-account webhook secrets | Security | Replace shared sandbox secret pattern for live |
| Distributed rate limiting | Security | Auth/checkout/webhook abuse |
| HttpOnly cookies | Security | Session theft |
| E2E role-matrix + onboarding gate UX | Security | Close P15.0 PARTIAL items |
| Audit log completeness review | Security | Checklist #30 PARTIAL |
| API key pepper/HMAC | Security | Checklist #23 |
| Document **forbidden claims** | Process | No “Production Ready” until gate PASS |

---

## I. Required Tests

| Test class | Current | Needed for production |
|---|---|---|
| `npm run test:pg` (149 tests) | **PASS** | Keep as regression gate |
| Provider contract tests (sandbox) | PASS | Extend for **PayTabs V4 adapter** |
| Live provider sandbox certification | N/A | Provider-hosted test cards + webhooks |
| 3DS E2E | MISSING | Checkout redirect + return URL |
| Refund live path | MISSING | Partial + full + idempotent |
| Webhook replay / wrong-signature | PASS (sandbox) | Repeat for live adapter |
| Concurrent settlement/payout | PARTIAL | Load tests |
| Failover: Redis RL | MISSING | Multi-instance test |
| Backup restore drill | MISSING | RPO/RTO evidence |
| Pen test | MISSING | External |
| Financial invariant suite | PASS (unit+PG) | Add live-provider integration cases |
| Full merchant journey E2E | PARTIAL | Playwright with live sandbox |

---

## J. Recommended Implementation Sequence

### Track 1 — Production infrastructure (blocking live launch)

| Phase | Name | Delivers | Production-ready after? |
|---|---|---|---|
| **P15.2** | **Production Security & Infrastructure Gate** | Redis RL, KMS integration, HttpOnly cookies, monitoring/alerting baseline, backup/restore drill, gate doc refresh | **Ops-safe API deployment** — still no live money |
| **P15.5** | **PCI / Compliance pack** | DEC-011 closure, pen test, SAQ path | **Compliance-ready** (with provider) |

### Track 2 — Live provider (user goal: real payments)

| Phase | Name | Delivers | Production-ready after? |
|---|---|---|---|
| **P15.3** | **DEC-009 + PayTabs V4 Adapter (Sandbox cert)** | Register adapter, sandbox live-api testing, webhooks, refunds, 3DS | **Real sandbox provider money path** (provider sandbox) |
| **P15.3-L** | **PayTabs LIVE activation** | Live credentials, go-live checklist, monitoring | **Real authorization/capture/refund** (PCI + infra required) |

### Track 3 — Financial ops completeness (can parallel after first live capture)

| Phase | Name | Delivers | Necessary before first live capture? |
|---|---|---|---|
| **P15.1-F** | Reconciliation (deep) | Amount/reference matching, discrepancy types | **No** — needed before **scale / production gate financial row** |
| **P15.1-G** | Financial events / Internal Books contract | Outbox payloads for IMKAN Books | **No** for payments |
| **P15.1-H** | Full financial E2E | Cross-phase regression | Before gate PASS |
| **P15.1-I** | P15.1 final audit | DoD + gate impact | Before gate PASS |
| **P15.4-E** | **Live payout rail** | Bank API/file; replace mark-paid semantics for production | **No** for capture; **Yes** for merchant withdrawals |

### Is P15.1-F required before provider production integration?

| Question | Answer |
|---|---|
| Block first live **payment**? | **No** — provider adapter + infra/security are the blockers |
| Block **Production Gate PASS**? | **Yes** — gate row “Reconciliation” remains PARTIAL |
| Block **honest “production financial ops”**? | **Yes** — count-only recon is insufficient |
| Recommend starting F before PayTabs? | **No** — prioritize **P15.2 + P15.3** unless ops demands recon before any live traffic |

---

## End-to-end production gap map

Target flow vs today:

```text
Customer → Payment Link/Checkout → Real Provider → Auth/Capture → Webhook → Success → Ledger
  → Settlement (fees) → Available Balance → Real Payout
```

| Step | Today | Gap |
|---|---|---|
| Payment Link/Checkout | **Works (sandbox)** | 3DS UX gap |
| Real Provider | **Sandbox only** | DEC-009 + PayTabs V4 adapter |
| Authorization/Capture | **Sandbox simulated** | Live API + credentials |
| Webhook | **Works (sandbox HMAC)** | Live secrets + provider formats |
| Payment Success → Ledger | **Works** | Keep; verify under live load |
| Settlement + fees | **Works (internal finalize)** | Provider fee import optional |
| Available Balance | **Works (Financial Core)** | Verify under live refund/chargeback volume |
| Real Payout | **mark-paid API only** | Bank rail + compliance |

---

## Explicit non-goals (unchanged)

- **Zoho Payments / Zoho Books** as payment provider  
- Treating **sandbox mark-paid** as production payout  
- **Flag-only** SANDBOX→LIVE without adapter + credentials + DEC-009  
- Claiming **Production Ready** from PostgreSQL tests alone  
- Starting **P15.1-F** without explicit approval (this document does **not** authorize it)

---

## Decision record

| Item | Decision |
|---|---|
| P15.1-A → E | Accepted PASS for **sandbox financial core** scope |
| P15.1-F | **Deferred** — not prerequisite for first live provider capture |
| Next work direction | **Production infra + Live provider**, not more sandbox-only financial phases |
| Production Ready claim | **Forbidden** until Production Gate PASS |

---

## Stop

**This document completes the requested gap analysis.**  
**No code was changed.**  
**P15.1-F was not started.**  
**Awaiting explicit approval before any implementation phase.**
