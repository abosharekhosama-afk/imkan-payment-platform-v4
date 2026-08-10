# Phase 3 — Merchant / KYB / Master Data / Banking

**Status:** COMPLETE (not Production Ready)  
**Verified:** 2026-08-08 on PostgreSQL 16.14 (embedded, target `postgres:16-alpine`)  
**API base:** `/api/v1` — Phase 1/2 foundation reused, not rewritten.

## Scope

Complete merchant onboarding foundation per spec §5–§7, §9–§10: merchant/company profile, legal + business data, addresses, beneficial owners / directors / authorized representatives, document metadata, KYB workflow state machine, data-driven KYB requirements, bank/payout accounts with layered sensitive-data protection, bank verification workflow, PostgreSQL-backed master data with admin CRUD, RBAC, tenant isolation, audit/security events, idempotency, and concurrency protection.

## Changed / new files

| Area | Files |
|---|---|
| Migrations | `database/migrations/postgres/008_phase3_master_data.sql`, `009_phase3_merchant_kyb.sql`, `010_phase3_banking.sql`, `011_phase3_rbac_seed.sql`, `012_phase3_outbox_null_keys.sql` |
| Services | `apps/api/src/merchant/master-data.ts`, `merchant-service.ts`, `documents-service.ts`, `kyb-service.ts`, `bank-accounts-service.ts`, `verification-providers.ts` |
| API | `apps/api/src/interfaces/http/apiV1/phase3-routes.ts` (registered in `routes.ts`) |
| Foundation | `crypto.ts` (bank encryption/fingerprints), `redact.ts` (banking keys), `audit.ts` (outbox ON CONFLICT fix), `outbox-worker.ts` (kyb/bank event stubs), `config.ts` (+2 env keys) |
| Tests | `tests/phase3-crypto.test.ts` (unit), `tests/phase3-merchant-kyb.test.ts` (PG integration) |
| Runner | `scripts/verify-foundation-pg.mjs` (Phase 3 tables + suites) |

## Database (migrations 008–012)

- **008** — 16 explicit master-data tables (no dynamic DDL): countries (+`iso3`), currencies (+ typed `minor_units SMALLINT CHECK 0–4`), legal entity types (separate from business types), business types, industries, document/tax/payout/payment-method/provider types, provider capabilities (codes from spec §13), fee types (labels only; fee rules remain OPEN), risk categories, webhook event types, address types, identification types. Common shape: UUID PK, unique stable `code`, `name`, `labels_json`, `is_active`, `sort_order`, `metadata_json` (non-critical only), `retired_at`, timestamps. Seeds are editable reference records, not hardcoded rules.
- **009** — merchant_profiles, company_legal_profiles, company_addresses (UNIQUE org+type), business_profiles (NUMERIC(30,0) volumes + `volume_currency_code CHAR(3)` FK→`master_currencies(code)`), normalized `business_profile_countries` / `business_profile_currencies` (no arrays), beneficial_owners (ownership CHECK (0,100]), directors, authorized_representatives (identification: encrypted + last4 + HMAC fingerprint), documents (metadata only), `kyb_requirements` (selector-based: country / legal entity type / business type / industry / risk category; NULL = global), verification_cases (one live KYB case per org via partial unique; `version` optimistic lock), verification_results (append-only trigger), verification_case_transitions (append-only trigger).
- **010** — payout_accounts (lifecycle status; UNIQUE (org, fingerprint); one default per org), payout_account_verifications (case state machine; one open case per account), payout_account_verification_results (append-only), payout_account_transitions (append-only).
- **011** — permissions `merchant.read/manage`, `kyb.read/submit/review`, `documents.read/manage`, `bank.read/manage/review`, `masterdata.manage` + role grants.
- **012** — fixes the Phase 2 outbox unique index: `NULLS NOT DISTINCT` limited each org to a single keyless outbox event; replaced by a partial unique index (`WHERE idempotency_key IS NOT NULL`, org column still NULLS NOT DISTINCT). 006 not modified.

Reference convention: relational master-data references use UUID FKs to `master_*.id` (codes stay stable business identifiers); monetary currency tags use `CHAR(3)` with a database-enforced FK to `master_currencies(code)` (DEC-001). The database cannot hold an invalid currency reference.

