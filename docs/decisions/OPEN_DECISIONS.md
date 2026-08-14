# OPEN / RESOLVED DECISIONS — IMKAN Payments V4

**Last updated:** 2026-08-14  
**Rule:** Do not invent Financial / Security / Provider behavior beyond recorded decisions.

Legacy tracker: `docs/decisions/OPEN_ISSUES.md` (superseded for status; kept for history).

---

## Status legend

| Status | Meaning |
|---|---|
| RESOLVED | Baseline approved; implement accordingly |
| OPEN | Needs approval before dependent work |
| DEFERRED | Intentionally postponed |
| INTERIM | Approved temporary rule; may be revised later |

---

## DEC-001 — Money Storage

| Field | Value |
|---|---|
| **Status** | **RESOLVED** (baseline 2026-08-08) |
| **Decision** | Store all monetary amounts as PostgreSQL `NUMERIC(30,0)` representing **integer minor units** (smallest currency unit). Every amount **MUST** have an accompanying ISO 4217 `currency CHAR(3)` (column or equally explicit structured field). Application arithmetic MUST be exact (no `number` float for money). Financial mutations MUST be transaction-safe. |
| **Reason** | Satisfies V4 “no floating-point money” + “explicit currency”; preserves exactness; aligns with existing V3 minor-unit model for safer future data mapping; avoids inventing FX/rounding major-unit scale rules (still OPEN under DEC-008). |
| **Impact** | All future amount columns/APIs use `{ amount: string\|NUMERIC, currency }`; DB Spec documents unified `NUMERIC(30,0)` + `currency`; display/formatting may use `master_currencies` scale later without changing storage. |
| **Rejected alternatives** | `float`/`double`; major-unit `NUMERIC(p,s)` without approved rounding/FX policy; storing amounts without currency; JSON-only money without typed columns. |
| **Notes** | Fee schedules, FX, and rounding modes: see **DEC-008 RESOLVED** (`docs/decisions/DEC-008-FINANCIAL-MODEL.md`). FX remains deferred. |

---

## DEC-002 — API Versioning

| Field | Value |
|---|---|
| **Status** | **RESOLVED** (baseline 2026-08-08) |
| **Decision** | Public platform API base path is **`/api/v1/`**. Design must allow `/api/v2/` later without breaking v1. Unify authentication, authorization, idempotency, pagination, filtering, errors, and request IDs across v1. |
| **Reason** | Matches older API contract sketches; clear versioning; avoids coupling clients to unversioned paths. |
| **Impact** | New V4 routes mount under `/api/v1`. Legacy `/v1` (MySQL-era) remains temporarily for compatibility and MUST NOT be treated as the V4 contract. Shared middleware enforces authz/tenant/idempotency/error shape. |
| **Rejected alternatives** | Keeping `/v1` as canonical V4 path; unversioned `/api/`; breaking changes in place without a new major version. |

---

## DEC-003 — Customers / Payment Links

| Field | Value |
|---|---|
| **Status** | **RESOLVED** (baseline 2026-08-08) |
| **Decision** | `customers` and `payment_links` are **first-class domain tables**. Do not embed customer or payment-link data inside `payments` as a temporary workaround. Both MUST be scoped by `organization_id`, with tenant isolation + RBAC. Payment Links MUST have lifecycle, API, Checkout integration, Audit, and Events. |
| **Reason** | Required by product/`11` expansion; catalog omission was a spec gap, not a product exclusion. |
| **Impact** | Schema waves include these tables. Customer unique-matching algorithm: see **DEC-006 INTERIM**. Payment Link field/status baseline follows `11` §E. |
| **Rejected alternatives** | JSON blobs on payments; link-only tokens without a table; omitting org scoping. |

---

## DEC-004 — Master Data

