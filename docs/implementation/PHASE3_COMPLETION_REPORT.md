# Phase 3 Completion Report — Merchant / KYB / Master Data / Banking

**Date:** 2026-08-08  
**Status:** COMPLETE — stop before Phase 4  
**Production Ready:** **No**  
**Baselines preserved:** PostgreSQL 16 SoR, `/api/v1`, Phase 1/2 foundation (not rewritten), tenant isolation, RBAC, transaction-client pattern, MySQL retained (DEC-014).

---

## 1. Features implemented

| # | Feature |
|---|---|
| 1 | Merchant profile (trading/support contact data) |
| 2 | Company legal profile (legal name, registration number, legal entity type, incorporation country/date, tax/VAT) |
| 3 | Business profile (business type, industry, description, volumes in NUMERIC(30,0) minor units + FK'd currency) |
| 4 | Company addresses typed by master address types |
| 5 | Beneficial owners (ownership % ≤ 100 enforced), directors, authorized representatives — identification encrypted + masked + fingerprinted |
| 6 | Document metadata subsystem (no binaries; typed; review workflow UPLOADED→ACCEPTED/REJECTED; archive) |
| 7 | KYB workflow state machine (spec §6 states) with data-driven requirement model (selectors: country, legal entity type, business type, industry, risk category) |
| 8 | Verification results (append-only) + explicit state-transition history (append-only) |
| 9 | Manual platform review: start-review, request-information, decision (step-up + idempotent), suspend |
| 10 | Automatic re-review when approved merchants change material data |
| 11 | Bank/payout accounts: layered sensitive model (AES-256-GCM + last4 + HMAC fingerprint), lifecycle state machine, duplicate detection across equivalent representations |
| 12 | Bank verification: separate case state machine + append-only results + platform decision flow |
| 13 | Master Data: 16 PostgreSQL tables, admin CRUD (RBAC + audit), soft-disable lifecycle |
| 14 | Provider adapter interfaces for KYB/person/bank verification (stubs; no invented provider APIs) |
| 15 | RBAC expansion (11 permissions) wired into every route |

## 2. Database schema

- Migrations **008–012** (000–007 untouched). Verified on empty DB + idempotent rerun.
- 55 tables total; schema check: 88 FKs, 91 PK/unique, 412 CHECKs, 137 indexes (PG 16.14).
- Conventions: UUID FKs to `master_*.id` for relational references; `CHAR(3)` currency columns with DB-enforced FK to `master_currencies(code)`; normalized relation tables instead of arrays; append-only tables protected by `forbid_append_only_mutation()` triggers; optimistic `version` columns on cases/accounts; partial unique indexes for "one live KYB case per org", "one open verification per account", "one default account per org", "org+fingerprint uniqueness".

## 3. APIs

Contracts in `docs/api/MERCHANT_KYB_API.md`: master data (6 endpoints), merchant profile/legal/business (4), people (6), documents (4), KYB merchant (2) + admin (6), bank merchant (6) + admin (3). All under `/api/v1`; UI-ready onboarding statuses: `incomplete, pending, under_review, verification_required, approved, rejected, suspended`.

## 4. Workflows / state machines

- **KYB:** DRAFT→SUBMITTED→UNDER_REVIEW→{NEEDS_INFORMATION→SUBMITTED, APPROVED, REJECTED}; APPROVED↔SUSPENDED; APPROVED→UNDER_REVIEW on post-approval data change; REJECTED terminal. Transition table + status/version-guarded UPDATE (concurrent modification → 409) + append-only transition log.
- **Bank:** lifecycle (PENDING_VERIFICATION→VERIFIED→ACTIVE↔DEACTIVATED; →REJECTED), verification case (PENDING→IN_PROGRESS→PASSED/FAILED/CANCELLED), attempts/results — three separated models. ACTIVE only via explicit step-up activation.

## 5. Security controls

Server-side RBAC on every route; tenant scope from session (no org id in merchant paths → no IDOR); step-up (MFA) on KYB decisions, suspension, bank add/activate/deactivate/verification decisions; Idempotency-Key on submit/decision/create endpoints; AES-256-GCM at rest with env-only keys; HMAC-SHA256 fingerprints (env-only key, non-reversible, per-type normalization); masked-only API output; log/error-report redaction of banking fields; audit_events on all mutations; security_events on sensitive banking/KYB operations; master data mutations platform-only + audited; production boot guards refuse dev keys.

## 6. Fixed failures from the first Phase 3 test run (39/42 → all green)

| Failure | Root cause | Fix | Retest |
|---|---|---|---|
| `foundation-money-spec` — "does not introduce float money columns" | The guard uppercases migration SQL and matched the substring `" REAL"` inside a **comment** in `009` ("a real FK"). No actual float column existed; all monetary columns are `NUMERIC(30,0)` + `CHAR(3)`. | Reworded comment ("database-enforced FK"); DDL unchanged; audited all Phase 3 migrations for REAL/FLOAT/DOUBLE PRECISION — none. | PASS |
| `phase3` — "re-opens review when merchant data changes after approval" (500) | Migration 006 created `outbox_events_org_idem_uq` as `UNIQUE (organization_id, idempotency_key) NULLS NOT DISTINCT`, limiting each organization to **one keyless outbox event ever**. The reopen flow emits keyless `kyb.case.reopened` after keyless `kyb.case.needs_information` already existed → unique violation inside the transaction → rollback → 500. | Migration **012**: partial unique index `(organization_id, idempotency_key) NULLS NOT DISTINCT WHERE idempotency_key IS NOT NULL` (006 not modified); `emitOutboxEvent` ON CONFLICT now targets the partial arbiter. Keyed dedupe behavior preserved (incl. NULL-org platform events). | PASS |
| `phase3` — "bank account lifecycle … PASSED → 500" | Same root cause: `bank_account.status_changed` is intentionally keyless and was the org's next keyless event → same unique violation. | Same fix (012). | PASS |

Regression test added: `regression (012): allows unlimited keyless outbox events per org while keyed events dedupe`.

## 7. Test evidence (final)

| Command | Result |
|---|---|
| `npm run test:pg` | **PASS** — embedded **PostgreSQL 16.14** (target `postgres:16-alpine`); migrations **000–012** applied on empty DB, second pass all skipped (idempotent); schema checks PASS; **43/43 tests, 0 failed, 0 skipped** (6 files: foundation-api 13, foundation-crypto 4, foundation-money-spec 2, phase2-identity 6, phase3-crypto 7, phase3-merchant-kyb 11) |
| `npm test` | **PASS** — **64/64 tests, 0 failed** (15 files; PG suites soft-skip by design without a live DB — the enforced PG run is `test:pg` with `FOUNDATION_PG_REQUIRED=true`) |

Coverage includes: RBAC denial (merchant→admin routes, merchant→master data), tenant isolation (cross-tenant 404/403, empty lists), banking encryption-at-rest/masking/unauthorized access/log redaction/audit+security events, KYB state machine (invalid transitions 409, freeze while under review, append-only enforcement at DB level), bank state machines (early activation 409, double decision 409), idempotency (submit/create replays, payload-mismatch protection), duplicate detection via equivalent account representations, validation (ownership >100, inactive master codes).

## 8. Documentation

`docs/implementation/03-merchant-kyb.md`, `docs/master-data/MASTER_DATA_MODEL.md`, `docs/security/BANK_DATA_PROTECTION.md`, `docs/api/MERCHANT_KYB_API.md`, `docs/providers/VERIFICATION_PROVIDERS.md`, `docs/testing/POSTGRES_RUNTIME_VERIFICATION.md` (regenerated, PASS), this report. `.env.example` updated (`BANK_DATA_ENCRYPTION_KEY`, `BANK_FINGERPRINT_HMAC_KEY`).

## 9. Provider dependencies

None integrated. KYB/person/bank verification run through `internal-manual` adapters returning `NOT_AVAILABLE`; decisions are platform manual review. Real provider integration requires a Decision + sandbox evidence (spec §13). No provider APIs or credentials were invented.

## 10. Known limitations

1. Document binaries are not stored — metadata + opaque `storage_key` only; storage backend is a future Decision.
2. No external KYB/bank verification provider; "verified" means platform manual review passed.
3. KYB requirement rows are seeded/SQL-editable; a dedicated admin API for requirements is future work (selector model already supports country/entity/industry/risk variance).
4. IBAN validation is structural (ISO 13616 pattern); country-specific mod-97 checksum not implemented.
5. Key rotation is a manual re-encryption procedure (versioned envelope ready); no KMS.
6. Master-data localization (`labels_json`) is stored but not yet consumed by any UI.
7. Cross-tenant fingerprint matches are indexed but no automated risk alerting yet (Risk phase).
8. Embedded PostgreSQL is the verified dev/test runtime; Docker `postgres:16-alpine` remains the deployment target.

## 11. Production readiness

**Not Production Ready.** Gate items outstanding: real provider integrations, document storage, backup/restore evidence, rate limiting on sensitive endpoints, penetration testing, production key management. Green tests alone are explicitly not treated as production readiness.

---

**STOP:** Phase 4 (Payments) will not start until explicit approval.
