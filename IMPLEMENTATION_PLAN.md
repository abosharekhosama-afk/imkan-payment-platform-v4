# IMPLEMENTATION PLAN — IMKAN Payments V4

**Phase status:** Analysis complete; **execution not started**  
**Date:** 2026-08-08  
**Order (verbatim from V4 §2):**  
`Foundation → Identity/Tenant → Merchant/KYB → Payments → Providers → Billing → Financial Core → Risk/Disputes → Books → Security/Production`

---

## 1. Governing rules

- V4 New-folder `00` + `11`–`13` are authoritative.
- Do **not** invent Business / Financial / Provider rules; open Decisions.
- PostgreSQL only; migrations only; NUMERIC money + currency; no PAN/CVV.
- Server-side AuthZ; no cross-tenant access; financial ops idempotent; webhooks signed + replay-safe.
- Mock/Sandbox ≠ real money.
- Every significant operation → `docs/implementation/<operation>.md`.
- Critical defects block phase advance.

### Definition of Done (per feature)

Implementation + Database + API + Authorization + Validation + Security + Tests + Documentation + Production-readiness assessment (V4 §2 / `11` §R).

---

## 2. Decision gates (must clear before dependent work)

| Gate | Decisions | Blocks |
|---|---|---|
| G0 | DEC-001 money storage, DEC-002 API prefix, DEC-005 auxiliaries | Foundation schema conventions |
| G1 | DEC-003 customers/payment_links DDL, DEC-004 master data set | Merchant/KYB + Payments schema finalization |
| G2 | DEC-006 customer matching | Customer domain |
| G3 | DEC-007 subscription rules | Billing phase financial behavior |
| G4 | DEC-008 fees/reserves/settlement/rounding/FX | Financial Core numeric policies |
| G5 | DEC-009 provider capabilities (per provider) | Activating that provider adapter |
| G6 | DEC-010 KYB vendors, DEC-011 PCI scope | KYB external verify / card collection boundary |
| G7 | DEC-012 sandbox/live switch policy, DEC-013 OAuth scope | Admin/Merchant env UX + Developer OAuth |
| G8 | DEC-014 legacy data retention | Any MySQL→PG data migration |

**Safe before G0:** analysis docs (done), scaffolding that does not encode money rules.

---

## 3. Phase plan

### Phase 0 — ANALYSIS / GAP ANALYSIS (current)

**Status:** Complete (this document set)

Deliverables:
- `ARCHITECTURE_MAP.md`
- `PROJECT_GAP_ANALYSIS.md`
- `IMPLEMENTATION_PLAN.md`
- `DATABASE_MIGRATION_PLAN.md`
- `SECURITY_IMPLEMENTATION_PLAN.md`
- `TEST_PLAN.md`
- `docs/decisions/OPEN_ISSUES.md`
- `docs/implementation/00-ANALYSIS-PHASE.md`

Exit criteria: gaps, conflicts, reuse, rebuild, and open issues documented; no production code required.

---

### Phase 1 — Foundation

**Goal:** V4-ready modular monolith skeleton on PostgreSQL.

Work:
1. Introduce PostgreSQL as primary DB (Docker/local Windows).
2. New migration runner for PostgreSQL (do not edit prod manually).
3. Establish domain package boundaries and shared contracts.
4. Config/env separation: `sandbox` vs `production` (credentials never mixed).
5. Base security middleware: Helmet/CORS/rate-limit/request IDs (extend existing patterns).
6. Structured logging + redaction.
7. Testing harness + docs folder tree per V4 §20.
8. Health/readiness against PostgreSQL.
9. Mark MySQL path deprecated; do not delete until DEC-014 impact assessed.

Tests: migration apply/rollback smoke; config isolation; health; lint/typecheck.  
Docs: `docs/implementation/01-foundation.md`, `docs/architecture/` as needed.  
**No financial business rules invented.**

Exit: clean PG bootstrap; CI/test skeleton green; no critical defects.

---

### Phase 2 — Identity / Tenant

**Goal:** AuthN/AuthZ chain: User → Session → Organization → Role → Permission → Ownership.

Work:
1. Tables: users, sessions, roles, permissions, role_permissions, user_roles, organizations, organization_users, organization_settings, login_events, security_events (subset).
2. Registration, email verification, login/logout, password reset/change.
3. MFA + step-up hooks (sensitive ops later bind to step-up).
4. Invitations + membership.
5. Seed V4 platform/merchant role catalog (codes from V4 §4).
6. Remove/disable production use of `X-Tenant-ID` bypass.
7. Server-side permission middleware default-deny for protected routes.

Tests: AuthZ matrix; cross-tenant denial; session abuse; lockout/rate limits.  
Docs: `docs/implementation/02-identity-tenant.md`, security notes.

Exit: no cross-tenant access in identity APIs; RBAC enforced.

---

### Phase 3 — Merchant / KYB

**Goal:** Real onboarding + verification engine (adapters only for external KYB).

Work:
1. KYB tables per catalog; documents metadata (no secrets in plaintext).
2. Legal/business/people/tax/bank capture wizards (Merchant UI).
3. Verification case states: DRAFT → … → APPROVED/REJECTED/SUSPENDED.
4. Admin KYB review APIs/UI.
5. Payout accounts + verification + masked views + step-up change flow (financial amounts still limited until Financial Core).
6. Master Data APIs consumed by forms (after DEC-004).
7. Customers domain skeleton (matching only after DEC-006).

Tests: KYB happy/reject/needs-info; document validation; tenant isolation; Admin vs Merchant AuthZ.  
**Block:** inventing external KYB vendor behavior (DEC-010).

Exit: end-to-end onboarding path in sandbox without fabricated compliance decisions.

---

### Phase 4 — Payments

