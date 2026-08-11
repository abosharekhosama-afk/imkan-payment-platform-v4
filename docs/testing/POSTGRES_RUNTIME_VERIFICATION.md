# PostgreSQL Runtime Verification

**Generated:** 2026-08-10T21:52:07.128Z  
**Overall status:** PASS

## Versions

| Item | Value |
|---|---|
| Package | `embedded-postgres@16.14.0-beta.17` |
| Compose / production target | `postgres:16-alpine` (PostgreSQL 16) |
| Runtime `SELECT version()` | `PostgreSQL 16.14, compiled by Visual C++ build 1944, 64-bit` |
| Major compatible with target 16? | **YES** |

## Migration status

| Pass | Result |
|---|---|
| First apply (empty DB) | PASS |
| Second apply (tracking / skip) | PASS |
| Schema object checks | PASS |

## Test status

| Suite | Result |
|---|---|
| Foundation integration (AuthZ / tenant isolation / RBAC) | PASS / PASS |
| Financial concurrency | PHASE4_PAYMENT_ATTEMPT_LOCKS |
| Financial invariants | P15_1B_LEDGER_SOURCE_UNIQUE |

## Known limitations

- embedded-postgres is non-production; Docker postgres:16-alpine remains the declared local/prod-shaped target.
- Migrations verified: 000–020 (Foundation through Phase 6 Billing).
- Phase 6 Billing uses Sandbox via Payment Core → Provider Router; no ledger (Phase 7); not Production Ready.
- Statuses use CHECK constraints (no ENUM types); append-only payment/KYB/bank transition tables are trigger-protected.

## Compatibility notes

- `embedded-postgres` is a **Development/Test Runtime only**.
- It must provide a **real PostgreSQL** binary; this verification rejects SQLite/MySQL/mocks.
- Passing this report does **not** mean PostgreSQL or the platform is Production Ready.
- Production/local Docker target remains `postgres:16-alpine`.
- MySQL remains retained per DEC-014; this script does not migrate or delete MySQL.

## Errors

- None
