# V4 End-to-End Gap Audit (Review Only)

**Date:** 2026-08-09  
**Scope:** Complete V4 readiness assessment after Phases 1–6  
**Mode:** AUDIT ONLY — no code, schema, API, UI, or provider changes were made  
**Method:** Verified against repository code, PostgreSQL migrations `000`–`020`, tests, and docs — not completion reports alone  

**Baseline claimed by project:**

| Phase | Status |
|---|---|
| 1 Foundation | COMPLETE |
| 2 Identity / Tenant | COMPLETE |
| 3 Merchant / KYB | COMPLETE |
| 4 Payment Core / Links / Checkout | COMPLETE |
| 5 Provider Core / Router / Sandbox / Webhooks / API Keys | COMPLETE |
| 6 Billing / Subscriptions / Invoices / Renewal | COMPLETE |
| 7 Financial Core | NOT STARTED |

**Test baseline (claimed / last reported):** `test:pg` 88/88 · `npm test` 109/109  
**SoR:** PostgreSQL + `/api/v1` · Legacy `/v1` + MySQL frozen (DEC-014)  
**Active V4 provider adapter:** Sandbox only  
**DEC-007:** RESOLVED · **DEC-006:** INTERIM · **DEC-009:** OPEN (blocks live providers)

---

## Executive summary

V4 Phases 1–6 form a **coherent sandbox payment + billing platform** on PostgreSQL `/api/v1`: identity, merchant/KYB, payment intents via Provider Router, sandbox authorize, inbound webhook verify→outbox, API keys, and subscription renewal → Payment Core → Router. **Billing does not call providers directly.**

The system is **not production-capable**. There is **no V4 real-provider adapter**, **no Financial Core / ledger**, **no V4 refunds**, webhook events **do not mutate payment/invoice state** (sync adapter results do), outbox delivery is a **stub**, and most of the merchant console still talks to **frozen legacy `/v1`**. Sandbox E2E is API-proven; UI E2E for V4 payment links/checkout is **not** wired.

| Readiness | Status |
|---|---|
| **A. Development Ready** | **YES** (with Postgres + env) |
| **B. Sandbox / Staging Ready** | **PARTIAL** (API + V4 console on `/api/v1` after Phase 6.5; Playwright browser E2E pending env; no durable rate-limit/email) |
| **C. Production Ready** | **NO** |

**Single most important next step:** Choose and evidence the **first real provider** under DEC-009 / `PROVIDER_CHECKLIST.md`, implement a V4 adapter registered in `providers/registry.ts`, and wire webhook→Payment Core status application — *or*, if financial correctness is prioritized before rails, start Phase 7 Ledger with clear boundaries. Recommended order below favors **first real provider after a short UI/API alignment pass**, then Financial Core.

---

## 1. Repository inspection evidence map

| Area | Primary locations |
|---|---|
| Spec / SoT references | `docs/decisions/OPEN_DECISIONS.md`, `docs/providers/*`, `docs/implementation/PHASE*_COMPLETION_REPORT.md`, `LEGACY_V3_FREEZE.md` |
| PG migrations | `database/migrations/postgres/000`–`020` (no `ledger_*`) |
| Auth / RBAC / rate limit / outbox | `apps/api/src/foundation/*`, `identity*` |
| Merchant / KYB / bank | `apps/api/src/merchant/*` |
| Payment Core | `apps/api/src/payments/payment-core-service.ts`, `payment-links-service.ts`, `payment-config-service.ts` |
| Provider Core | `apps/api/src/providers/{adapter,registry,router,sandbox-adapter,webhook-service,provider-admin-service,errors}.ts` |
| Billing | `apps/api/src/billing/*` |
| `/api/v1` routes | `apps/api/src/interfaces/http/apiV1/{routes,phase2–phase6-routes}.ts` |
| Legacy providers | `apps/api/src/infrastructure/providers/{sandbox,paytabs,remote,real-rails,index}.ts` |
| Frontend | `apps/web/src/main.tsx` (single console) |
| Tests | `tests/phase2–phase6*.test.ts`, `scripts/verify-foundation-pg.mjs` |
| Config | `apps/api/src/config.ts` |

**Stub / non-production markers verified:**

- Outbox handler no-ops for `payment.*`, `billing.*`, `provider.*`, `email.*` — `foundation/outbox-worker.ts`
- Sandbox refund returns `REFUND_UNSUPPORTED` — `providers/sandbox-adapter.ts`
- Only `sandboxAdapter` registered — `providers/registry.ts`
- Legacy PayTabs callback hardcodes `signature_valid=true` — `application/payments/provider-callback.ts` (legacy / not V4 path)
- KYB external vendor automation OPEN (DEC-010); email transport OPEN (DEC-017)

---

## 2. Complete feature inventory

Legend for status columns: **Impl** = domain code present · **BE/DB/API/UI/Tests/Docs** · **Rail** = money/provider rail class · **Prod** = production readiness.