**Goal:** Intent → Session → Attempt → Provider → Capture → Payment → events; Payment Links; Checkout; Methods; Refunds.

Work:
1. Schema: payment_intents, sessions, attempts, payments, methods, refunds, refund_items (+ links/customers per DEC-003).
2. Port state machine + idempotency + TX patterns from V3.
3. Hosted checkout + branding (XSS-safe).
4. Payment Links lifecycle per `11` §E.
5. Refund ≤ captured invariant tests.
6. Public result pages; AR/EN RTL basics.

Tests: API + UI + AuthZ + financial invariants + error paths.  
Provider calls may use **Sandbox adapter only** until Phase 5 activations.

Exit: sandbox payment + refund journeys green with docs.

---

### Phase 5 — Providers

**Goal:** Router + Adapter SDK + webhooks + health; activate only documented capabilities.

Work:
1. Tables: providers, provider_accounts, credentials metadata, capabilities, routes, provider_transactions.
2. Provider Router with idempotency-safe fallback (no double charge).
3. Inbound webhook pipeline: signature → replay → idempotency → persist → process.
4. Per-provider docs under `docs/providers/<name>/` before activation.
5. Port/rebuild PayTabs only against verified docs; other providers gated by DEC-009.
6. Sandbox vs live credential isolation tests.

Tests: forged/replay webhooks; capability denial; routing; adapter contract tests.  
Exit: at least Sandbox + one verified adapter path with full docs/tests.

---

### Phase 6 — Billing

**Goal:** Products, Prices, Subscriptions, Invoices, recurring charges.

Work:
1. Schema + domain ops (create/activate/renew/pause/resume/cancel/upgrade/downgrade).
2. Implement only after DEC-007 (renewal/retry/invoice/ledger effects).
3. Webhook/event emission; AuthZ; tenant isolation.

Tests: billing state machine; failed payment handling per decided rules; API/UI.  
Exit: decided rules implemented + documented; no guessed dunning.

---

### Phase 7 — Financial Core

**Goal:** Ledger SoT; balances; settlement; payout; fees; reserves; reconciliation.

Work:
1. Align ledger schema to V4 names; port double-entry engine to PG NUMERIC policy (DEC-001/008).
2. Derived balances: Available / Pending / Reserved / Total.
3. Settlement → Payout lifecycle; payout ≤ eligible balance.
4. Fees/reserves **only** with DEC-008 values/rules.
5. Reconciliation records + auditability.
6. Concurrency/locking + idempotency for all money mutations.

Tests: financial abuse suite; race tests; ledger consistency; webhook duplicate no double effect.  
Exit: invariants hold under concurrent tests; docs/financial updated.

---

### Phase 8 — Risk / Disputes

**Goal:** Risk rules, assessments, dispute lifecycle, evidence, reserve interactions (per decided policies).

Work:
1. Risk domain + Admin risk rules UI.
2. Disputes linked to payments; AuthZ; audit.
3. No invented hold percentages — Decision if unspecified.

Tests: unauthorized dispute actions; cross-tenant; financial side-effects if any.  
Exit: risk/dispute flows documented and tested.

---

### Phase 9 — Books

**Goal:** Generic Books Connector via outbox.

Work:
1. Books Connector interface; worker; idempotent sync states.
2. Map customers/payments/invoices/refunds/fees/settlements/payouts/reconciliation (+ payment links if decided).
3. Zoho becomes an adapter behind the interface (reuse client code carefully).
4. Failure recovery + reconciliation/sync status APIs.

Tests: duplicate event no duplicate books effect; retry; AuthZ on sync status.  
Exit: connector contract + at least one adapter path documented.

---

### Phase 10 — Security / Production

**Goal:** Production gate from V4 §21.

Work:
1. Full security test campaign (see `SECURITY_IMPLEMENTATION_PLAN.md` / `TEST_PLAN.md`).
2. Dependency scanning; secret leakage review.
3. Backup/restore drills.
4. Sandbox/live isolation audit.
5. Final documentation pack + `V4-IMPLEMENTATION-STATUS` style tracker.
6. Production approval checklist — **no claim of Production Ready without evidence**.

Exit: critical findings closed; approval record in `docs/security/` + `docs/deployment/`.

---

## 4. Cross-phase engineering standards

| Topic | Standard |
|---|---|
| Money | NUMERIC/DECIMAL; currency column/field always present; no float |
| TX | DB transactions for financial mutations |
| Idempotency | Required for financial mutations |
| AuthZ | Default deny; resource ownership checks |
| Tenancy | Every query constrained by organization context |
| Providers | Adapter interface only; capability-gated |
| UI | Server remains source of AuthZ; portals consume Master Data APIs |
| Docs | Update implementation record before phase close |
| Legacy | Do not delete working V3 paths until impact analysis for that phase |

---

## 5. Suggested workstream parallelism (within a phase)

Safe parallel tracks after Foundation:
- **Track A:** Schema migrations + domain services
- **Track B:** API contracts + AuthZ middleware tests
- **Track C:** UI portal screens for that domain
- **Track D:** Docs/implementation + decisions

Do not parallelize a later phase ahead of an incomplete prior phase with critical defects.

---

## 6. Immediate next step after analysis

1. Review `docs/decisions/OPEN_ISSUES.md` (especially DEC-001–DEC-005).
2. On approval, start **Phase 1 Foundation** only.
3. Create `docs/implementation/01-foundation.md` at phase start and close it at exit.

---

## 7. Out of scope until explicitly decided

- Invented fee schedules / FX / rounding modes
- Undocumented provider APIs or capabilities
- Treating sandbox simulation as production money movement
- Manual production schema edits
- Full OAuth authorization server (unless DEC-013 expands scope)
