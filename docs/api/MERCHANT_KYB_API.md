# Merchant / KYB / Banking API Contracts (Phase 3, /api/v1)

All endpoints: Bearer session auth (Phase 1), envelope `{data, meta:{request_id}}` / `{error:{code,message,request_id}}`. Merchant endpoints derive tenant from the session organization (no organization id in the path). `X-Tenant-ID` is rejected. Step-up = header `X-Step-Up-Token` (from `POST /auth/mfa/step-up`). Idempotent endpoints require header `Idempotency-Key` (8–200 chars; replay returns cached response; payload mismatch → 409).

## Master data

| Method/Path | AuthZ | Notes |
|---|---|---|
| GET `/master-data/types` | authenticated | list of type slugs |
| GET `/master-data/:type` | authenticated | active records; `?include_inactive=true` needs `masterdata.manage` |
| POST `/master-data/:type` | `masterdata.manage` | `{code, name, description?, labels?, sort_order?, metadata?, extra?}` (`extra`: typed columns e.g. `iso3`, `minor_units`) |
| PATCH `/master-data/:type/:code` | `masterdata.manage` | partial update; code immutable |
| POST `/master-data/:type/:code/activate` \| `/deactivate` | `masterdata.manage` | soft lifecycle only |

## Merchant profile / company data

| Method/Path | AuthZ | Notes |
|---|---|---|
| GET `/merchant/profile` | `merchant.read` | bundle: profile, legal (tax_id masked), business (+`countries_served`, `currencies_accepted`), addresses, people (identification masked) |
| PUT `/merchant/profile` | `merchant.manage` | trading name / website / support contacts (no KYB re-review) |
| PUT `/merchant/legal-profile` | `merchant.manage` | legal name, registration number, `legal_entity_type_code`, `incorporation_country_code`, date, `tax_type_code`, tax/vat ids, `addresses[]` (`address_type_code`, country_code, …) |
| PUT `/merchant/business-profile` | `merchant.manage` | `business_type_code`, `industry_code`, description, volumes as minor-unit strings + `volume_currency_code`, `countries_served[]`, `currencies_accepted[]` |
| POST `/merchant/owners` \| `/directors` \| `/representatives` | `merchant.manage` | owners require `ownership_percent` (total ≤ 100 enforced); identification stored encrypted, response returns `identification_number_masked` |
| POST `/merchant/{owners\|directors\|representatives}/:personId/remove` | `merchant.manage` | soft remove (status REMOVED) |

Edit guard: 409 `KYB_CASE_LOCKED` while case SUBMITTED/UNDER_REVIEW; 409 `KYB_CASE_SUSPENDED` when suspended; edits after APPROVED auto-reopen the case to UNDER_REVIEW.

## Documents (metadata only)

| Method/Path | AuthZ |
|---|---|
| GET `/merchant/documents` | `documents.read` |
| POST `/merchant/documents` — `{document_type_code, file_name, mime_type, size_bytes, sha256?, storage_key?, subject_type?, subject_id?}` | `documents.manage` |
| POST `/merchant/documents/:id/archive` | `documents.manage` |
| POST `/admin/documents/:id/review` — `{decision: ACCEPTED\|REJECTED, reason?}` | `kyb.review` |

Document statuses: `UPLOADED → PENDING_REVIEW → ACCEPTED | REJECTED`; `ARCHIVED`, `EXPIRED`.

## KYB

| Method/Path | AuthZ | Notes |
|---|---|---|
| GET `/merchant/kyb` | `kyb.read` | `{case, onboarding_status, requirements[], missing[], recent_results[], history[], documents[]}`; `onboarding_status ∈ incomplete, pending, under_review, verification_required, approved, rejected, suspended` |
| POST `/merchant/kyb/submit` | `kyb.submit` + Idempotency-Key | 422 `KYB_INCOMPLETE` with `missing[]` when requirements unmet |
| GET `/admin/kyb/cases?status=` | `kyb.review` | paged |
| GET `/admin/kyb/cases/:caseId` | `kyb.review` | case + results + full transition history |
| POST `/admin/kyb/cases/:caseId/start-review` | `kyb.review` | SUBMITTED → UNDER_REVIEW |
| POST `/admin/kyb/cases/:caseId/request-information` — `{reason}` | `kyb.review` | UNDER_REVIEW → NEEDS_INFORMATION |
| POST `/admin/kyb/cases/:caseId/decision` — `{decision: APPROVED\|REJECTED, reason, risk_category_code?}` | `kyb.review` + step-up + Idempotency-Key | UNDER_REVIEW → decision; invalid transitions → 409 |
| POST `/admin/kyb/cases/:caseId/suspend` — `{reason}` | `kyb.review` + step-up | APPROVED → SUSPENDED |

## Bank / payout accounts

| Method/Path | AuthZ | Notes |
|---|---|---|
| GET `/merchant/bank-accounts` | `bank.read` | masked list (`account_number_masked`) |
| GET `/merchant/bank-accounts/:id` | `bank.read` | masked + verifications + lifecycle history |
| POST `/merchant/bank-accounts` | `bank.manage` + step-up + Idempotency-Key | `{payout_method_code, currency_code, country_code, bank_name, account_holder_name, holder_relationship?, account_type: IBAN\|ACCOUNT_NUMBER, account_value, swift_bic?}`; duplicate (same fingerprint) → 409 `BANK_ACCOUNT_DUPLICATE` |
| POST `/merchant/bank-accounts/:id/activate` | `bank.manage` + step-up | VERIFIED → ACTIVE only |
| POST `/merchant/bank-accounts/:id/deactivate` | `bank.manage` + step-up | ACTIVE → DEACTIVATED |
| POST `/merchant/bank-accounts/:id/set-default` | `bank.manage` | ACTIVE accounts only |
| GET `/admin/bank-accounts?status=` | `bank.review` | masked |
| POST `/admin/bank-accounts/:id/verification/start` | `bank.review` | verification PENDING → IN_PROGRESS |
| POST `/admin/bank-accounts/:id/verification/decision` — `{result: PASSED\|FAILED, reason}` | `bank.review` + step-up + Idempotency-Key | PASSED → account VERIFIED; FAILED → REJECTED; no open case → 409 |

Full account numbers, encrypted values and fingerprints are **never** returned by any endpoint. Account details are immutable after creation; changing details = create new account + deactivate old.