| Feature | Phase | Impl | Backend | Database | API `/api/v1` | UI | Tests | Docs | Sandbox/Mock/Real | Prod ready | Missing pieces | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Foundation PG + migrations | 1 | Yes | Yes | Yes | Health | n/a | Yes | Yes | REAL (infra) | Dev yes | — | `000`–`005` |
| Outbox + idempotency tables | 1 | Yes | Stub consumer | Yes | n/a | n/a | Partial | Yes | INTERNAL SIMULATION (delivery) | No | Real consumers / email / webhook fanout | `004_*`, `outbox-worker.ts` |
| Audit / security events | 1–2 | Yes | Yes | Yes | Partial | Legacy `/v1` | Partial | Yes | REAL (store) | Partial | UI on V4; full security ops | `003_*`, audit routes |
| Identity / session / MFA | 2 | Yes | Yes | Yes | Yes | Partial (login V4) | Yes | Yes | REAL | Partial | Email delivery DEC-017 | `identity*`, phase2 routes |
| Tenant / org / invitations | 2 | Yes | Yes | Yes | Yes | Missing V4 UI | Yes | Yes | REAL | Partial | Console org UX | phase2 |
| RBAC permissions | 1–6 | Yes | Yes | Seeded | Enforced | Partial | Yes | Yes | REAL | Partial | UI permission gating incomplete | `*_rbac_seed.sql` |
| Master data | 3 | Yes | Yes | Yes | Yes | Missing | Yes | Yes | REAL | Partial | Admin UI | `008_*` |
| Merchant profile | 3 | Yes | Yes | Yes | Yes | Missing (legacy KYC tab) | Yes | Yes | REAL | Partial | V4 merchant UI | merchant services |
| KYB case workflow | 3 | Yes | Manual/stub review | Yes | Yes | Legacy `/v1/kyc` | Yes | Yes | INTERNAL SIMULATION / ARCHITECTURE | No | Vendor (DEC-010), V4 UI | `kyb-service.ts` |
| Bank / payout accounts | 3 | Yes | Encrypt + review | Yes | Yes | Missing | Yes | Yes | REAL (storage) / SIM (verify) | No | Payout money movement = Phase 7+ | `010_*` |
| Payment config | 4 | Yes | Yes | Yes | Yes | Missing | Yes | Yes | REAL | Partial | UI | phase4 |
| Payment links | 4 | Yes | Yes | Yes | Yes | **Legacy `/v1` only** | API yes | Yes | SANDBOX for V4 API | Partial | Wire UI to `/api/v1` | `payment-links-service.ts` vs `main.tsx` |
| Checkout (public) | 4 | Yes | Yes | Yes | Yes | **Legacy checkout pages** | API yes | Yes | SANDBOX | Partial | V4 checkout UI | phase4-routes |
| Payment intents / attempts / txns | 4 | Yes | Yes | Yes | List/cancel | Legacy payments tab | Yes | Yes | SANDBOX authorize | No live | Real provider | `payment-core-service.ts` |
| Provider catalog / routes / caps | 5 | Yes | Yes | Yes | Yes | Missing | Yes | Yes | REAL (meta) + sandbox rail | No | Real adapters | `015_*`, router |
| Provider Router | 5 | Yes | Yes | Yes | Via payments | n/a | Yes | Yes | REAL architecture | Yes for sandbox | Live env gate | `router.ts` |
| Sandbox adapter | 5 | Yes | Yes | Seeded | Via router | n/a | Yes | Yes | SANDBOX / INTERNAL | No | Not a money rail | `sandbox-adapter.ts` |
| Inbound provider webhooks | 5 | Yes | Verify→outbox | Yes | Public POST | Missing (legacy webhooks) | Yes | Yes | SANDBOX HMAC | Partial | Apply to PI/invoice; real adapters | `webhook-service.ts` |
| API keys hashed | 5 | Yes | Yes | Yes | Yes | Legacy `/v1` | Yes | Yes | REAL | Partial | V4 UI | `api-keys.ts` |
| Rate limiting | 5 | Yes | In-process Map | n/a | Yes | n/a | Partial | Yes | REAL but non-distributed | No multi-instance | Redis/shared (DEC-005) | `rate-limit.ts` |
| Customers | 6 | Yes | Yes | Yes | Yes | **V4 connected** | Yes | Yes | REAL | Partial | DEC-006 interim matching | phase6 |
| Products / prices | 6 | Yes | Yes | Yes | Yes | Via Subscriptions V4 | Yes | Yes | REAL | Partial | Dedicated catalog UX | catalog-service |
| Subscriptions + SM | 6 | Yes | Yes | Yes | Yes | **V4 connected** | Yes | Yes | REAL domain | Partial | Proration OOS | subscription-* |
| Invoices + collect | 6 | Yes | Yes | Yes | Yes | **V4 connected** | Yes | Yes | SANDBOX collection | No | Ledger, tax/fees | renewal-service |
| Renewal worker | 6 | Yes | Yes | Attempts table | Manual run API | Button in Subs | Yes | Yes | SANDBOX | Partial | Ops hardening | `renewal-service.ts` |
| Refunds (V4) | — | Contract only | Adapter method; sandbox UNSUPPORTED | Cap row UNSUPPORTED | No V4 refund API | Legacy `/v1` | Contract says unsupported | Docs | PLACEHOLDER / ARCHITECTURE | **No** | Financial + provider evidence | matrix + sandbox |
| Partial refunds | — | No | No | No | No | Legacy UI | No | Checklist only | NOT IMPLEMENTED | No | Phase 7+ / DEC-009 | — |
| Tokenization | 5 | Partial | Opaque token | Cap PARTIAL | Accepts token | Hardcoded `tok_ok` | Partial | Yes | INTERNAL SIMULATION | No | Hosted fields / vault | sandbox |
| 3DS / SCA | — | No V4 flow | `REQUIRES_ACTION` in contract | No evidence | No | No | No | Checklist | NOT IMPLEMENTED / UNKNOWN | No | Provider + PCI (DEC-011) | adapter types only |
| Settlement / recon / payout money | Legacy only | Legacy MySQL | No V4 ledger tables | Legacy `/v1` | Legacy tabs | Legacy | Legacy docs | MOCK / LEGACY | **No** | Phase 7+ | UI → `/v1/*` |
| Ledger / balances | 7 | No | No | **No `ledger_*`** | No | Legacy balances | No | Planned | NOT IMPLEMENTED | No | Entire Phase 7 | migrations grep |
| Disputes / risk | Later | Legacy shells | No V4 | Legacy | Legacy | Legacy | Partial | — | MOCK / LEGACY | No | Risk phase | `main.tsx` |
| Books / Zoho | DEC-016 | Legacy client | — | Unregistered routes | Settings legacy | — | — | ARCHITECTURE / LEGACY | No | DEC-016 | freeze docs |
| Real external providers | DEC-009 | **No V4 adapters** | Legacy PayTabs only | Sandbox seed only | Caps API for sandbox | Missing | Sandbox only | Matrix | NOT IMPLEMENTED (V4) | **No** | Full checklist per provider | `registry.ts` |

