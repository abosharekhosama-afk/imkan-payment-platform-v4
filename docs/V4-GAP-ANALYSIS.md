# V4 — Gap Analysis (Current State vs V4 Target)

**Date:** 2026-08-09  
**Method:** source-level inventory of the actual repository (code, migrations, routes, services, UI, tests, config) compared against the V4 spec package (`E:\process\New folder\00–13`). Nothing was assumed present without verification; nothing was modified.  
**Companion reports:** `V4-IMPLEMENTATION-READINESS.md`, `providers/PROVIDER-READINESS-MATRIX.md`, `providers/PROVIDER_CHECKLIST.md`, `books/BOOKS-INTEGRATION-GAP.md`, `database/DATABASE-CONSISTENCY-REPORT.md`, `MOCK-TO-REAL-MIGRATION.md`, `V4-IMPLEMENTATION-SEQUENCE.md`.

Status legend: ✅ COMPLETE | 🟡 PARTIAL | 🔴 MISSING | ⚠️ MOCK/SIMULATION | ❌ BLOCKED

---

## 1. Current state — the repository contains TWO generations

### Generation A — V4 foundation (PostgreSQL 16, `/api/v1`) — Phases 1–3 DONE
Everything below is real (not mock), tested on PostgreSQL 16.14 (43/43 PG suite, 64/64 normal suite, final audit PASS 2026-08-09):

| Subsystem | Location | Status |
|---|---|---|
| Identity/tenant/session/RBAC (10 roles), MFA TOTP + step-up, email-verify/reset/invitations, idempotency middleware, outbox, audit/security events, error reports (redacted) | `apps/api/src/foundation/*`, PG migrations 000–007 | ✅ (email **delivery** is a documented stub — DEC-017) |
| Master Data: 16 `master_*` tables + admin CRUD (RBAC + audit + soft-disable) | `apps/api/src/merchant/master-data.ts`, migration 008 | ✅ |
| Merchant/KYB: profiles, legal/business, addresses, owners/directors/reps, documents (metadata), KYB requirement engine (selector-based), case/results/transitions state machines, risk categories | `apps/api/src/merchant/*`, migrations 009, 011 | ✅ (external KYB provider = documented adapter stub) |
| Banking: payout accounts (AES-256-GCM + last4 + HMAC fingerprint), lifecycle + verification state machines | `bank-accounts-service.ts`, migration 010 | ✅ (verification decision = manual platform review; no external rail) |
| Outbox fix (keyless events) | migration 012 | ✅ |

### Generation B — Legacy V3.4.1 (MySQL, `/v1`) — full **sandbox** payment platform
Runtime-gated by `ENABLE_LEGACY_V1` (default ON). Data plane = MySQL (`apps/api/src/infrastructure/db/mysql.ts`); retained per **DEC-014** (no delete, no auto-migration).

| Subsystem | Location | Real vs Mock |
|---|---|---|
| Payment sessions → attempts → payments (no payment_intents entity) | `application/payments/payment-service.ts` | Orchestration REAL; money movement depends on provider (default ⚠️ sandbox) |
| Payment links + hosted checkout (`/checkout/public/:token`) | `payment-link-service.ts`, `checkout-service.ts` | REAL flow, sandbox money |
| Refunds (+ ledger reversal) | `refund-service.ts` | REAL flow; provider-dependent |
| Ledger (DECIMAL(30,0) minor units, bigint math, balanced-entry assertion) + balances + fee rules | `application/ledger/*`, `domain/ledger/*` | REAL (sandbox data) |
| Settlements / payouts / reconciliation | `application/financial/service.ts` | ⚠️ SIMULATED by default (`sbx_st_*`, instant-PAID payouts); real only if `*_PROVIDER_URL` set |
| Products/prices/subscriptions/invoices + renewal engine/worker | `application/billing/*` | 🟡 CRUD real; renewal worker constructed **without provider** → renewals always fail path |
| Outbound merchant webhooks (HMAC signing, retry/backoff, replay) | `application/webhooks/worker.ts` | REAL |
| Inbound PayTabs callback handler | `provider-callback.ts` | 🟡 handler exists, **HTTP route never registered**; `signature_valid` hardcoded `true` |
| Provider adapters | `infrastructure/providers/` | sandbox ⚠️ MOCK; PayTabs 🟡 partial-real (hosted page; capture no-op; refund throws); generic `remote` REAL-if-configured |
| Zoho Books client (OAuth2, encrypted tokens, customer payments) | `infrastructure/integrations/zoho-books.ts` | 🟡 real client, **routes not registered** (dead wiring) |
| Risk engine, disputes, KYC cases, API keys, sessions auth, RBAC, error reports | various | REAL (sandbox scope) |

