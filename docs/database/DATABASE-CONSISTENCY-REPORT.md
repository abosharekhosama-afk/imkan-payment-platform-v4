# Database Consistency Report

**Date:** 2026-08-09  
**Chain checked:** Domain Model → Database Schema → Migrations → Repositories/Services → API → UI.  
Severity: **P0** critical / **P1** high / **P2** medium / **P3** low.

## 1. Runtime verification performed

| Check | Result |
|---|---|
| PostgreSQL migrations 000–012 on **empty** DB (PG 16.14) | ✅ PASS (re-verified 2026-08-09 via `npm run test:pg`) |
| PostgreSQL migrations rerun on migrated DB (tracking/idempotence; pass 2 runs against the already-populated seed data) | ✅ PASS — all 13 skipped |
| PG schema objects: 55 tables, 88 FKs, 91 PK/unique, 412 CHECK, 137 indexes | ✅ verified by runner |
| PG integration/authz/tenant/state-machine suites | ✅ 43/43 |
| MySQL legacy migrations replay | ❌ **not executed** during this analysis — deliberately: DEC-014 forbids touching legacy data without approval, and no disposable MySQL instance was provisioned. Static review only (finding L-2 below). |

## 2. Two schemas by design (not a defect)

MySQL (legacy `/v1`, migrations `database/migrations/000–011`) and PostgreSQL (V4 `/api/v1`, `database/migrations/postgres/000–012`) coexist per **DEC-014**. The consistency requirement is: V4 features must exist end-to-end on the PG chain; the legacy chain must be frozen, not extended.

## 3. Findings — V4 chain (PostgreSQL)

| # | Sev | Finding |
|---|---|---|
| V-1 | — | **No Domain→DB→API mismatches found in Phases 1–3 scope.** Every PG table has a service and (where user-facing) an `/api/v1` route; FKs/uniques/CHECKs verified against the live runtime; money columns `NUMERIC(30,0)` + `CHAR(3)` FK (DEC-001); tenant scoping and idempotency constraints tested. (Detailed audit: `docs/implementation/PHASE3_FINAL_AUDIT.md`.) |
| V-2 | P1* | **UI missing for the V4 chain**: no screen consumes `/api/v1` (the console is `/v1`-only). *Not a schema defect — a chain-completeness gap; spec DoD requires UI per feature. Becomes blocking per-feature from Phase 4.* |
| V-3 | P2 | Spec catalog (`00` §10 / `13`) omits tables required elsewhere by the same spec: `customers`, `payment_links`, branding config, `api_keys`, `invitations` (invitations already exist in PG 006 — the **spec** is behind the implementation here). Handle via the documented expansion rule (`11` §P) + decisions; do not invent silently. |
| V-4 | P2 | `payment_intents` required by spec but absent from **both** databases — must be designed fresh in the Phase 4 schema wave (legacy has only a session model). |
| V-5 | P3 | `packages/contracts` types are consumed by no code — drift risk once payment events land; adopt or retire. |

## 4. Findings — legacy chain (MySQL)

