# DATABASE MIGRATION PLAN — IMKAN Payments V4

**Phase:** ANALYSIS ONLY  
**Date:** 2026-08-08  
**Mandate:** PostgreSQL is the primary relational system of record (V4 §10).  
**Rule:** No direct production schema edits — migrations only.

---

## 1. Current state (V3.4.1)

| Attribute | Current |
|---|---|
| Engine | MySQL 8.4 |
| Access | `mysql2` pool, raw SQL, `tx()` helper |
| Migrations | `database/migrations/000`–`011` (+ `.bak` duplicates) |
| Runner | `apps/api/src/scripts/migrate.ts` → `schema_migrations` |
| Tenancy | `tenant_id` CHAR(36) on most tables |
| Money | `DECIMAL(30,0)` minor units |
| IDs | CHAR(36) UUID strings |

### Current migration inventory

| File | Role (high level) |
|---|---|
| `000_v3_3_core_bootstrap.sql` | tenants, merchants, customers, payments core, ledger, payouts, settlements, idempotency, outbox, audit |
| `001_core.sql` / `002_v1_1_core.sql` | Overlapping legacy core (duplication risk) |
| `003_production_foundation.sql` | Production foundation |
| `004_payment_core_phase2.sql` | Payment core phase 2 |
| `005_phase3_processor_ready.sql` | Processor readiness |
| `006_platform_completion.sql` | fees, risk, disputes, billing extras |
| `007_real_integrations.sql` | integration_connections, provider_callbacks |
| `008_production_controls.sql` | production controls |
| `009_v3_3_error_reporting.sql` | error_reports |
| `010_v3_4_identity_and_dev_seed.sql` | identity + demo seed |
| `011_v3_5_payment_schema_compatibility.sql` | compatibility |

**Risk:** Overlapping CREATE TABLE history and `.bak` files make MySQL chain unsuitable to “translate line-by-line” into PostgreSQL. Prefer a **new V4 PostgreSQL migration chain** with a controlled data migration path (DEC-014).

---

## 2. Target state (V4)

### 2.1 Engine and rules

- PostgreSQL
- Exact NUMERIC/DECIMAL money + explicit currency
- UTC timestamps (`timestamptz`)
- FK/unique/check constraints + indexes
- Concurrency via transactions + row locks (`SELECT … FOR UPDATE` where needed)
- Least-privilege DB roles
- No raw PAN/CVV columns
- Secrets: metadata/references only; ciphertext via KMS/app crypto — never plaintext provider secrets in tables meant for display

### 2.2 Target table catalog (from `00` §10 / `03` / `13`)

**Identity:** users, sessions, roles, permissions, role_permissions, user_roles  

**Tenancy:** organizations, organization_users, organization_settings  

**KYB:** merchant_profiles, company_legal_profiles, business_profiles, beneficial_owners, directors, authorized_representatives, verification_cases, verification_results, documents  

**Banking:** payout_accounts, payout_account_verifications  

**Payments:** payment_intents, payment_sessions, payment_attempts, payments, payment_methods, refunds, refund_items  

**Billing:** products, prices, subscriptions, subscription_items, invoices, invoice_items  

**Financial:** ledger_accounts, ledger_transactions, ledger_entries, balances, settlements, payouts, fees, reserves, reconciliation_records, disputes  

**Providers:** providers, provider_accounts, provider_credentials_metadata, provider_capabilities, provider_routes, provider_transactions  

**Events:** outbox_events, webhook_events, webhook_deliveries, idempotency_keys  

**Audit:** audit_events, security_events, login_events  

**Master Data:** master_countries, master_currencies, master_business_types, master_industries, master_document_types, master_tax_types, master_payout_methods, master_payment_method_types, master_provider_types, master_provider_capabilities, master_fee_types, master_risk_categories, master_webhook_event_types, master_address_types, master_identification_types  

### 2.3 Catalog gaps requiring Decision (do not invent DDL beyond field lists)

| Missing vs product | Spec signal | Decision |
|---|---|---|
| `customers` | Required in UI/`11` §H; not in `03`/`13` | DEC-003 |
| `payment_links` | Required in `11` §E with field list; not in `03`/`13` | DEC-003 |
| `master_settlement_types` | Concept in `00` §9; not in table list | DEC-004 |
| Extra master tables from Downloads | phone_country_codes, subscription_plan_types | DEC-004 |
| Checkout branding storage table(s) | `11` §G requires PG storage | Include in Payments/Merchant migrations after naming Decision (safe structural) |

Per `11` §P, final schema work must document for each table: purpose, columns, PG types, null/default, PK/FK/unique/indexes, tenant ownership, security classification, lifecycle, audit.

---

## 3. Strategy: new PostgreSQL chain (recommended)

### 3.1 Principles

1. **Do not** mechanically convert MySQL dumps as the SoT schema.
2. Create `database/migrations/postgres/` (or replace chain after freeze) with ordered V4 migrations.
3. Keep MySQL migrations readable as **historical reference** until DEC-014 closes.
4. Use a `schema_migrations` (or equivalent) table in PostgreSQL.
5. Separate **schema migrations** from **data migrations** and **seed** (Master Data + role catalog).

### 3.2 Proposed migration waves