---

## 3. Payment flow traces (verified)

### A. Payment Link → Checkout → Provider → Webhook

```
Merchant API  → payment-links-service
Customer      → GET  /api/v1/checkout/:token
              → POST /api/v1/checkout/:token/session
              → POST /api/v1/checkout/:token/payment
Payment Core  → payment_orders / payment_intents / payment_sessions / payment_attempts
              → providerRouter.resolve + run(AUTHORIZE)
Adapter       → sandboxAdapter.authorize
Sync path     → intent/session/order transitions + payment_transactions
Webhook       → POST /api/v1/webhooks/providers/:providerCode
              → verify → nonce/replay → dedupe → provider_webhook_events
              → outbox provider.webhook.received
Outbox        → stub PROCESSED (does NOT update intent)
Billing       → N/A for one-off link (unless separately subscribed)
```

| Concern | Finding |
|---|---|
| Modules | `phase4-routes.ts`, `payment-links-service.ts`, `payment-core-service.ts`, `providers/router.ts`, `sandbox-adapter.ts`, `webhook-service.ts` |
| DB | `payment_links`, `payment_orders`, `payment_intents`, `payment_intent_transitions`, `payment_sessions`, `payment_attempts`, `payment_transactions`, `provider_*`, `outbox_events` |
| Idempotency | Checkout session/payment keys; provider request idempotency on `provider_transactions` |
| State transitions | Sync from adapter result in Payment Core |
| Ambiguous/timeout | Router timeout → AMBIGUOUS patterns; status probe capability |
| Webhook → PI | **Does not apply status** — architectural gap vs “webhook closes the loop” |
| Audit / outbox | Emitted; outbox delivery stubbed |
| UI path today | Console Payment Links → **legacy `/v1/payment-links`** + `/checkout/public` — **bypass of V4 API in UI** |
| Violations | UI dual-stack; webhook not closing PI; outbox stub |

### B. Direct Payment

V4 merchant surface is primarily **link/checkout + list/cancel**. There is no general “create payment intent and charge” merchant API beyond checkout confirm and billing `collectForBilling`. Direct charge = those two entry points → same Router path.

Legacy UI Payments tab uses `/v1/payments` (MySQL) — **not** V4 Payment Core.

### C. Recurring Billing

```
Subscription due (next_billing_at <= NOW UTC)
  → renewal-service (worker or POST /billing/renewals/run)
  → ensure invoice (unique per period)
  → [if prior AMBIGUOUS] providerRouter.run(STATUS) query-before-retry
  → paymentCoreService.collectForBilling
       → Payment Core → providerRouter → sandbox authorize
  → billing_collection_attempts
  → success: invoice PAID, sub ACTIVE, advance period, outbox billing.*
  → fail: PAST_DUE → retries (5m / 10m) → UNPAID → 3-day grace → EXPIRED
```

| Concern | Finding |
|---|---|
| Billing → provider direct? | **NO** for authorize. STATUS lookup may call `providerRouter` from renewal (allowed query-before-retry), not adapter import for charge |
| Webhook closes invoice? | **NO** — sync collection / status poll only |
| Double invoice | DB uniqueness per period (DEC-007) |
| Double charge | Idempotency + query-before-retry; max 3 attempts |