### Generation C — Web UI (`apps/web`)
Single-file React+Vite console (`src/main.tsx`) calling **legacy `/v1` only** (never `/api/v1`). Covers ~19 tab-screens (dashboard, payments, links, refunds, balances, settlements, payouts, reconciliation, risk, disputes, KYC, subscriptions, reports, API/webhooks, audit, errors, settings, hosted checkout). Prototype-grade: hardcoded demo tenant/merchant UUIDs, prefilled demo credentials, no registration screen, no Payment Methods/Branding/Provider-config/Sandbox-Live toggle, dispute-create payload bug, no URL routing.

---

## 2. Target state (V4 spec, condensed)

Build order (`00` §2): Foundation → Identity/Tenant → Merchant/KYB → **Payments → Providers → Billing → Financial Core → Risk/Disputes → Books → Security/Production**. UI is part of the Definition of Done for every feature (no separate UI phase). PostgreSQL is the system of record; `/api/v1` is the contract (DEC-002); the ledger is the financial source of truth (`06`); no floating-point money (`00` §22); provider chain = Router → Adapter → External provider (`00` §13); Books via Domain Event → Outbox → Worker → Connector (`00` §16); strict sandbox/live isolation (`00` §14); hosted/tokenized capture only, never raw PAN/CVV (`00` §17).

---

## 3. Gap analysis by domain (spec §4 checklist)

| Domain entity | V4 (PG, `/api/v1`) | Legacy (MySQL, `/v1`) | V4 gap status |
|---|---|---|---|
| Tenant/Organization, User, Role, Permission | ✅ 000–007 | exists | ✅ COMPLETE |
| Merchant, KYB (cases/results/transitions/requirements) | ✅ 009 | basic KYC cases | ✅ COMPLETE |
| Master Data (15 spec tables + identification types) | ✅ 008 | hardcoded | ✅ COMPLETE |
| Payout account + bank verification | ✅ 010 | `bank_accounts` (sim-verify) | ✅ COMPLETE |
| Idempotency, Audit, Security events, Outbox | ✅ 003–004, 012 | exists | ✅ COMPLETE |
| **Customer** | — | ✅ MySQL | 🔴 MISSING in V4 (DEC-003 table approved; DEC-006 matching OPEN) |
| **Product / Price** | — | ✅ MySQL | 🔴 MISSING in V4 |
| **Payment Method (+ tokenization vault)** | — | 🟡 MySQL sandbox vault | 🔴 MISSING in V4 |
| **Payment Intent** | — | — (session model only) | 🔴 MISSING everywhere (spec requires `payment_intents`) |
| **Payment Session / Attempt / Payment** | — | ✅ MySQL (sandbox money) | 🔴 MISSING in V4 |
| **Payment Link / Checkout** | — | ✅ MySQL | 🔴 MISSING in V4 |
| **Subscription / Invoice** | — | 🟡 MySQL (renewal broken) | 🔴 MISSING in V4 |
| **Refund** | — | ✅ MySQL flow | 🔴 MISSING in V4 |
| **Dispute** | — | ✅ MySQL workflow | 🔴 MISSING in V4 |
| **Fee** | — | ✅ fee_rules MySQL | 🔴 MISSING in V4 (rules blocked by DEC-008) |
| **Ledger (accounts/transactions/entries)** | — | ✅ MySQL DECIMAL(30,0) | 🔴 MISSING in V4 |
| **Balance** | — | ✅ projection | 🔴 MISSING in V4 |
| **Settlement / Payout(-run) / Reconciliation** | — | ⚠️ SIMULATED | 🔴 MISSING in V4 (+ real rails ❌ BLOCKED on providers/bank agreements) |
| **Provider / Provider Account / Capability / Routes / Transactions / Credentials-metadata** | master type/capability codes only | env-selected factory, 3 adapters | 🔴 MISSING in V4 (architecture); per-provider capabilities ❌ BLOCKED on DEC-009 |
| **Webhook (inbound events, deliveries)** | outbox only | 🟡 outbound real; inbound partial | 🔴 MISSING in V4 (`webhook_events`, `webhook_deliveries`) |
| **Event (domain events)** | ✅ outbox_events | ✅ | ✅ base; consumer workers 🟡 stub handlers |
| **Notification** | UI area only per spec (no table required) | notification_events table exists | 🟡 transport blocked by DEC-017 |
| **API Keys / Developer surface** | — | ✅ MySQL | 🔴 MISSING in V4 |