| Field | Value |
|---|---|
| **Status** | **RESOLVED** (baseline 2026-08-08) |
| **Decision** | PostgreSQL is the system of record for Master Data. Countries, currencies, company types, industries, document types, payment methods, and related reference sets are Admin-manageable, use **stable codes**, support **active/inactive or retirement** (no hard-delete of historically referenced codes), and support **localization** where required. |
| **Reason** | V4 §9–§10 / non-negotiable “no unnecessary hardcoded master data”. |
| **Impact** | Forms consume Master Data via APIs; Admin CRUD for safe records; seed stable codes. |
| **Rejected alternatives** | Hardcoded UI enums as SoR; destructive delete of in-use codes; free-text-only reference values for controlled lists. |

---

## DEC-006 — Customer unique matching (interim)

| Field | Value |
|---|---|
| **Status** | **INTERIM** (approved 2026-08-09 for Phase 6) |
| **Decision** | V4 `customers` table is tenant-scoped by `organization_id`. Uniqueness: **`(organization_id, lower(email)) WHERE email IS NOT NULL`**. No automatic customer merging. Email may be null (no uniqueness among nulls). This interim may be revised later (phone/external id) without inventing merge algorithms now. |
| **Reason** | Unblocks Billing subscriptions/invoices; DEC-003 requires first-class customers. |
| **Impact** | Phase 6 customer APIs enforce this uniqueness; document limitation in Billing docs. |
| **Rejected alternatives** | Silent merge; org-global email without tenant scope; inventing fuzzy match. |

---

## DEC-007 — Subscription renewal / invoice / retry / ledger effects

| Field | Value |
|---|---|
| **Status** | **RESOLVED** (approved 2026-08-09 — Option A: Billing Collection + Deferred Ledger) |
| **Decision** | See approved policy below. |
| **Impact** | Phase 6 Billing renewals implement this policy. Ledger/settlement/payout remain Phase 7. |
| **Rejected alternatives** | Full ledger coupling in Phase 6; catalog-only Billing without renewal worker; inventing tax/fee engines (DEC-008). |

### Approved DEC-007 policy

1. **Renewal timing:** Process when `next_billing_at <= NOW()` (UTC); only eligible subscription statuses; concurrency-safe + idempotent.
2. **Invoice generation:** Exactly one invoice per subscription billing period; DB uniqueness prevents duplicates; DEC-001 money; no invented tax/fees.
3. **Payment collection:** `Billing → Payment Core → Provider Router → Provider Adapter` only. Phase 6 Sandbox only. No live recurring claims.
4. **Retry policy:** Max **3** collection attempts per invoice/period. Backoff: Attempt 1 immediate; Attempt 2 after **5 minutes**; Attempt 3 after **10 minutes**. No blind retries.
5. **Ambiguous/timeout:** Query-before-retry (Phase 5). Never second charge solely due to timeout/ambiguity. Keep idempotency keys + provider transaction refs.
6. **Failed payments:** → subscription `PAST_DUE`; invoice open/overdue per invoice SM; after max retries → `UNPAID`; **3-day grace**; then → `EXPIRED`. Respect `cancel_at_period_end`.
7. **Success:** Invoice `PAID`; subscription `ACTIVE`; advance period; clear retry state; emit outbox events.
8. **Ledger boundary:** **NO** ledger/balances/settlement/payout/reconciliation/fee posting in Phase 6.

Also approved with Phase 6: upgrade/downgrade/proration **OUT OF MVP**; V4 UI on `/api/v1` **IN SCOPE**; legacy frozen; Phase 7 not auto-started; DEC-009 still required before live recurring.

---

## DEC-014 — MySQL legacy / data migration

| Field | Value |
|---|---|
| **Status** | **RESOLVED** (process baseline 2026-08-08) |
| **Decision** | **Do not delete MySQL. Do not run automatic production data migration.** First deliver discovery + `DATA_MIGRATION_ANALYSIS.md`. **No production migration without explicit approval.** |
| **Impact** | PostgreSQL alongside MySQL. Legacy feature-frozen (`LEGACY_V3_FREEZE.md`). |

