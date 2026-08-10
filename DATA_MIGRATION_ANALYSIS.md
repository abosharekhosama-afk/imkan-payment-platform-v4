# DATA MIGRATION ANALYSIS — MySQL (V3) → PostgreSQL (V4)

**Status:** ANALYSIS ONLY — **no migration executed**  
**Date:** 2026-08-08  
**Decision:** DEC-014 RESOLVED — do not delete MySQL; no production migration without approval  
**Authority:** `docs/decisions/OPEN_DECISIONS.md`

---

## 1. Discovery summary

| Item | Finding |
|---|---|
| Source engine | MySQL 8.4 (`docker-compose` service `mysql`) |
| Source access | `mysql2` via `DATABASE_URL` |
| Migration files | `database/migrations/*.sql` (12 active; `.bak` ignored by runner) |
| Unique tables | **63** product tables + runtime `schema_migrations` |
| Seed in SQL | `010_v3_4_identity_and_dev_seed.sql` (demo tenant/user) |
| Extra seed | `apps/api/src/scripts/seed.ts` (permissions, bank/fee/risk demo rows) |
| Target engine | PostgreSQL (Phase 1 foundation introduced alongside MySQL) |

**MySQL is retained.** This document does not authorize cutover.

---

## 2. Complete source table inventory (alphabetical)

`account_balances`, `api_keys`, `audit_logs`, `bank_accounts`, `customers`, `customers_addresses`, `dispute_events`, `dispute_evidence`, `disputes`, `error_reports`, `fee_rules`, `financial_postings`, `idempotency_records`, `integration_connections`, `integration_inbox`, `integration_outbox`, `integration_sync_events`, `invoice_items`, `invoices`, `kyc_beneficial_owners`, `kyc_cases`, `kyc_documents`, `ledger_accounts`, `ledger_entries`, `ledger_transactions`, `merchants`, `mfa_challenges`, `notification_events`, `outbox_events`, `payment_attempts`, `payment_links`, `payment_method_sessions`, `payment_methods`, `payment_pages`, `payment_sessions`, `payments`, `payout_attempts`, `payouts`, `permissions`, `prices`, `products`, `provider_callbacks`, `provider_webhook_events`, `reconciliation_exceptions`, `reconciliation_runs`, `refunds`, `regional_policies`, `report_exports`, `risk_assessments`, `risk_rules`, `role_permissions`, `roles`, `security_events`, `settlement_items`, `settlements`, `subscriptions`, `tenants`, `user_roles`, `user_sessions`, `users`, `webhook_deliveries`, `webhook_delivery_attempts`, `webhook_endpoints`

Plus tooling: `schema_migrations` (do **not** treat as product data for V4).

---

## 3. Source → target mapping (high level)

