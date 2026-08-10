# Phase 3 Final Implementation Audit — Merchant / KYB / Master Data / Banking

**Date:** 2026-08-09  
**Auditor:** implementation agent (source-level audit, not test-only)  
**Baseline:** Phase 3 accepted as COMPLETE (43/43 PG, 64/64 normal suite). This audit did not redesign or restart any completed work.

---

## 1. Audit scope

- Keyword sweep of all Phase 3 source and documentation for: TODO, FIXME, HACK, mock, stub, fake, placeholder, "not implemented", development-only, temporary.
- Manual line-by-line review of every Phase 3 module for: hardcoded values that belong in master data, bypassed authorization, missing tenant checks, unsafe logging of sensitive data, unprotected state transitions, missing transactions, missing idempotency, missing concurrency protection, fake providers/storage, insecure key handling, SQL injection.
- Verification of the 22 requested areas (onboarding, legal/business data, owners/directors/representatives, documents, master data, KYB requirements engine, KYB state machine, cases/results/transitions, risk states, bank accounts, encryption, HMAC fingerprinting, bank verification, RBAC, tenant isolation, audit/security events, /api/v1 contracts, error handling/redaction, DB constraints/transactions).
- Verification that accepted limitations are explicitly documented.
- Full test rerun after the one fix applied during this audit.

## 2. Files / modules reviewed

| Module | File |
|---|---|
| Master data service | `apps/api/src/merchant/master-data.ts` |
| Merchant/company service | `apps/api/src/merchant/merchant-service.ts` |
| Documents service | `apps/api/src/merchant/documents-service.ts` |
| KYB service + state machine | `apps/api/src/merchant/kyb-service.ts` |
| Bank accounts service | `apps/api/src/merchant/bank-accounts-service.ts` |
| Provider adapters | `apps/api/src/merchant/verification-providers.ts` |
| Crypto / fingerprinting | `apps/api/src/foundation/crypto.ts` |
| Redaction | `apps/api/src/foundation/redact.ts` |
| Config / key handling | `apps/api/src/config.ts` |
| API routes | `apps/api/src/interfaces/http/apiV1/phase3-routes.ts` |
| Migrations | `database/migrations/postgres/008–012` |
| Runner | `scripts/verify-foundation-pg.mjs` |
| Docs | `docs/implementation/03-merchant-kyb.md`, `PHASE3_COMPLETION_REPORT.md`, `docs/security/BANK_DATA_PROTECTION.md`, `docs/master-data/MASTER_DATA_MODEL.md`, `docs/api/MERCHANT_KYB_API.md`, `docs/providers/VERIFICATION_PROVIDERS.md` |

## 3. Findings

### BLOCKER — none found.

### HIGH — none found.

### MEDIUM

| # | Finding | Status |
|---|---|---|
| M-1 | **Beneficial-ownership sum check was read-then-write without a serializing lock when no KYB case exists yet.** `merchantService.addPerson` validates SUM(ownership_percent) ≤ 100 with a plain SELECT; `assertKybEditable` only takes `FOR UPDATE` on `verification_cases`, so before the first case row exists two concurrent owner additions could both pass and store a transient total > 100%. Impact was bounded: KYB submission re-evaluates `OWNERSHIP_TOTAL_MAX` and would block approval; per-row CHECK (0,100] still held. | **FIXED during this audit** — owner additions now serialize on the organization row (`SELECT id FROM organizations WHERE id=$1 FOR UPDATE`) before the sum check. Full suites re-run green after the fix. |

### LOW (not fixed — recorded; none is production-blocking for Phase 3 scope)