## State machines

**KYB case (spec §6):** `DRAFT → SUBMITTED → UNDER_REVIEW → {NEEDS_INFORMATION → SUBMITTED, APPROVED, REJECTED}`; `APPROVED ↔ SUSPENDED`; `APPROVED → UNDER_REVIEW` (automatic when material merchant data changes after approval); `REJECTED` terminal (a new case may then be opened). Every transition is guarded by allowed-transition table + `status`+`version` optimistic lock (concurrent modification → 409) and recorded in append-only `verification_case_transitions` (from/to/actor/actor_type/reason/timestamp).

**Merchant edit guard:** SUBMITTED/UNDER_REVIEW → data frozen (409 `KYB_CASE_LOCKED`); SUSPENDED → 409; APPROVED → edit allowed but case auto-reopens to UNDER_REVIEW with WARN result + security event + outbox event.

**Bank account (three separated models):**
1. Lifecycle: `PENDING_VERIFICATION → VERIFIED → ACTIVE ↔ DEACTIVATED`; `PENDING_VERIFICATION → REJECTED`. VERIFIED→ACTIVE only via explicit activation (step-up).
2. Verification case: `PENDING → IN_PROGRESS → PASSED | FAILED | CANCELLED` (one open case per account).
3. Attempts/results: append-only `payout_account_verification_results`.

Account details are immutable after creation — a change means creating a new account (new verification) and deactivating the old one.

**KYB requirements (data-driven):** `kyb_requirements` rows select by country/legal-entity/business-type/industry/risk selectors (NULL = global). Seeded global defaults: legal profile, business profile, REGISTERED address, ≥1 person, ownership ≤100%, COMPANY_REGISTRATION document. Admin-editable; not a hardcoded universal rule. UI status derivation: `incomplete | pending | under_review | verification_required | approved | rejected | suspended`.

## Sensitive data (spec §7)

- Layered model: AES-256-GCM ciphertext (`v1$` envelope) + `last4` mask + deterministic HMAC-SHA256 fingerprint (duplicate detection only, non-reversible).
- Normalization is per account type: IBAN = strip whitespace/uppercase + ISO 13616 structure check; ACCOUNT_NUMBER = strip whitespace/hyphens only. Fingerprint input namespaced `type|country|normalized`.
- Keys from environment only (`BANK_DATA_ENCRYPTION_KEY`, `BANK_FINGERPRINT_HMAC_KEY`); never in PostgreSQL; production refuses dev fallbacks.
- No API ever returns encrypted/plaintext values or fingerprints; list/detail/admin views are masked (`****1234`).
- `redact.ts` masks iban/account_number/account_value/identification_number/swift/fingerprint in logs and persisted error reports (tested).
- All sensitive banking operations write audit + security events; add/activate/deactivate/decide require MFA step-up; create/decide also require Idempotency-Key.

See `docs/security/BANK_DATA_PROTECTION.md`, `docs/api/MERCHANT_KYB_API.md`, `docs/master-data/MASTER_DATA_MODEL.md`, `docs/providers/VERIFICATION_PROVIDERS.md`.

## Tests (all PASS — see PHASE3_COMPLETION_REPORT.md for counts)

Unit (crypto/normalization/fingerprint/redaction), PG integration (master data CRUD + RBAC denial, onboarding checklist, encryption-at-rest assertions, KYB submit idempotency + freeze + append-only enforcement, full review workflow incl. step-up denial and double-decision 409, post-approval re-review, document review, bank lifecycle + duplicate detection via equivalent representations + masking + security events, cross-tenant 404/403, error-report redaction, outbox regression).

## Limitations

- No file storage backend (document metadata only; `storage_key` opaque).
- No external KYB/bank verification provider (adapters return NOT_AVAILABLE; manual platform review is the decision path).
- KYB requirement admin API not yet exposed (rows editable via SQL/seed only); selector model is in place.
- Country-specific IBAN checksum validation (mod-97) not implemented — structural validation only, documented in BANK_DATA_PROTECTION.md.
- Key rotation is manual re-encryption (documented; no KMS integration invented).