| Source (MySQL) | Target (PostgreSQL V4) | Transferability | Notes |
|---|---|---|---|
| `tenants` | `organizations` | **Mappable** | Rename + status map; add settings row |
| `merchants` | `merchant_profiles` (+ legal/business later) | **Partial** | KYB split not 1:1; Phase 3+ |
| `users` | `users` | **Mappable** | Drop forced `tenant_id` PK uniqueness; membership via `organization_users` |
| `user_sessions` | `sessions` | **Mappable** | Rehash/reissue tokens recommended (do not copy raw tokens — only hashes if revalidated) |
| `roles` / `permissions` / `role_permissions` / `user_roles` | same names (V4 catalog) | **Partial** | Remap to PLATFORM_*/MERCHANT_* codes; demo “Owner” is not V4 role |
| `mfa_challenges` | `mfa_challenges` | **Mappable** | Short-lived; usually skip historical |
| `security_events` | `security_events` | **Mappable** | Optional historical import |
| `audit_logs` | `audit_events` | **Mappable** | Column reshape |
| `customers` | `customers` (DEC-003) | **Mappable later** | Not Phase 1; matching strategy DEC-006 OPEN |
| `customers_addresses` | customer address model (TBD table) | **Deferred** | Need schema decision beyond DEC-003 |
| `payment_links` | `payment_links` (DEC-003) | **Mappable later** | Align statuses to `11` §E |
| `payment_sessions` / `attempts` / `payments` / `refunds` | V4 payment tables + `payment_intents` | **Deferred** | Needs Intent synthesis rules — **do not invent** |
| `payment_methods` / sessions | `payment_methods` | **Conditional** | Tokens encrypted; key migration required |
| `ledger_*` / `account_balances` / `financial_postings` | `ledger_*` / `balances` | **Deferred** | Financial Core; invariant reconciliation mandatory |
| `settlements` / `settlement_items` | `settlements` | **Deferred** | |
| `payouts` / `payout_attempts` / `bank_accounts` | `payouts` / `payout_accounts` | **Deferred** | Banking model differs |
| `products` / `prices` / `subscriptions` / `invoices*` | billing tables | **Deferred** | DEC-007 OPEN for behavior |
| `fee_rules` | `fees` / fee config | **Non-transferable rates as policy** | Values exist but fee **policy** governed by DEC-008 OPEN |
| `risk_*` / `disputes*` / `kyc_*` | risk/disputes/KYB | **Partial / Deferred** | KYB model richer in V4 |
| `idempotency_records` | `idempotency_keys` | **Usually skip** | Short-lived operational |
| `outbox_events` / webhook_* / provider_* / integration_* | events/providers/books | **Usually skip in-flight** | Complete or drain before cutover |
| `regional_policies` | org settings + master data | **OPEN DEC-015** | |
| `error_reports` | admin error center | **Optional** | |
| `report_exports` / `notification_events` | TBD | **Optional / skip** | |
| Demo seed UUIDs (`550e8400-…`) | new orgs/users | **Non-authoritative** | Dev-only; do not treat as production |

---

## 4. Transferable vs non-transferable

### 4.1 Generally transferable (after approved transform)

- Organization/tenant identity metadata  
- User accounts (email, password hashes if scrypt scheme unchanged, MFA encrypted secrets **only if encryption key migrated**)  
- Membership links (tenant→org mapping)  
- Historical audit/security logs (optional)  
- Customers / payment links / payments history (**later phases**, with validation)  
- Ledger history (**only** with balance reconciliation sign-off)

### 4.2 Non-transferable / should not copy as-is

| Data | Why |
|---|---|
| Active session tokens expecting MySQL session table semantics | Re-login after cutover |
| In-flight outbox/webhook/idempotency rows | Drain or abandon with documented loss window |
| Sandbox simulation artifacts labeled as live | Environment isolation |
| Invented Intent rows without rule | DEC — do not guess Intent synthesis |
| Fee/reserve policy meaning | DEC-008 OPEN |
| Provider capability assumptions | DEC-009 OPEN |
| `schema_migrations` MySQL bookkeeping | Tooling-only |
| Duplicate/overlapping legacy table definitions | Schema noise, not data |

### 4.3 Conditional

| Data | Condition |
|---|---|
| Encrypted provider/MFA/Zoho tokens | Same `PAYMENT_TOKEN_ENCRYPTION_KEY` (or re-encrypt with new key management) |
| API keys | Re-hash compatible; recommend rotation at cutover |
| Payment method tokens | Provider + vault key continuity |

---

## 5. Conflicts / duplicates