| # | Finding | Assessment |
|---|---|---|
| L-1 | `vat_number` is returned unmasked in the merchant profile bundle (while `tax_id` is masked). | VAT numbers are semi-public registry data in most jurisdictions; masking policy can be tightened later without schema change. |
| L-2 | `tax_id` and `registration_number` are stored plaintext at rest (masked in responses and audit payloads). | Spec §7 mandates the layered model for banking and person identification data, which is implemented; company tax IDs are a reasonable future candidate for the same envelope, no migration obstacle. |
| L-3 | `GET /merchant/kyb` lazily creates the DRAFT case (a write on a GET). | Deliberate convenience for the onboarding UI; transactional, audited via the transition row, idempotent per org (partial unique index). |
| L-4 | Duplicate-registration-number detection at submit compares raw strings (no normalization). | WARN-level signal for reviewers only; never auto-decides. |
| L-5 | `identificationFingerprint` reuses `BANK_FINGERPRINT_HMAC_KEY` with a distinct `ID\|` namespace instead of a dedicated key. | Namespacing prevents cross-domain collisions; a dedicated key would be marginally cleaner and can be introduced with a new envelope version. |
| L-6 | Production key guard checks presence/non-dev-fallback but not minimum key length/entropy. | Keys pass through SHA-256 derivation; adding a length check is a one-line hardening item for the production-readiness gate. |
| L-7 | `documents.size_bytes` upper bound (100 MB) is enforced at the route schema, not by a DB CHECK. | Metadata only — no binary is stored; DB has NOT NULL + type constraints. |

### ACCEPTED LIMITATION (verified explicitly documented)

| # | Limitation | Documented in |
|---|---|---|
| A-1 | No external KYB/person/bank verification provider; adapters return `NOT_AVAILABLE`; decisions are platform manual review. No provider API invented. | `VERIFICATION_PROVIDERS.md`, `03-merchant-kyb.md`, `PHASE3_COMPLETION_REPORT.md` §9/§10 |
| A-2 | No document storage backend; metadata + opaque `storage_key` only. | `documents-service.ts` header comment, `03-merchant-kyb.md`, `PHASE3_COMPLETION_REPORT.md` §10.1 |
| A-3 | Key rotation is a manual re-encryption procedure over the versioned `v1$` envelope; no KMS integration. | `BANK_DATA_PROTECTION.md`, `PHASE3_COMPLETION_REPORT.md` §10.5 |
| A-4 | IBAN validation is structural (ISO 13616 pattern); country-specific mod-97 checksum deferred (does not affect fingerprints when added). | `BANK_DATA_PROTECTION.md`, `PHASE3_COMPLETION_REPORT.md` §10.4 |
| A-5 | KYB requirement rows are seed/SQL-managed; dedicated admin API deferred (selector model already supports variance by country/entity/business type/industry/risk). | `PHASE3_COMPLETION_REPORT.md` §10.3 |

### Keyword-sweep results

- `TODO|FIXME|HACK|not implemented|placeholder|temporary` in `apps/api/src`: **no unfinished-work markers.** All hits are benign (SQL parameter "placeholders" variable, account-lockout message).
- `mock|stub|fake|dev-only`: only (a) the documented provider/outbox adapter stubs (accepted limitation A-1) and (b) dev fallback keys in `config.ts`, which `requiredInProduction` **rejects at production startup** — not a finding.
- Migrations 008–012 and Phase 3 docs: no unfinished markers; the only "not implemented" phrases are the documented A-4 limitation.

## 4. Fixes applied during this audit

1. **M-1** — `merchant-service.ts`: serialize concurrent beneficial-owner additions on the organization row before the ownership-sum check. No schema change; no test weakened; suites re-run green.

(Note: one intermediate `test:pg` run after the fix showed 9 failures that were all 5-second timeouts under heavy machine load — including tests that never touch the changed code path, e.g. plain 401 checks; total runtime 306 s vs the normal ~35 s. A clean rerun passed 43/43, confirming an environmental artifact, not a regression.)

## 5. Remaining limitations

Exactly the documented set: A-1…A-5 above plus L-1…L-7 recorded here. No undocumented gaps were found.

## 6. Security assessment