---

## DEC-017 — Email / notification transport (Phase 2 note)

| Field | Value |
|---|---|
| **Status** | **OPEN** (safe interim applied) |
| **Interim design** | Emit `email.*` / `invitation.*` outbox events; worker marks PROCESSED without calling an invented SMTP/provider API. Dev may expose one-time tokens when `EXPOSE_DEV_TOKENS` and non-production. |
| **Reason** | Spec requires verification/reset/invites but does not name an email vendor. |
| **Impact** | Production email delivery blocked until vendor + adapter docs approved. |
| **Rejected** | Hardcoding SendGrid/SES/etc. capabilities without Decision. |

---

## Still OPEN (not guessed)

| ID | Topic | Status | Blocks |
|---|---|---|---|
| DEC-005 | Redis/queues/object storage auxiliaries | OPEN (safe default: PG SoR; auxiliaries optional non-SoR) | Queue/object-storage adoption |
| DEC-008 | Fees, reserves, settlement cutoffs, rounding, FX | **RESOLVED** (P15.1-A) — see `docs/decisions/DEC-008-FINANCIAL-MODEL.md`. FX/tax/rolling-reserves **deferred**. | Was blocking fee engine; model now shippable |
| DEC-009 | Per-provider capability matrices | **PARTIAL** (PayTabs sandbox P15.3) | Activating **LIVE** providers / live recurring |
| DEC-010 | External KYB vendors | OPEN | Automated KYB vendor claims |
| DEC-011 | PCI scope document | OPEN | Production card acceptance |
| DEC-012 | Sandbox↔Live merchant switch policy | OPEN | Env toggle UX |
| DEC-013 | OAuth product scope | OPEN | Full OAuth server |
| DEC-015 | `regional_policies` mapping | OPEN | Regional automation beyond Master Data |
| DEC-016 | Books system target (Zoho vs internal) | OPEN | Books adapter priority |

If a new material decision appears during implementation, add it here and pause when it affects Financial / Security / Provider behavior pending approval.

---

## DEC-009 — Provider capability matrices (P15.3 update)

| Field | Value |
|---|---|
| **Status** | **PARTIAL** (2026-08-10 — PayTabs sandbox adapter) |
| **Decision** | PayTabs integrated via `ProviderAdapter` + Router; SANDBOX only. Capability matrix in `docs/providers/PROVIDER_CAPABILITY_MATRIX.md`. LIVE activation remains blocked until separate approval + credentials plane. |
| **Evidence** | Migration 034, P15.3 tests (195/195 PASS), `PAYTABS_SANDBOX_CERTIFICATION.md` |
| **Impact** | Orgs can bind PayTabs sandbox routes; Internal Sandbox unchanged. Production Gate still NOT PASSED. |
| **Still OPEN** | LIVE PayTabs, all other live providers, live recurring, **real E2E cert (P15.5 blocked on credentials + public webhook)** |

---

## P15.4 — Real PayTabs Sandbox (2026-08-10)

| Field | Value |
|---|---|
| **Status** | **PARTIAL / BLOCKED** |
| **Decision** | Real sandbox HTTP certification infrastructure ready; execution blocked until merchant provides `PAYTABS_SANDBOX_SERVER_KEY` + `PAYTABS_SANDBOX_PROFILE_ID` via SecretResolver and public webhook URL. |
| **Evidence** | P15.4 tests 214/214 PASS + 2 skipped; see `P15_4_FINAL_AUDIT.md` |
| **Impact** | No LIVE activation. Production Gate unchanged. |

---

## P15.5 — Real PayTabs Sandbox E2E (2026-08-10)

