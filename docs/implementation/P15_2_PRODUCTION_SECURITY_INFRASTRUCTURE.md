# P15.2 — Production Security & Infrastructure Gate

**Date:** 2026-08-10  
**Scope:** Redis RL, secrets architecture, session cookies, monitoring baseline, backup/restore, production config  
**Live Provider:** **NOT started** (P15.3)  
**P15.1-F:** **NOT started**  
**Production Ready claim:** **Forbidden**

---

## Goals

Make IMKAN Payments **ops-safe enough to host a future Live Provider**, without activating any live rail in this phase.

## What shipped

### 1. Redis / distributed rate limiting

| Item | Path |
|---|---|
| `RedisRateLimitStore` (INCR + PEXPIRE) | `apps/api/src/foundation/rate-limit-store.ts` |
| Bootstrap (prod requires Redis) | `apps/api/src/foundation/rate-limit-bootstrap.ts` |
| FakeRedis multi-instance tests | `apps/api/src/foundation/fake-redis.ts`, `tests/p15-2-redis-rate-limit.test.ts` |
| Wired on API start | `apps/api/src/server.ts` |

Production: `RATE_LIMIT_STORE=redis` + `REDIS_URL` required. In-memory forbidden in production.

### 2. Secrets / KMS architecture

| Backend | Status |
|---|---|
| `env` | Implemented |
| `file` | Implemented (local vault JSON) |
| `kms` | Architecture + injectable fetch; vendor SDK **not** connected |

Metadata table: migration `033_p15_2_secret_references.sql`  
APIs: `GET/POST /api/v1/secrets/references` (refs only — never secret values)  
Sandbox webhook resolves via `resolveSecretRef('SANDBOX_WEBHOOK_SECRET')` with config fallback.

### 3. Session security

| Control | Status |
|---|---|
| HttpOnly session cookie `imkan_session` | Implemented |
| CSRF double-submit `imkan_csrf` + `X-CSRF-Token` | Implemented |
| Production transport default `cookie` | Implemented |
| Bearer still for API keys / tests / dual | Preserved |
| Frontend production: no localStorage session token | `AuthProvider` + `credentials: 'include'` |

### 4. Monitoring / alerting baseline

- `GET /api/v1/health` / `health/ready` (PG + Redis/RL when required)
- `GET /api/v1/metrics` (+ prometheus text)
- Alert rules in `observability/alerts.ts`
- Structured logging helpers + request completion logs

### 5. Backup / restore

- `npm run ops:pg-backup`
- `npm run ops:pg-restore`
- `npm run ops:pg-backup-drill` — **local drill PASS** (evidence under `docs/ops/`)

### 6. Production configuration hardening

- Explicit `PAYMENT_PROVIDER` required in production (no silent sandbox default)
- Redis + cookie session requirements asserted at config load
- Docs: `docs/ops/PRODUCTION_CONFIGURATION.md`

### 7. Sandbox preserved

Internal sandbox adapter remains registered and tested. No live provider activation.

## Intentionally not done

- PayTabs / any Live Provider (P15.3)
- P15.1-F Reconciliation
- KMS vendor SDK connection
- Offsite WAL / PITR
- External pen-test / load test
- Claiming Production Gate PASS