| Issue | Detail | Migration implication |
|---|---|---|
| `001_core.sql` vs `002_v1_1_core.sql` | Duplicate CREATE for 6 tables; `001` markdown-fenced | Source schema OK via IF NOT EXISTS; export from live DB not from raw 001 |
| Overlapping ADD COLUMN (`000`/`005`/`011`) | Runner skips existing columns | Use live `INFORMATION_SCHEMA` as truth |
| Role model mismatch | Demo `Owner` vs V4 PLATFORM_*/MERCHANT_* | Explicit role remap table required |
| Tenancy model mismatch | `users.tenant_id` vs org membership | One user may need multi-org membership rules (V4) — confirm before multi-map |
| Money model | MySQL `DECIMAL(30,0)` minor ↔ PG `NUMERIC(30,0)` minor (DEC-001) | Compatible numerically if currency present |
| Missing currency on some historical rows | Must fail validation if null | Quarantine rows |
| `permissions` seed timing | `010` role_permissions depends on `seed.ts` | Export live permissions, not migration files alone |

---

## 6. Proposed migration order (when approved)

**Not authorized to run yet.**

1. **Freeze** MySQL writes / maintenance window  
2. **Backup** MySQL (logical + physical) + checksum manifest  
3. **W1 Identity:** tenants→organizations, users, membership, RBAC remap, sessions policy (reissue)  
4. **W2 Master Data:** seed V4 master codes (not MySQL-sourced enums)  
5. **W3 Customers & Payment Links** (DEC-003)  
6. **W4 Payments path** (after Intent rules approved)  
7. **W5 Ledger / balances** + invariant reconcile  
8. **W6 Settlements / payouts / bank**  
9. **W7 Billing** (after DEC-007)  
10. **W8 Risk / KYB / disputes**  
11. **W9 Integrations / webhooks** (prefer drain + reconnect over blind copy)  
12. **Validation gate** → approval → cutover → hypercare  

Phase 1 only creates **empty/foundation** PostgreSQL schema — it does **not** execute W1–W9 data movement.

---

## 7. Validation / reconciliation rules (required before approval)

| Check | Rule |
|---|---|
| Row counts | Per-table source vs target within agreed tolerance (usually 0 loss for identity/money) |
| Orphans | No child row without parent org/user/payment |
| Tenant isolation | Every org-scoped row maps to exactly one `organization_id` |
| Money | Every amount has currency; `NUMERIC` exact equality on samples |
| Ledger | Σ debits = Σ credits per transaction; account balances match rebuilt ledger |
| Refunds | Σ refunds ≤ captured per payment |
| Payouts | payout totals ≤ eligible reconstructed balance (Financial Core rules) |
| Auth | Spot-check login with known non-prod accounts only |
| Secrets | No plaintext PAN/CVV; token decrypt sample with migrated key |
| Idempotency | No duplicate business keys violating V4 uniques |

Failed checks → **no cutover**.

---

## 8. Backup / rollback strategy

### Backup (before any future migration attempt)

1. MySQL `mysqldump` (all databases / schemas in use) + binary/snapshot if available  
2. Store checksums (SHA-256) of dump files  
3. PostgreSQL `pg_dump` of target before load  
4. Document encryption key backup / KMS handle separately (never in git)

### Rollback

| Stage | Action |
|---|---|
| Before DNS/app cutover | Keep app on MySQL; discard incomplete PG load |
| After partial PG load | Restore PG from pre-load `pg_dump`; resume MySQL |
| After app pointed to PG | Redeploy previous app revision + `DATABASE_URL` MySQL; restore MySQL from dump if PG wrote back (avoid dual-write without a plan) |

**Dual-write is out of scope until explicitly approved.**

---

## 9. Explicit non-actions (current)

- [x] Do **not** delete MySQL containers/volumes/migrations  
- [x] Do **not** auto-run data migration in Phase 1  
- [ ] Production migration — **blocked pending approval**  
- [ ] Intent synthesis / fee policy mapping — **blocked on open Decisions**

---

## 10. Approval checklist (future)

- [ ] Stakeholder approves this mapping  
- [ ] DEC-006/007/008 resolved where money/billing/customer matching affected  
- [ ] Staging dry-run evidence attached  
- [ ] Validation report green  
- [ ] Rollback drill completed  
- [ ] Written approval to execute  

**Phase 1 proceeds with PostgreSQL foundation only; MySQL remains intact.**