- **RBAC:** every Phase 3 route carries `requirePermission`; merchant routes additionally `requireOrganizationContext`; admin routes require `kyb.review`/`bank.review`/`masterdata.manage` (platform-only per RBAC seed 011). No bypasses found.
- **Tenant isolation:** every merchant-side query is `organization_id`-scoped from the session; no organization id appears in merchant URLs (no IDOR surface); admin cross-org access is permission-gated by design. Cross-tenant tests pass (404/403 + empty lists).
- **Sensitive data:** layered model implemented exactly as specified (AES-256-GCM `v1$` envelope, last4 mask, namespaced HMAC-SHA256 fingerprint with per-type normalization). Encrypted values and fingerprints are stripped in the service layer and never serialized by any route. Keys are environment-only; production boot refuses missing/dev keys. No custom cryptography — only standard `node:crypto` primitives.
- **Logging/redaction:** `redact.ts` masks all banking/identification keys in persisted error reports; audit payloads store only bank name/last4/currency/status; `tax_id` redacted in audit before/after images. Verified by passing redaction tests and by review of every `writeAuditEvent`/`writeSecurityEvent` call site.
- **Step-up + idempotency:** enforced on KYB decisions/suspension and all bank mutations (create/activate/deactivate/verification decision); submit/create/decision endpoints wrap `completeIdempotency`/`failIdempotency` correctly.
- **State machines:** KYB and bank transitions are guarded by explicit transition tables **and** status+version-conditioned UPDATEs (409 on concurrent modification); histories are append-only under DB triggers. No unprotected transition path found.

## 7. Database assessment

- Migrations 000–012 apply on an empty PostgreSQL 16.14 and fully skip on rerun (verified again during this audit).
- Schema check: 55 tables, 88 FKs, 91 PK/unique, 412 CHECK constraints, 137 indexes.
- No REAL/FLOAT/DOUBLE PRECISION anywhere; money columns are NUMERIC(30,0) + CHAR(3) FK to `master_currencies(code)` (DEC-001).
- Master-data references use UUID FKs; multi-value business relations are normalized tables (no arrays); append-only tables protected by `forbid_append_only_mutation()` triggers; partial unique indexes enforce one live KYB case per org, one open verification per account, one default account per org, and org+fingerprint dedupe.
- All mutating service methods run inside `withPgTransaction` with row locks (`FOR UPDATE`) taken before read-then-write decisions (after the M-1 fix, including owner sums).
- `master-data.ts` dynamic table names resolve strictly from an internal whitelist (`MASTER_TYPES`/`EXTRA_COLUMNS`); all values parameterized — no SQL-injection surface.

## 8. API assessment

- All Phase 3 endpoints live under `/api/v1` behind the Phase 1 auth hook; responses use the standard `{data, meta}` / `{error}` envelope with `request_id`.
- Zod validation on every params/query/body (code format, UUIDs, ISO code lengths, minor-unit amount regex `^\d{1,30}$`, ownership percent format, document size bounds, reason length bounds).
- Contracts match `docs/api/MERCHANT_KYB_API.md`; all UI onboarding states (`incomplete/pending/under_review/verification_required/approved/rejected/suspended`) are derivable from `GET /merchant/kyb`.
- No endpoint exposes full account numbers, encrypted values, fingerprints, or unmasked identification numbers (verified per-route).

## 9. Test results (final, after audit fix)

| Command | Result |
|---|---|
| `npm run test:pg` (2026-08-09) | **PASS — 43/43, 0 failed, 0 skipped** on embedded PostgreSQL 16.14 (target `postgres:16-alpine`); migrations 000–012 empty-DB + idempotent rerun PASS; schema checks PASS |
| `npm test` (2026-08-09) | **PASS — 64/64, 0 failed** (15 files) |

## 10. Final verdict

**PASS — READY FOR PHASE 4**

No BLOCKER or HIGH findings. The single MEDIUM finding (M-1, ownership-sum concurrency) was fixed and re-verified during this audit. All LOW findings are recorded and non-blocking for Phase 3 scope; all accepted limitations (external KYB providers, document storage backend, key rotation, IBAN checksum, KYB-requirements admin API) are explicitly documented. Phase 3 remains **not Production Ready** per `PHASE3_COMPLETION_REPORT.md` §11 — that gate is unchanged by this audit and applies to platform launch, not to starting Phase 4 implementation.

Phase 4 will not be started without explicit approval.