## 4. Payment core lifecycle (spec §6 view, per stage)

Stages: Customer → Link/Checkout → Session → Intent → Attempt → Provider → Webhook → Payment → Ledger → Settlement → Reconciliation → Books.

| Stage | Exists? | Mock? | DB model | API | UI | Events | Tests | Audit | Idempotency | Prod-ready |
|---|---|---|---|---|---|---|---|---|---|---|
| Customer | legacy only | no | MySQL | `/v1` | yes | partial | no | partial | — | no |
| Link/Checkout | legacy only | sandbox money | MySQL | `/v1` + public | yes | yes | no | partial | yes | no |
| Session | legacy only | no | MySQL | `/v1` | via checkout | yes | no | partial | yes | no |
| **Intent** | **nowhere** | — | — | — | — | — | — | — | — | — |
| Attempt | legacy only | provider-dep | MySQL | internal | drawer | yes | FSM unit only | partial | yes | no |
| Provider | legacy factory | ⚠️ sandbox default | MySQL callbacks | — | no config UI | — | no | partial | partial | no |
| Webhook (inbound) | 🟡 handler unwired | signature hardcoded true | MySQL | **route missing** | deliveries UI | — | no | yes | yes | no |
| Payment | legacy only | sandbox | MySQL | `/v1` | yes | yes | FSM unit | yes | yes | no |
| Ledger | legacy only | no (sandbox data) | MySQL | balance API | yes | — | 1 unit test | partial | — | no |
| Settlement | legacy only | ⚠️ simulated | MySQL | `/v1` | yes | yes | no | partial | partial | no |
| Reconciliation | legacy only | ⚠️ simulated | MySQL | `/v1` | yes | — | no | partial | — | no |
| Books | client only | route-dead | MySQL tokens | **unregistered** | connect button | dual outbox | no | no | contract doc | no |

**Conclusion:** the entire payment core must be built on the V4 side (PostgreSQL, `/api/v1`) per spec; the legacy implementation is a working sandbox **reference**, not a base to extend (DEC-002 explicitly: legacy `/v1` must not be treated as the V4 contract).

## 5. Missing components (V4 side)

Payments domain (intents/sessions/attempts/payments/methods/refunds/customers/links/checkout/branding), provider architecture (router, adapter interface, 6 provider tables, credentials metadata, webhook verification, error mapping, retry/timeout, health), billing (products/prices/subscriptions/invoices), financial core (ledger/balances/fees/reserves/settlements/payouts/reconciliation/disputes), inbound+outbound webhook subsystem on PG, Books worker/connector, developer surface (API keys, scopes), all V4 portal UI (public/merchant/admin/developer on `/api/v1`), rate limiting on `/api/v1`.

## 6. Partial components

Email/notification transport (outbox events emitted, no delivery — DEC-017); outbox consumer (stub handlers mark processed); legacy PayTabs adapter (hosted page real, capture no-op, refund throws, callback unwired); legacy Zoho client (real, routes unregistered); legacy subscription renewals (no provider injected); web console (broad but prototype, `/v1`-bound); `packages/contracts` (defined, consumed by nothing).

