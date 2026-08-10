# Implementation Record — 01 Foundation (Phase 1)

| Field | Value |
|---|---|
| Status | COMPLETE — see `PHASE1_COMPLETION_REPORT.md` |
| Phase | Foundation |
| Date | 2026-08-08 |
| Decisions applied | DEC-001, DEC-002, DEC-003 (decision only), DEC-004 (decision only), DEC-014 |

---

## Scope

PostgreSQL foundation; organizations/tenant model; users/sessions/MFA foundations; RBAC; audit/security/login events; outbox/idempotency foundations; `/api/v1` base architecture; config/secrets structure; testing foundation.

**Out of scope:** Payments, Payouts, Ledger data migration, Provider production integrations, Books.

---

## Implementation summary

- Added PostgreSQL 16 to `docker-compose.yml` **alongside** retained MySQL (DEC-014).
- Created `database/migrations/postgres/000`–`005` for foundation schema + RBAC seed.
- Added `pg` pool, `db:migrate:pg`, and `/api/v1` routes (DEC-002).
- Identity: register (user+org+MERCHANT_OWNER), login, MFA challenge foundation, logout, me.
- AuthZ: bearer sessions, permission checks, **rejects `X-Tenant-ID`**, cross-tenant denial.
- Audit/security/login events + outbox emit on registration.
- Money type spec documented (`docs/database/MONEY_TYPES.md`) — no payment money tables in Phase 1.

---

## Changed files (key)

- `docs/decisions/OPEN_DECISIONS.md`
- `DATA_MIGRATION_ANALYSIS.md`
- `docs/database/MONEY_TYPES.md`
- `database/migrations/postgres/*`
- `apps/api/src/infrastructure/db/postgres.ts`
- `apps/api/src/scripts/migrate-pg.ts`
- `apps/api/src/foundation/*`
- `apps/api/src/interfaces/http/apiV1/routes.ts`
- `apps/api/src/config.ts`, `server.ts`
- `docker-compose.yml`, `.env.example`, package manifests
- `tests/foundation-*.test.ts`

---

## Database

PostgreSQL migrations only. MySQL untouched.

---

## API

Base: `/api/v1/*`  
Legacy `/v1` remains behind `ENABLE_LEGACY_V1` (default true).

---

## Security

- Server-side RBAC on protected `/api/v1` routes
- Tenant isolation via `organization_id` + membership checks
- No legacy tenant header on V4 API
- Secrets via env; production rejects insecure defaults for webhook/encryption keys

---

## Financial impact

None (no payment/ledger/payout operations).

---

## Tests / verification

See Phase 1 completion report after test run.

---

## Limitations

- Email verification / password reset not fully implemented (Identity Phase 2 depth)
- Master Data admin not built (DEC-004 decision recorded; surface later)
- Customers/Payment Links tables not created yet (DEC-003 unlocks later Payments/Merchant phases)
- No production data migration (DEC-014)

---

## Production readiness

**Not Production Ready.** Foundation only.