| Wave | Migration set | Contents | Phase |
|---|---|---|---|
| W0 | `V4_000_init` | extensions (`pgcrypto`/`uuid-ossp` as chosen), schema_migrations, conventions | Foundation |
| W1 | `V4_001_identity_tenant` | users/sessions/RBAC/organizations/membership/settings/login_events | Identity |
| W2 | `V4_002_master_data` | all approved `master_*` + seed codes | Foundation/Merchant |
| W3 | `V4_003_kyb_banking` | KYB + documents + payout_accounts | Merchant/KYB |
| W4 | `V4_004_customers_links` | customers + payment_links (**after DEC-003**) | Merchant/Payments |
| W5 | `V4_005_payments` | intents/sessions/attempts/payments/methods/refunds | Payments |
| W6 | `V4_006_billing` | products/prices/subscriptions/invoices | Billing |
| W7 | `V4_007_financial` | ledger/balances/settlements/payouts/fees/reserves/reconciliation/disputes | Financial |
| W8 | `V4_008_providers_events` | providers* + outbox/webhooks/idempotency | Providers |
| W9 | `V4_009_audit_security` | audit_events, security_events expansions, error/incident tables | Security |
| W10 | `V4_010_books` | books sync state tables if needed | Books |

Exact filenames will be created in implementation phases; this wave map is the plan.

---

## 4. Mapping: current tables → V4 targets

| Current (MySQL) | V4 target | Action |
|---|---|---|
| `tenants` | `organizations` | Rebuild; map fields carefully |
| `merchants` | `merchant_profiles` (+ org link) | Split legal/business later |
| `users`, `roles`, `permissions`, `user_roles`, `user_sessions` | users/sessions/RBAC | Port concepts; sessions rename |
| `customers` | `customers` (**DEC-003**) | Preserve concept |
| `payment_sessions`, `payment_attempts`, `payments`, `refunds` | same + `payment_intents`, `refund_items` | Extend model |
| `payment_links`, `payment_pages` | payment_links + checkout branding | Align to `11` |
| `payment_methods`, token vault usage | `payment_methods` | Keep tokenized only |
| `ledger_*`, `account_balances` | `ledger_*`, `balances` | Rename/align derived model |
| `settlements`, `payouts`, `bank_accounts` | settlements, payouts, payout_accounts | Rebuild banking verification |
| `idempotency_records` | `idempotency_keys` | Rename |
| `outbox_events`, `webhook_*` | outbox_events, webhook_events, webhook_deliveries | Align inbound/outbound |
| `audit_logs`, `security_events`, `error_reports` | audit_events, security_events, admin error center | Split concerns |
| `products`, `prices`, `subscriptions`, `invoices` | + subscription_items, invoice_items completeness | Align |
| `fee_rules`, `risk_*`, `disputes` | fees, risk (TBD tables), disputes | Map without inventing fee math |
| `provider_callbacks`, `integration_*` | provider_transactions, webhook_events, books sync | Generalize |
| `regional_policies` | org settings + Master Data | Decision on residual regional table |
| `mfa_challenges`, `api_keys` | keep equivalents under identity/developer | Port |

---

## 5. Money model migration (Decision-gated)

### Current

- Amount columns: `*_minor DECIMAL(30,0)`
- Application: `BigInt` minor units
- Currency: usually adjacent `CHAR(3)`

### V4 requirement

- NUMERIC/DECIMAL exact money
- Explicit currency with every amount
- No floating point

### Options for DEC-001 (do not pick silently in code)

| Option | Description | Notes |
|---|---|---|
| A | Keep integer minor units as `NUMERIC(30,0)` + `currency` | Closest to current; still exact |
| B | Major-unit `NUMERIC(30,N)` + `currency` with fixed N per currency | Needs rounding/scale rules (DEC-008) |
| C | Hybrid store minor + display scale from `master_currencies` | Needs Master Data currency scale fields |

**Until DEC-001/008 resolved:** Foundation migrations may create non-money tables; money columns appear only with an approved option.

---

## 6. Data migration approach (DEC-014)

### If no production data must be preserved

- Greenfield PostgreSQL schema + Master Data/role seeds
- Keep MySQL tree archived under `database/legacy-mysql/` (move later, don’t delete blindly)

### If data must be preserved

1. Freeze MySQL writes.
2. Export mapped tables with transform scripts (tenant→organization, minor money policy).
3. Validate row counts, ledger balance invariants, orphan checks.
4. Dual-read verification in staging.
5. Cutover checklist in `docs/deployment/`.

**No production cutover in early phases.**

---

## 7. Seed strategy

| Seed | Content | When |
|---|---|---|
| Roles/permissions | V4 platform + merchant roles | Identity |
| Master Data | stable codes + localized labels | After DEC-004 |
| Sandbox provider row | provider definition + sandbox capabilities | Providers |
| Dev org (non-prod only) | optional local developer org | Foundation/Identity — never production secrets |

Seeds must be idempotent and environment-safe.

---

## 8. Compatibility and dual-run

During transition:

| Mode | Allowed |
|---|---|
| Local/dev PG | Yes (target) |
| Legacy MySQL | Read-only reference / optional bridge until DEC-014 |
| Mixed money engines in one env | **No** |
| Manual ALTER on production | **No** |

Application data-access should move behind a repository/port so MySQL can be removed without rewriting domain logic twice.

---

## 9. Verification checklist (each migration wave)

- [ ] Migration applies cleanly on empty PG
- [ ] Migration is re-runnable safely (IF NOT EXISTS / guarded)
- [ ] Down/rollback strategy documented (or forward-fix only policy stated)
- [ ] FKs/indexes/uniques present
- [ ] Tenant/org ownership column strategy enforced
- [ ] Money columns use approved NUMERIC form + currency
- [ ] No PAN/CVV columns
- [ ] Privilege roles documented
- [ ] Tests cover schema expectations for that wave
- [ ] `docs/implementation` updated

---

## 10. Open schema issues

Tracked in `docs/decisions/OPEN_ISSUES.md`: DEC-001, DEC-003, DEC-004, DEC-008, DEC-014, plus branding table naming and residual `regional_policies` mapping.
