# Master Data Model (Phase 3)

**Source:** spec §9. Storage: PostgreSQL 16, migration `008_phase3_master_data.sql`.

## Tables (16, explicit DDL)

`master_countries`, `master_currencies`, `master_legal_entity_types`, `master_business_types`, `master_industries`, `master_document_types`, `master_tax_types`, `master_payout_methods`, `master_payment_method_types`, `master_provider_types`, `master_provider_capabilities`, `master_fee_types`, `master_risk_categories`, `master_webhook_event_types`, `master_address_types`, `master_identification_types`

Common shape: `id UUID PK`, `code TEXT UNIQUE` (stable business identifier), `name`, `labels_json JSONB` (localized labels), `description`, `is_active BOOLEAN`, `sort_order INT`, `metadata_json JSONB`, `retired_at`, `created_at`, `updated_at`.

Business-critical attributes are **typed columns**, not metadata:
- `master_countries.iso3 CHAR(3) UNIQUE` (code = ISO 3166-1 alpha-2, CHECK `^[A-Z]{2}$`)
- `master_currencies.minor_units SMALLINT NOT NULL CHECK 0–4` (code = ISO 4217, CHECK `^[A-Z]{3}$`)

`metadata_json` is reserved for extensible, non-critical attributes only.

## Concept separation

- **Legal entity type** (`master_legal_entity_types`): legal structure — LLC, sole proprietorship, …
- **Business type** (`master_business_types`): activity nature — retail, services, marketplace, …
- **Industry** (`master_industries`): business category — e-commerce, healthcare, …

`company_legal_profiles` references legal entity type; `business_profiles` references business type + industry.

## Referencing convention

- Relational business tables reference master rows via **UUID FK to `master_*.id`** (e.g. `company_addresses.address_type_id`). Codes remain the stable API-facing identifiers; services resolve code→id and reject inactive codes (`MASTER_CODE_INACTIVE`).
- Monetary currency tags use `CHAR(3)` with a **database-enforced FK** to `master_currencies(code)` (`business_profiles.volume_currency_code`, `payout_accounts.currency_code`), keeping the DEC-001 amount+currency pattern while making invalid currency references impossible at the database level.
- Multi-value business relations are normalized tables with FKs (`business_profile_countries`, `business_profile_currencies`) — no PostgreSQL arrays — ready for future provider/payment-method/routing rules.

## API

| Endpoint | AuthZ |
|---|---|
| `GET /api/v1/master-data/types` | any authenticated user |
| `GET /api/v1/master-data/:type` | any authenticated user (active records only) |
| `GET /api/v1/master-data/:type?include_inactive=true` | `masterdata.manage` |
| `POST /api/v1/master-data/:type` | `masterdata.manage` (platform) |
| `PATCH /api/v1/master-data/:type/:code` | `masterdata.manage` |
| `POST /api/v1/master-data/:type/:code/activate` / `/deactivate` | `masterdata.manage` |

Rules:
- Ordinary merchant users can never modify global master data (tested: 403).
- Lifecycle is **soft only**: deactivation hides records from new selections (`retired_at` set); referenced records are never destructively deleted; stable codes are immutable.
- Every mutation writes an `audit_events` row (before/after captured).
- Frontend must consume these APIs — reference values are not hardcoded client-side.

## Seeds

Editable starter records (ISO codes/minor units are standard facts, not invented rules): 15 countries, 11 currencies, 7 legal entity types, 6 business types, 10 industries, 10 document types, 5 tax types, 3 payout methods (wallet inactive), 3 payment method types, 5 provider types, 9 provider capabilities (spec §13), 5 fee-type labels (fee **rules** remain an OPEN decision), 4 risk categories, 6 webhook event types, 3 address types, 4 identification types.