## 7. Mock/simulation components

See `MOCK-TO-REAL-MIGRATION.md` for the full matrix. Headline items: SandboxProvider (default), simulated settlements/payouts/reconciliation, internal-manual KYB/bank verification adapters, dev auth bypass (`x-tenant-id`, non-prod only), demo seeds/UI defaults, `EXPOSE_DEV_TOKENS`.

## 8. Risks

**Production risks:** no real provider integration (all money movement is sandbox); no rate limiting/API keys on `/api/v1`; email delivery absent; legacy `/v1` enabled by default alongside V4 (two contracts live); no PCI scope document (DEC-011); no backup/restore evidence; secrets in env files.

**Architectural risks:** dual-generation drift — UI depends entirely on legacy `/v1` while V4 grows on `/api/v1` (a UI cutover plan is required per phase); `payment_intents` missing from both generations while spec mandates it (must be designed fresh, not ported); spec catalog itself omits customers/payment_links/branding/api_keys/invitations tables that other sections require (`11` §P expansion expected — record as decisions, don't invent silently).

**Database risks:** two schemas by design (DEC-014) — risk is confusion, not corruption; legacy `001_core.sql` contains markdown fences (clean-DB re-run risk); legacy PayTabs adapter converts amounts with `Number(amount)/100` (float at provider boundary); details + severities in `database/DATABASE-CONSISTENCY-REPORT.md`.

**Security risks:** legacy inbound callback with `signature_valid=true` hardcoded (currently unreachable — route unregistered — but a trap if ever wired); dev auth bypass must never ship enabled; UI stores session token in localStorage; no CSRF strategy for future cookie-based portal.

**Provider risks:** zero verified capabilities (DEC-009 OPEN); regional acquiring (incl. Palestine) unresolved; see readiness matrix.

**Books risks:** target system undecided (DEC-016 Zoho vs internal); no V4-side worker/connector; legacy dual-outbox writes diverge from V4 outbox.

**Testing gaps:** zero tests for the payments/financial path beyond pure domain units (legacy engine test asserts only `Array.isArray`); no E2E through checkout; no webhook forgery/replay tests; no load/concurrency tests on financial paths; no reconciliation invariant tests. V4 foundation testing is strong (43 PG tests) but stops at Phase 3 scope.

## 9. Answers to the ten baseline questions

1. **What we have:** complete V4 foundation through Merchant/KYB/Banking on PG + a full legacy sandbox payment platform on MySQL + a prototype console UI.
2. **What's missing (V4):** everything from Payments onward — §5 above.
3. **What's mock:** sandbox provider, simulated settlements/payouts/reconciliation, verification stubs, email transport, demo seeds (full matrix in `MOCK-TO-REAL-MIGRATION.md`).
4. **Needs external provider:** all real money movement, refunds at provider, 3DS, tokenization, payouts/settlement rails, KYB vendors (DEC-009/DEC-010).
5. **Needs Books:** target decision (DEC-016), then worker + connector + mappings (`books/BOOKS-INTEGRATION-GAP.md`).
6. **Needs Database:** ~30 new PG tables across Payments/Providers/Billing/Financial/Webhooks/Developer waves (list in `V4-IMPLEMENTATION-SEQUENCE.md`).
7. **Needs Security:** rate limiting, API keys/scopes, PCI scope doc (DEC-011), secrets management, sandbox/live switch policy (DEC-012), CSRF for portal cookies if adopted.
8. **Needs Testing:** payment lifecycle integration/E2E, webhook security, financial invariants/concurrency, provider adapter contract tests, Books sync tests.
9. **Blocks production:** provider agreements + verified capabilities, PCI scope, real rails, email vendor, secrets/WAF/backup/DR, pen test — unchanged from `PRODUCTION_READINESS.md`, still true.
10. **Correct order:** spec §2 order, detailed with gates in `V4-IMPLEMENTATION-SEQUENCE.md`.