| Field | Value |
|---|---|
| **Status** | **PARTIAL / BLOCKED** |
| **Decision** | Preflight gating + credential-gated E2E test harness delivered. Real HTTP/HPP/webhook/refund execution blocked until merchant sandbox credentials + public HTTPS webhook endpoint available. PayTabs native idempotency not documented — IMKAN-side idempotency only. |
| **Evidence** | P15.5 tests 224/224 PASS + 8 skipped; preflight CLI exit 2; see `P15_5_FINAL_AUDIT.md` |
| **Impact** | PayTabs remains **SANDBOX_TESTED**, not **CERTIFIED**. Production Gate unchanged. P15.6 / LIVE not started. |
| **Blockers** | `PAYTABS_SANDBOX_SERVER_KEY`, `PAYTABS_SANDBOX_PROFILE_ID`, `PAYTABS_REAL_SANDBOX_CERT=true`, public HTTPS callback + webhook endpoint |

---

## DEC-018 — Direct Merchant Settlement (target architecture)

| Field | Value |
|---|---|
| **Status** | **OPEN** (recorded 2026-08-14 — analysis only; not implemented) |
| **Decision (proposed, not approved)** | Target: each organization charges a **merchant-owned** provider account when the provider supports it. IMKAN is orchestration + platform fee, not the default pooled acquiring account in Production. Internal Sandbox (and optional SANDBOX-only shared platform accounts) remain allowed. LIVE must not silently use `organization_id IS NULL` Stripe/PayTabs credentials for all tenants. |
| **Stripe (proposed)** | Connect **Direct Charges** on Connected Accounts + hosted Checkout; IMKAN fee via `application_fee_amount`. Reject Destination Charges / SCT as default if the product goal is “funds never hit IMKAN’s Stripe balance.” |
| **PayTabs (proposed)** | Prefer per-org `profile_id` whose settlement IBAN is the merchant’s **if** Account Manager confirms. Else PSP **Split Payout** (EXTERNAL_REQUIREMENT: PSP contract + AM enablement). |
| **Palestine (proposed)** | Per-merchant Bank of Palestine MID + current account as primary ILS rail once private API exists. Jawwal Pay / PalPay only after partner documentation. Do not invent adapters. |
| **Ledger (proposed)** | Distinguish PAYMENT_SUCCEEDED / SETTLED / PAYOUT_* ; ledger credit is not bank receipt; `merchant_payable` as IMKAN cash debt applies to **pooled** rails only. |
| **Rejected for this phase** | Migrations; Payment Core / Ledger / adapter code; LIVE; P15.6; money movement. |
| **Evidence** | `docs/architecture/DIRECT_MERCHANT_SETTLEMENT_ARCHITECTURE.md`, `DIRECT_MERCHANT_SETTLEMENT_GAP_ANALYSIS.md`, `docs/providers/DIRECT_SETTLEMENT_PROVIDER_MATRIX.md`, `docs/implementation/DIRECT_MERCHANT_SETTLEMENT_ROADMAP.md` |
| **Still OPEN** | Legal MoR/facilitator; PayTabs AM commercial model; BOP/Jawwal/PalPay partner packs; Connect Express vs Standard mix; whether any LIVE pooled rail remains as exception. |

---

## DEC-019 — Stripe Connect charge type

| Field | Value |
|---|---|
| **Status** | **OPEN** |
| **Question** | Confirm Direct Charges (recommended) vs Destination vs SCT. Analysis recommends Direct Charges. Do not implement until approved. |

---

## DEC-020 — PayTabs profile-per-merchant vs PSP split

| Field | Value |
|---|---|
| **Status** | **OPEN** |
| **Question** | Written AM confirmation: dedicated settling profile per IMKAN org vs IMKAN-as-PSP Split Payout. Palestine host/contract separately. |

---

## DEC-021 — Palestinian MID-per-merchant

| Field | Value |
|---|---|
| **Status** | **OPEN** |
| **Question** | Confirm each Palestinian company signs its own BOP (and/or Jawwal/PalPay) merchant agreement. Facilitator/single-MID program only if the bank documents it in writing. |