**Explicit confirmation:** Billing never calls a provider adapter SDK directly for collection; charge path is **Billing → Payment Core → Provider Router → Adapter**.

---

## 4. Provider readiness audit

### Platform prerequisites (present)

| Prerequisite | Status | Evidence |
|---|---|---|
| Adapter contract | Yes | `providers/adapter.ts` |
| Registry | Yes (sandbox only) | `registry.ts` |
| Router env/capability/isolation | Yes | `router.ts` |
| Credentials metadata (secret refs) | Yes | `provider_credentials_metadata` |
| Webhook ingress pipeline | Yes | `webhook-service.ts` |
| Capability evidence model | Yes | `provider_capabilities` |
| Checklist template | Yes | `docs/providers/PROVIDER_CHECKLIST.md` |
| DEC-009 matrices | **OPEN** | Blocks live activation |

### Per-provider matrix (V4)

**Rule:** No invented APIs. Absent evidence → **NOT VERIFIED** / **NO**.

| Question | Sandbox (V4) | Stripe | Adyen | Nuvei | Worldpay | PayTabs | MyFatoorah | Paymob | HyperPay | Moyasar | Tap | Amazon Payment Services |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Adapter exists? | **YES** | NO | NO | NO | NO | NO (legacy only) | NO | NO | NO | NO | NO | NO |
| Auth model defined? | n/a env secret | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | PARTIAL legacy | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Sandbox supported? | YES VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | PARTIAL legacy | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Live config supported? | NO (`supports_live=false`) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Credentials storage supported? | Meta + env ref YES | Platform yes; provider NO | same | same | same | Legacy only | same | same | same | same | same | same |
| Webhook verification supported? | YES VERIFIED | NO adapter | NO | NO | NO | Legacy bypass risk; not V4 | NO | NO | NO | NO | NO | NO |
| Idempotency supported? | YES (router/sandbox) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Payment API mapping defined? | YES sandbox | NO | NO | NO | NO | Legacy partial | NO | NO | NO | NO | NO | NO |
| Refund capability defined? | UNSUPPORTED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | UNSUPPORTED legacy | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Partial refund defined? | NO | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Recurring capability defined? | Via platform billing + sandbox authz only | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Tokenization defined? | PARTIAL opaque | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | PARTIAL legacy | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| 3DS capability defined? | NO / NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Payout capability defined? | NO | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Dispute capability defined? | NO | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Settlement capability defined? | NO | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Capability matrix entry? | YES seeded | NO | NO | NO | NO | Legacy docs only | NO | NO | NO | NO | NO | NO |
| Provider checklist complete? | NO (test-only) | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| Sandbox evidence available? | YES (tests) | NO | NO | NO | NO | PARTIAL legacy | NO | NO | NO | NO | NO | NO |
| Production evidence available? | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| Remaining work | Keep test-only | Full DEC-009 + adapter + checklist + evidence | same | same | same | Rebuild on V4; never port signature bypass | Full greenfield V4 | same | same | same | same | same |
| Exact blocker | Not a money rail | **No V4 adapter + DEC-009 OPEN** | same | same | same | same + legacy float/`signature_valid` traps | **No code** | same | same | same | same | same |

---

## 5. What is actually “real” (money-related)

| Operation | Classification | Notes |
|---|---|---|
| Payment (authorize path) | **SANDBOX IMPLEMENTATION** | Real domain + Router; sandbox adapter only |
| Payment Link | **REAL IMPLEMENTATION** (domain/API) | UI still legacy for create/list |
| Checkout | **SANDBOX IMPLEMENTATION** | V4 API real; public UI legacy |
| Payment Intent | **REAL IMPLEMENTATION** (state machine) | Outcomes sandbox-driven |
| Refund | **PLACEHOLDER / ARCHITECTURE ONLY** | Contract + UNSUPPORTED seed |
| Partial Refund | **NOT IMPLEMENTED** | |
| Recurring Payment | **SANDBOX IMPLEMENTATION** | Billing real; collection sandbox |
| Tokenization | **INTERNAL SIMULATION** | Opaque `tok_*`; no vault |
| 3DS | **NOT IMPLEMENTED** | |
| Webhook | **SANDBOX IMPLEMENTATION** | Verify+persist+outbox; no PI apply |
| Settlement | **NOT IMPLEMENTED** (V4) / legacy mock | |
| Reconciliation | **NOT IMPLEMENTED** (V4) / legacy | |
| Payout (money out) | **NOT IMPLEMENTED** (V4) | Bank account KYC storage ≠ payout |
| Ledger | **NOT IMPLEMENTED** | |
| Fees | **NOT IMPLEMENTED** | DEC-008 OPEN |
| FX | **NOT IMPLEMENTED** | DEC-008 OPEN |
| Disputes | **NOT IMPLEMENTED** (V4) / legacy UI | |
| Risk | **NOT IMPLEMENTED** (V4) / legacy UI | |
| KYC/KYB | **INTERNAL SIMULATION** + manual admin | No external vendor |

---

## 6. Financial Core gap analysis (Phase 7 not started)

Phase 6 intentionally deferred ledger (DEC-007 §8). **Before Financial Core can safely land:**