| # | Sev | Finding |
|---|---|---|
| L-1 | P2 | **`001_core.sql` is wrapped in markdown code fences** (```` ```sql ````). A clean-database replay would fail at file 001. `002_v1_1_core.sql` duplicates its content cleanly. Existing environments were migrated historically, so this bites only when provisioning a fresh legacy environment. Fix (strip fences or skip 001) only under the legacy-freeze policy; never edit applied migrations' semantic content. |
| L-2 | P2 | Overlapping DDL: 001 vs 002 create the same tables; 005 vs 011 add overlapping columns. The runner tolerates it (skips existing columns/`IF NOT EXISTS`), but the migration history is not clean-room reproducible. |
| L-3 | P2 | **Float at provider boundary:** PayTabs adapter converts minor units with `Number(amount)/100` (`infrastructure/providers/paytabs.ts`). Storage stays `DECIMAL(30,0)`, but large amounts risk precision loss at the API boundary. Must not be ported to V4 adapters (use exact decimal string formatting). |
| L-4 | P3 | Risk thresholds use JS `Number` on amount minor units (`application/risk/service.ts`) — comparison only, not storage; note for the V4 risk port. |
| L-5 | P2 | **Dead wiring mismatches (API layer):** PayTabs callback handler and Zoho OAuth callback are auth-exempted but their routes are never registered; `/pay/:token` page has no pay handler; `provider_callbacks.signature_valid` is hardcoded `true` in the handler. Currently unreachable; trap-level risk if wired. |
| L-6 | P3 | Legacy `.bak` migration files (003–008) are inert (runner filters `*.sql`) but clutter the migration dir. |
| L-7 | P3 | Subscription renewal engine is constructed without a `PaymentProvider` in the worker — renewals deterministically fail into PAST_DUE; harmless in sandbox, misleading as a "feature". |

## 5. Cross-chain findings (UI ↔ API ↔ schema)

| # | Sev | Finding |
|---|---|---|
| X-1 | P1 | The only UI is bound to legacy `/v1` with hardcoded demo tenant/merchant UUIDs; it cannot exercise any V4 capability (KYB, master data, bank accounts all have APIs but no screens). |
| X-2 | P2 | Web console dispute-create sends field names that don't match the form state (payload bug). |
| X-3 | P3 | Money in UI is formatted from minor units in JS `Number` — acceptable for display; must not feed calculations. |
| X-4 | P3 | `VITE_REQUIRE_LOGIN` env var documented but never read. |

## 6. Specific checks requested

| Check | Result |
|---|---|
| Foreign keys | PG: 88 verified live. MySQL legacy: mostly indexes, few real FKs (schema style is loose; frozen). |
| Missing columns / relationships | None found within PG Phases 1–3 scope; V-3/V-4 are forward-looking spec gaps. |
| Duplicate models | Customers/products/payments exist only in legacy (single-generation each); no same-generation duplicates. |
| Status values | PG statuses enforced by CHECK + service state machines (tested). Legacy statuses are free-text-ish columns with app-level FSM (`domain/payments/payment-status.ts`). |
| Indexes / unique constraints | PG: 137 indexes, 91 unique/PK incl. partial uniques for live-case/default-account/fingerprint/idempotency. Legacy: adequate for sandbox use. |
| Money types | PG `NUMERIC(30,0)` minor units; MySQL `DECIMAL(30,0)` minor units; **no FLOAT/DOUBLE columns in either schema**. Only L-3/L-4 JS-side conversions flagged. |
| Currency handling | PG: `CHAR(3)` with FK to `master_currencies(code)` where master exists. Legacy: `CHAR(3)`/VARCHAR without FK (frozen). |
| Timestamps | PG `TIMESTAMPTZ` + `created_at/updated_at` everywhere; append-only tables trigger-protected. MySQL `TIMESTAMP(6)`. |
| Tenant isolation | PG: `organization_id` on every tenant table + tested isolation. Legacy: `tenant_id` scoping in queries (app-enforced). |
| Idempotency constraints | PG: `idempotency_keys` + partial unique on outbox (012). Legacy: `idempotency_records` table. |
| Financial transaction integrity | PG: N/A yet (no financial mutations until Phase 7). Legacy: ledger balanced-entry assertion + DECIMAL storage — real, sandbox-scoped. |

## 7. Actions (no manual DB changes made — none needed)

1. (P1, per-feature from Phase 4) Build V4 UI per feature on `/api/v1` — tracked in `V4-IMPLEMENTATION-SEQUENCE.md`.
2. (P2) Under the legacy-freeze note: document L-1/L-2/L-5 as known frozen defects; fix only if a fresh legacy environment is ever required.
3. (P2) Phase 4 schema wave must add the spec-required missing tables (V-3, V-4) via new PG migrations 013+, with decisions recorded where the spec is silent.
4. (P3) Decide adopt-or-retire for `packages/contracts` when payment events are designed.
