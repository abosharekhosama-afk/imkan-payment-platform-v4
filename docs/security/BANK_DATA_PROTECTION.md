# Bank / Sensitive Data Protection (Phase 3)

**Scope:** payout account numbers/IBANs, person identification numbers.  
**Spec:** §7, §17. Implementation: `apps/api/src/foundation/crypto.ts`, `redact.ts`, migration `010`.

## Layered data model

| Layer | Column | Purpose | Exposure |
|---|---|---|---|
| Ciphertext | `account_number_encrypted` / `identification_number_encrypted` | storage at rest | never leaves service layer |
| Mask | `account_last4` / `identification_last4` | display (`****1234`) | all read APIs |
| Fingerprint | `account_fingerprint` / `identification_fingerprint` | deterministic duplicate detection | never returned by APIs |

## Encryption

- AES-256-GCM (standard algorithm; nothing custom). Envelope: `v1$iv$tag$ciphertext` (base64url), random 96-bit IV per value, authenticated tag.
- Key: SHA-256 derivation of `BANK_DATA_ENCRYPTION_KEY` (environment only). **Keys are never stored in PostgreSQL.**
- Production startup fails on missing/dev-fallback keys (`requiredInProduction` guard in `config.ts`).
- Rotation: envelope is versioned (`v1$`); rotation = introduce v2 key, re-encrypt rows, retire v1. No KMS vendor is invented; if a KMS is adopted later it needs a Decision + docs.

## Fingerprints (duplicate detection)

- HMAC-SHA256 keyed by `BANK_FINGERPRINT_HMAC_KEY` (environment only, distinct from the encryption key).
- Input namespaced: `TYPE|COUNTRY_ISO2|NORMALIZED_VALUE` (bank) / `ID|ID_TYPE|NORMALIZED` (person) — prevents cross-domain collisions.
- **Normalization is per account type (no universal algorithm):**
  - `IBAN`: remove all whitespace, uppercase, validate ISO 13616 structure `^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$`. Equivalent formatted/unformatted IBANs produce identical fingerprints (tested).
  - `ACCOUNT_NUMBER`: remove whitespace and hyphens only, uppercase — conservative, no lossy transforms that could cause collisions.
  - Limitation: country-specific IBAN mod-97 checksum validation is not implemented (structural check only); adding it later does not change fingerprints.
- Fingerprints are one-way values used for `UNIQUE (organization_id, account_fingerprint)` and cross-tenant risk lookups. They are **not** treated as reversible secrets and are never exposed as account identifiers.

## Access control chain (spec §7)

Add/activate/deactivate/verify: Authentication → RBAC (`bank.manage` / `bank.review`) → tenant scope from session (no org id in path — no IDOR surface) → **MFA step-up** → validation (master-data FKs) → verification workflow → audit + security events. Create/decision endpoints additionally require `Idempotency-Key`.

## Output/log hygiene

- All read APIs (merchant + admin) return masked projections only; encrypted values and fingerprints are stripped in the service layer.
- `redact.ts` masks `iban`, `account_number`, `account_value`, `identification_number`, `swift`, `routing_number`, `fingerprint`, plus all Phase 1/2 secret keys, in persisted `error_reports` (query/params/body/headers) — covered by tests.
- Audit events for banking operations record only bank name, last4, currency, status.

## Tested guarantees

`tests/phase3-crypto.test.ts` + `tests/phase3-merchant-kyb.test.ts`: encryption at rest (`v1$` prefix, plaintext absent), mask-only responses, duplicate detection across equivalent representations (409), step-up denial (403), cross-tenant denial (404/403), error-report redaction, security events for create/activate/deactivate/verification decisions, append-only transition history.