| Requirement | Current state | Gap |
|---|---|---|
| Ledger / double-entry | No tables | Design + migrations + posting rules |
| Financial transactions | Payment txns only (rail) | Distinct financial journal |
| Balances / holds | Legacy `/v1/balance` only | V4 balance projection from ledger |
| Fees / taxes | Not invented (correct) | DEC-008 must resolve before posting fees/FX |
| FX | OPEN | Do not invent |
| Settlement / recon / payouts | Absent in PG | Depends on ledger + provider reports |
| Provider settlement reports | No ingestion | Needs first real provider |
| Financial idempotency | Payment/billing keys exist | Ledger posting keys + uniqueness |
| Auditability / immutability | Append-only patterns exist elsewhere | Ledger entries append-only |
| Refunds coupling | Refunds deferred “to Financial phase” | Must define refund → ledger + provider |

**Dependencies / blockers for Phase 7:**

1. DEC-008 (fees/FX/settlement cutoffs) for any fee/FX posting  
2. Clear boundary: Payment Core remains rail; ledger posts from verified payment/billing events  
3. Webhook/outbox consumers that currently stub — financial posting must not race sync paths  
4. Prefer at least one real provider settlement format *or* design provider-agnostic import interface first  

**Phase 6 lacks for safe Financial introduction:** durable event consumers, refund model, settlement identity, fee policy, and UI separation from legacy balance/settlement tabs (risk of dual writes).

---

## 7. Security audit (findings only)

| ID | Severity | Finding | Location | Impact | Recommended action |
|---|---|---|---|---|---|
| S-01 | **HIGH** | Rate limits are in-process `Map` — not shared across instances | `foundation/rate-limit.ts` | Bypass under horizontal scale | Shared store (DEC-005) before prod |
| S-02 | **HIGH** | Email verification/reset delivery stubbed; tokens may be exposed in non-prod (`EXPOSE_DEV_TOKENS`) | DEC-017, identity phase2, config | Prod email unblock; misconfig risk | Approve email vendor; harden prod flags |
| S-03 | **HIGH** | Legacy PayTabs path hardcodes `signature_valid=true` | `application/payments/provider-callback.ts` | Catastrophic if re-wired | Keep frozen; never port |
| S-04 | **MEDIUM** | Webhook verified but does not drive payment state | `webhook-service.ts`, outbox stub | Async provider truth ignored | Apply normalized events to PI with idempotency |
| S-05 | **MEDIUM** | Console mostly on legacy `/v1` including refunds/payouts | `apps/web/src/main.tsx` | Operator confusion; wrong SoR | V4 UI cutover or hard disable legacy tabs in V4 mode |
| S-06 | **MEDIUM** | No V4 PCI scope / hosted fields (DEC-011 OPEN); PAN rejected at API (good) but no real tokenizer | payment-core Zod + sandbox tokens | Cannot accept real cards safely | DEC-011 + provider hosted checkout |
| S-07 | **MEDIUM** | CSRF: cookie/session model relies on Bearer token in localStorage (XSS → session theft) | web console | Session hijack if XSS | Harden CSP in prod; prefer httpOnly patterns |
| S-08 | **LOW** | Helmet CSP disabled in non-prod | `server.ts` | Dev only | Ensure prod CSP on |
| S-09 | **LOW** | API keys cannot manage keys (good); step-up blocked for API keys (good) | authz / api-keys | — | Keep |
| S-10 | **INFO** | Login lockout present (8 / 15m) | identity-service + config | Brute-force mitigated | Tune for prod |
| S-11 | **INFO** | V4 webhook: no signature bypass | webhook-service | Positive control | Preserve |
| S-12 | **INFO** | Bank secrets encrypted; fingerprint HMAC | bank crypto keys in config | Good pattern | Secret manager in prod |
| S-13 | **MEDIUM** | Tenant isolation appears enforced in V4 services/tests; legacy UI may show cross-product confusion | phase4/6 tests vs UI | Ops error | Isolate consoles |
| S-14 | **LOW** | CORS default localhost | config | Misconfig in prod | Explicit allowlist |
| S-15 | **HIGH** | No real-money provider + no ledger = cannot claim production payment safety | registry + migrations | Business/compliance | See blockers |

Positive controls observed: scrypt passwords, MFA/step-up, hashed API keys, PAN field rejection, sandbox/live separation on Router, webhook HMAC for sandbox, RBAC permission checks on V4 routes, parameterized SQL.

---

## 8. API audit (`/api/v1`)

Global: `apiV1AuthHook`; public = health, auth bootstrap, `/checkout/`, `/webhooks/providers/`. Error shape + Zod validation used on phase routes. Idempotency prehandler on mutating sensitive ops. Rate limit buckets on payment/checkout/webhook/api-key paths.

### Inventory (grouped)

See exploration evidence for full method/path tables. Summary:

