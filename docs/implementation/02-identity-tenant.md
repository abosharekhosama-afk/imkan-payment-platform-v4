# Implementation Record — 02 Identity / Tenant (Phase 2)

| Field | Value |
|---|---|
| Status | COMPLETE (not Production Ready) |
| Phase | Identity / Tenant |
| Date | 2026-08-08 |
| Baseline | `PHASE1_FINAL_AUDIT.md` |

## Scope delivered

- Email verification + resend
- Password forgot / reset / change (change requires step-up)
- Organization invitations create/list/revoke/accept
- User deactivate within organization (step-up)
- MFA login E2E + step-up tokens for sensitive ops
- Idempotency-Key middleware (mutating ops that opt in)
- Outbox worker (adapter-stub processing)
- api/v1 redacted `error_reports` persistence + list API

## API (`/api/v1`)

| Method | Path | Auth |
|---|---|---|
| POST | `/auth/verify-email` | public |
| POST | `/auth/resend-verification` | public |
| POST | `/auth/password/forgot` | public |
| POST | `/auth/password/reset` | public + Idempotency-Key |
| POST | `/auth/password/change` | session + step-up + Idempotency-Key |
| POST | `/auth/mfa/step-up` | session + MFA |
| POST | `/invitations/accept` | public/optional session + Idempotency-Key |
| POST/GET | `/organizations/:id/invitations` | RBAC + step-up on create |
| POST | `/organizations/:id/invitations/:id/revoke` | RBAC + step-up |
| POST | `/organizations/:id/users/:userId/deactivate` | RBAC + step-up |
| GET | `/error-reports` | RBAC org-scoped |

## Database

Migrations:
- `006_phase2_identity.sql`
- `007_phase2_rbac_seed.sql`

## Security

- Tenant isolation on invitation/member APIs
- Step-up required for invite create/revoke, deactivate, password change
- Dev tokens never exposed when `NODE_ENV=production`
- `REQUIRE_EMAIL_VERIFICATION` forced true in production
- Error reports store redacted payloads only

## Phase 1 partials addressed

| Partial | Resolution |
|---|---|
| Email verification / password reset / invitations | Implemented |
| Idempotency-Key middleware | Implemented for opted-in mutations |
| Outbox worker | Implemented (stub handlers; no invented SMTP provider) |
| Full MFA login E2E / step-up | Implemented + tested |
| api/v1 error-report parity | Implemented |

## Limitations

- No real email provider adapter (outbox events only) — DEC for vendor later
- Session device management is minimal (`device_label`/`last_seen_at` columns reserved)
- Not Production Ready

## Tests

`npm run test:pg` includes `tests/phase2-identity.test.ts`.