| Group | Auth | Tenant | Idempotency | RL | Tests | Docs | Prod |
|---|---|---|---|---|---|---|---|
| Health | Public | n/a | — | — | Yes | Yes | Yes |
| Auth / MFA / password | Mixed | Session org | Reset/change | — | Yes | Yes | Partial (email) |
| Organizations / members / audit | Session/API key | Yes | — | — | Partial | Yes | Partial |
| Phase 3 merchant/KYB/bank/admin | Session/API key + step-up | Yes | Key ops | — | Yes | Yes | Partial |
| Phase 4 payments/checkout | Org / public checkout | Yes | Session/payment/cancel | Yes | Yes | Yes | Sandbox only |
| Phase 5 providers/keys/webhooks | Org / public webhook | Yes | — | Yes | Yes | Yes | Sandbox only |
| Phase 6 billing | Org | Yes | Creates/collect/renewals | Partial | Yes | Yes | Sandbox only |

**Inconsistent / unsafe relative to V4 goals:**

- No V4 refund/dispute/settlement/payout money APIs (legacy only) — safe omission, but UI implies otherwise  
- Webhook ingress public by design — OK if verify strong; apply-state missing  
- `POST /billing/renewals/run` is org-admin trigger (fine for staging; needs ops authz review for prod)  
- Dual global Fastify rate-limit + bucket Map — overlapping semantics  

---

## 9. UI audit (`apps/web/src/main.tsx`)

| Screen | Classification | API | Notes |
|---|---|---|---|
| Login | Partially implemented | `/api/v1` default + legacy toggle | Logout still `/v1/auth/logout` |
| Dashboard | Legacy-only / API connected (legacy) | `/v1/dashboard/analytics` | Not V4 |
| Organizations | Missing | — | API exists |
| Merchant / KYB | Legacy-only | `/v1/kyc` | V4 KYB unused |
| Payment configuration | Missing | API exists | |
| Payment Links | Legacy-only | `/v1/payment-links` | **Not** `/api/v1/merchant/payment-links` |
| Checkout (public) | Legacy-only | `/checkout/public`, `/pay/:token` | **Not** `/api/v1/checkout/:token` |
| Payments | Legacy-only | `/v1/payments` | |
| Customers | **Fully implemented + API connected (V4)** | `/api/v1/customers` | |
| Products / Prices | Partial (via Subscriptions) | `/api/v1` | No dedicated tabs |
| Subscriptions | **Fully implemented + API connected (V4)** | `/api/v1` + renewals run | Sandbox collection |
| Invoices | **Fully implemented + API connected (V4)** | `/api/v1/invoices` | Collect button |
| Billing | Covered by Subs/Invoices | V4 | |
| API keys | Legacy-only | `/v1/api-keys` | V4 API unused |
| Provider configuration | Missing | API exists | |
| Webhooks | Legacy-only | `/v1/webhook-endpoints` | Not provider ingress |
| Settings / RBAC | Legacy-only | `/v1/roles`, `/v1/users` | |
| Balances / Settlements / Payouts / Recon / Risk / Disputes / Reports | Legacy / mock-era | `/v1/*` | Not V4 Financial |
| Error / loading / empty | Partial prototype | — | Minimal |
| Permission-based UI | Weak | — | Tabs not gated by V4 permissions |

---

## 10. Test audit (what tests prove)

| Suite | Proves | Does not prove |
|---|---|---|
| phase2 identity | Auth, MFA, invite, step-up, outbox tick | Real email delivery |
| phase3 crypto/KYB | Bank crypto, KYB/bank APIs, RBAC | External KYB vendor |
| phase4 payments | Config, links, checkout, sandbox pay/fail, concurrency, tenant isolation | UI checkout; real provider; webhook→PI |
| phase4 state | Intent SM unit | — |
| phase5 contract | Sandbox adapter behaviors incl. refund unsupported, webhook HMAC | Other providers |
| phase5 providers | Router, checkout via router, webhook→outbox, API keys, rate limit | Multi-instance RL; webhook apply |
| phase6 state | DEC-007 transitions/backoff/grace | — |
| phase6 billing | Catalog→sub→renewal→collect, fail/PAST_DUE, RBAC | Webhook-driven invoice close; real cards |
| `test:pg` foundation | Migrations/schema/foundation invariants | Full product UX |
| UI / e2e | **None** (only `scripts/e2e-smoke.sh`) | Browser journeys |

**Do 88/88 PG + 109/109 normal tests meaningfully cover critical payment paths?**  
**YES for API sandbox paths** (create link → checkout → router → sandbox; billing renewal → collect → sandbox; webhook verify/dedupe).  
**NO for:** UI E2E, real providers, refunds, ledger, webhook-driven settlement of intents/invoices, distributed rate limits, PCI hosted fields, production ops.

---

## 11. Documentation audit

| Doc area | Match to code? | Issues |
|---|---|---|
| Phase completion reports 1–6 | Largely accurate | Must not be read as production-ready |
| PROVIDER-READINESS-MATRIX | Accurate | Correctly marks others UNKNOWN |
| PROVIDER_CHECKLIST | Accurate template | No provider completed |
| OPEN_DECISIONS | Accurate | DEC-009/008/011/017 still open |
| Billing / renewal docs | Align with DEC-007 | Emphasize sandbox-only |
| Architecture maps / older PROJECT_GAP | Partially stale | Still describe legacy provider factory as primary |
| UI claims “V4 UI in scope” (Phase 6) | **Partial only** | Billing tabs yes; payment links/checkout/KYB/keys still legacy |
| Deployment / DR / runbooks | Thin / missing for prod | Gap |
| Sandbox vs live separation | Documented + coded for sandbox | Live switch DEC-012 OPEN |

---

## 12. Production readiness scores

### A. Development Ready — **YES (~85%)**

Postgres migrations, `/api/v1`, sandbox payments, billing renewal, auth, tests green (as reported). Local `npm run dev:api` + `dev:web` viable with env keys.

### B. Sandbox / Staging Ready — **PARTIAL (~55–65%)**

**Ready:** API sandbox payment + billing, webhook verify, API keys, RBAC.  
**Not ready:** Unified V4 console, email delivery, shared rate limits, webhook state application, ops runbooks, single-tenant staging discipline vs legacy `/v1`.

### C. Production Ready — **NO (~10–15% of production bar)**

| Gate | Status |
|---|---|
| Real provider | Fail |
| Real credentials / secret manager | Fail |
| PCI (DEC-011) | Fail / OPEN |
| Security hardening (distributed RL, email, CSP, dual-stack) | Fail |
| Financial ledger | Fail |
| Reconciliation / settlement | Fail |
| Refunds / disputes / risk | Fail |
| Monitoring / alerting / DR / backups | Not evidenced |
| Provider certification / checklist | Fail |
| Webhook reliability (apply + retry semantics) | Partial |
| Observability | Partial (audit tables; no full APM evidence) |

---

## 13. Architectural risks

| Risk | Severity | Evidence |
|---|---|---|
| Legacy/V4 dual console SoR confusion | **HIGH** | `main.tsx` mixed `/v1` and `/api/v1` |
| Webhook → outbox stub; no PI/invoice apply | **HIGH** | `webhook-service` + `outbox-worker` |
| Payment Core bypass via legacy `/v1` UI | **HIGH** | Payments/Links tabs |
| Direct provider calls from Billing | **Mitigated** | Only via Payment Core (+ STATUS via Router) |
| Double-charge if AMBIGUOUS mishandled | **MEDIUM** | Policy present; needs real-provider soak |
| Double-invoice | **LOW** (constrained) | Unique period |
| Missing ledger → “balances” UI is fiction for V4 | **HIGH** | Legacy balances |
| Refund claimed in UI via legacy | **HIGH** | Misleading |
| In-process rate limit | **MEDIUM** | Horizontal scale |
| Worker concurrency | **MEDIUM** | SKIP LOCKED used; validate under load |
| Currency/FX | **MEDIUM** | DEC-008 open; multi-currency catalog without FX engine |
| Config: `ENABLE_BYACY_V1` / `ENABLE_LEGACY_V1` default on | **MEDIUM** | Broad attack/confusion surface |
| PayTabs float + signature trap | **HIGH if unwired** | Legacy freeze critical |

---

## 14. What can we do today?

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Run V4 website locally? | **YES** | `npm run dev:web` + API |
| 2 | Merchant log in? | **YES** | `/api/v1/auth/login` default |
| 3 | Merchant create payment link? | **PARTIAL** | V4 API yes; **UI uses legacy `/v1`** |
| 4 | Customer open checkout? | **PARTIAL** | V4 API yes; **UI/public pages legacy** |
| 5 | Customer sandbox payment? | **YES** (API) / **PARTIAL** (UI) | phase4/5 tests; UI not on V4 |
| 6 | Through Provider Router? | **YES** | `confirmCheckoutPayment` / `collectForBilling` |
| 7 | Webhook update payment correctly? | **PARTIAL** | Verify+store+outbox; **no PI mutation** |
| 8 | Create product? | **YES** | V4 UI Subscriptions + API |
| 9 | Create subscription? | **YES** | V4 UI + API |
| 10 | Renewal worker create invoice? | **YES** | renewal-service + tests |
| 11 | Collection through Router? | **YES** | collectForBilling |
| 12 | Failed payments retry safely? | **YES** (sandbox policy) | DEC-007 backoff + query-before-retry |
| 13 | UI show invoice/subscription state? | **YES** | InvoicesV4 / SubscriptionsV4 |
| 14 | Connect real provider today? | **NO** | No V4 adapter; DEC-009 OPEN |
| 15 | Process real money today? | **NO** | Sandbox only; no live; no PCI; no ledger |
| 16 | What prevents real money? | — | No live adapter/credentials; DEC-009/011/008; refunds/ledger/settlement absent; UI dual-stack; webhook apply gap; checklist empty |

---

## 15. Recommended roadmap (no implementation)

**Recommended sequence (adjusted from naive list):**

```
Current V4 (Phases 1–6 sandbox)
  → 0) Console cutover: Payment Links + Checkout + Payments + API keys + KYB → /api/v1
       (reduces dual-SoR risk before any live rail)
  → 1) First Real Provider (DEC-009 + checklist + V4 adapter + webhook→Payment Core apply)
  → 2) Financial Core (ledger, refunds posting, balances) — after or tightly paired with provider refunds
  → 3) Additional Providers (copy checklist pattern)
  → 4) Risk / Disputes
  → 5) Reconciliation / Settlement / Payouts
  → 6) Books integration (DEC-016)
  → 7) Security hardening (distributed RL, email, secrets, PCI scope, disable legacy in prod)
  → 8) Production certification + launch
```

**Why UI cutover before / with first provider:** Today’s console can silently exercise frozen MySQL rails while operators believe they are on V4 — unsafe once credentials exist.

**Why Financial Core after first provider (or immediately after authorize+webhook apply):** Ledger needs real economic events; designing ledger against sandbox-only is possible but settlement formats need a provider. Refunds are blocked on both Financial + provider capability evidence.

---

## 16. Final gap matrix

| Priority | Gap | Why it matters | Current state | Required work | Dependency | Blocks Production? |
|---|---|---|---|---|---|---|
| **P0** | No V4 real provider adapter | Cannot move real money | Sandbox only | DEC-009 + adapter + tests + checklist | DEC-009 | **YES** |
| **P0** | Webhook does not apply payment/invoice state | Async truth ignored; double-charge risk with real rails | Outbox stub | Idempotent appliers | Provider events map | **YES** |
| **P0** | No Financial ledger / refunds | No books-quality money; refunds unsupported | Phase 7 not started | Phase 7 + provider refund evidence | DEC-008 for fees | **YES** |
| **P0** | UI dual-stack legacy money ops | Wrong SoR / fake balances | Must UI on `/v1` | Cutover or disable | — | **YES** |
| **P1** | DEC-011 PCI / hosted fields | Card data compliance | OPEN; PAN rejected only | Scope + tokenizer/hosted | First provider | **YES** |
| **P1** | DEC-017 email delivery | Auth/invite production | Stub outbox | Vendor + adapter | DEC-017 | **YES** |
| **P1** | Distributed rate limiting | Abuse under scale | In-process | Shared limiter | DEC-005 | **YES** |
| **P1** | Provider checklist / live credentials / secret manager | Activation gate | Empty | Per-provider evidence | DEC-009, DEC-012 | **YES** |
| **P1** | Settlement / reconciliation | Merchant trust & cash | Absent V4 | After ledger + provider reports | Phase 7, provider | **YES** |
| **P2** | Risk / disputes | Chargeback ops | Legacy shells | New phase | Provider dispute APIs | Soft-yes mature prod |
| **P2** | Monitoring / DR / runbooks | Ops | Not evidenced | Platform work | — | **YES** mature |
| **P2** | KYB vendor automation | Onboarding scale | Manual/stub | DEC-010 | DEC-010 | Soft |
| **P3** | Proration / upgrades | Product polish | OOS MVP | Later | Billing | No |
| **P3** | Additional providers | Coverage | None | Repeat checklist | First provider pattern | No |
| **P3** | Books (Zoho) | Accounting sync | DEC-016 OPEN | Adapter | Ledger | No |

---

## 17. Final verdict

| Question | Verdict |
|---|---|
| % of planned V4 architecture implemented (Phases 1–6 domain)? | **~70–75%** of *planned Phases 1–6* (APIs/domain strong; UI ~30% V4; outbox/email stubbed) |
| % only Sandbox / architecture? | **~40–50%** of money-touching surface is sandbox/architecture (provider rail, tokenization, webhooks apply, financial UI) |
| % genuinely production-capable? | **~10–15%** (identity/tenant/RBAC patterns; not money movement) |
| Website runnable? | **YES** |
| Payment flow E2E functional in Sandbox (API)? | **YES** |
| Payment flow E2E functional in Sandbox (UI V4)? | **PARTIAL / NO** for links/checkout |
| Ready to connect first real provider? | **NO** — architecture ready; adapter/evidence/DEC-009/webhook-apply not |
| Ready to process real money? | **NO** |
| Single most important next step | **Approve first provider under DEC-009 and implement V4 adapter + webhook state application; parallel console cutover off legacy `/v1` money tabs** |
| Top 10 production blockers | 1) No real V4 provider 2) DEC-009 open 3) Webhook/outbox do not settle PI/invoices 4) No ledger/refunds 5) PCI/hosted fields DEC-011 6) UI dual-SoR 7) Email DEC-017 8) Distributed RL/secrets 9) Settlement/recon 10) Observability/DR/compliance certification |

---

## Appendix A — Billing → Provider boundary (quote check)

`renewal-service.ts` calls `paymentCoreService.collectForBilling` for charges; may call `providerRouter` for **STATUS** only on AMBIGUOUS prior attempts.  
`payment-core-service.ts` documents and implements Payment Core → Router → Adapter.  
**No Billing → Adapter direct authorize path found.**

## Appendix B — Migrations present

`000_schema_migrations` … `020_phase6_rbac_seed` — **21** PostgreSQL migration files. **Zero** `ledger_*` tables.

## Appendix C — Stop conditions honored

- No Phase 7 started  
- No real provider added  
- No schema/API/UI/code changes beyond this audit document  
- Waiting for explicit approval before any implementation work  

---

*End of audit.*
