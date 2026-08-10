# Rate Limiting Policy — IMKAN Payments V4 (P15.0)

**SoT:** `apps/api/src/foundation/rate-limit.ts` (`RATE_LIMIT_PLAN`, `rateLimit`)  
**Date:** 2026-08-10  
**Production Ready:** **NOT claimed**  
**Multi-instance / production distributed limiting:** **IMPLEMENTED (P15.2)** — requires `RATE_LIMIT_STORE=redis` + `REDIS_URL` in production. In-memory remains default for local/test only.

---

## 1. Purpose

Limit abuse (credential stuffing, checkout brute force, webhook floods, API-key scraping) without presenting the current in-process limiter as production-grade for horizontally scaled deployments.

---

## 2. Dimensions (policy targets)

| Dimension | Intent | Current implementation |
|---|---|---|
| **Per IP** | Bound anonymous / public abuse | Implemented via `ip:{bucket}:{ip}` for all `RATE_LIMIT_PLAN` buckets |
| **Per user** | Bound authenticated session abuse | **NOT IMPLEMENTED** as a first-class counter (org/IP only today) |
| **Per org** | Bound tenant-wide automation | Implemented where `perOrg` is set and `request.auth.organizationId` is present |
| **Per API key** | Bound a single key | Schema supports `perKey`; **no bucket currently sets `perKey`** in `RATE_LIMIT_PLAN` |
| **Per endpoint / bucket** | Different sensitivity classes | Implemented as named buckets (below) |

Auth identity lockout (failed login counters / `locked_until` in `identity-service.ts`) is a **separate** control from HTTP rate-limit buckets and does not replace distributed rate limiting.

---

## 3. Buckets already in `RATE_LIMIT_PLAN`

Evidence: `RATE_LIMIT_PLAN` in `apps/api/src/foundation/rate-limit.ts`.

| Bucket | perIp | perOrg | perUser | Window | Typical routes |
|---|---:|---:|---:|---:|---|
| `checkout.read` | 120 | — | — | 60s | Public checkout read |
| `checkout.session` | 30 | — | — | 60s | Checkout session create |
| `checkout.payment` | 20 | — | — | 60s | Checkout pay / confirm |
| `payment_links.write` | 60 | 120 | — | 60s | Payment link create/mutate |
| `payments.read` | 300 | 600 | — | 60s | Payment / config reads |
| `api_keys.manage` | 20 | 40 | — | 60s | API key create/revoke (sensitive) |
| `webhooks.ingress` | 120 | — | — | 60s | Provider webhook receive |
| `providers.read` | 120 | 300 | — | 60s | Provider catalog / account reads |
| `auth.login` | 20 | — | — | 60s | `POST /auth/login` |
| `auth.register` | 10 | — | — | 60s | `POST /auth/register` |
| `auth.password_reset` | 10 | — | — | 60s | forgot/reset password |
| `auth.email_verification` | 20 | — | — | 60s | verify-email / resend-verification |
| `auth.mfa` | 30 | — | 20 | 60s | `POST /auth/mfa/verify` |
| `users.invite` | 30 | 60 | — | 60s | invitation create |

Alias: `rateLimitPrep` ≡ `rateLimit` (Phase 4 imports).

Hits that exceed a limit are audited best-effort into `rate_limit_events` (insert failures must not break the request path).

Non-production raises auth bucket ceilings so shared-process vitest suites do not false-trip limits.

---

## 4. Auth endpoints (wired; distributed store still BLOCKED)

| Endpoint class | Examples | Policy expectation | Current status |
|---|---|---|---|
| Login | `POST /auth/login` | Strict per-IP | **Wired** (`auth.login`) — store in-memory |
| Signup / register | `POST /auth/register` | Per-IP | **Wired** (`auth.register`) |
| Password reset | forgot / reset | Per-IP | **Wired** (`auth.password_reset`) |
| Email verification | verify / resend | Per-IP | **Wired** (`auth.email_verification`) |
| MFA | mfa verify | Per-IP + per-user | **Wired** (`auth.mfa`); step-up route not separately bucketed |
| Invite create | invitations POST | Per-IP + per-org | **Wired** (`users.invite`) |

**Status summary:** HTTP auth buckets **wired** for single process. Multi-instance production rate limiting remains **BLOCKED** until Redis (or equivalent) is connected. Do not claim production-ready distributed RL.

---

## 5. Burst / retry behavior

| Behavior | Specification | Evidence |
|---|---|---|
| Algorithm | Fixed window per counter key (in-memory `Map`) | `bump()` in `rate-limit.ts` |
| Over limit | HTTP **429** `RATE_LIMITED` | `AppError('RATE_LIMITED', …, 429, { bucket, reset_at })` |
| Client hint | `reset_at` ISO-8601 timestamp | Response details payload |
| Retry guidance | Clients SHOULD wait until `reset_at`; blind immediate retries amplify lockout risk | Policy (not auto-enforced client-side) |
| Burst | Allowed up to the window limit; no separate token-bucket burst credit | Current code |

There is **no** claim of sliding-window fairness across instances.

---

## 6. Abstraction vs storage

| Layer | Requirement | Status |
|---|---|---|
| **Abstraction** | Named buckets + `rateLimit(bucket)` preHandler | **PASS** (present) |
| **In-memory store** | `Map` counters process-local | **PASS** for **single-instance** local/dev |
| **Shared store (Redis)** | Required so all API replicas share counters | **NOT IMPLEMENTED** → **BLOCKED** for multi-instance production |
| **Audit trail** | `rate_limit_events` | **PASS** (best-effort insert) |

### Deployment rule

| Topology | Rate limiting verdict |
|---|---|
| Single API process | In-memory OK for development / constrained demos |
| Multiple API instances / k8s replicas | In-memory **bypassed** by spreading load → **BLOCKED** until Redis (or equivalent) backend |
| Production go-live | Must not claim production-ready rate limiting without shared store + auth-bucket coverage |

Ops note: `docs/ops/P11_INFRASTRUCTURE.md` lists Redis as optional today; distributed rate limit depends on wiring it.

---

## 7. Honest status (P15.0)

| Item | Status |
|---|---|
| Checkout / payment-link / payments / api_keys / webhooks / providers buckets | **PASS** (single-instance) |
| Auth login/signup/reset/MFA/invite HTTP buckets | **PARTIAL** / **NOT IMPLEMENTED** |
| Per-user counters | **NOT IMPLEMENTED** |
| Per-API-key counters in plan | **NOT IMPLEMENTED** (`perKey` unused) |
| Redis-backed multi-instance | **BLOCKED** |
| Production-ready rate limiting | **NOT claimed** |

See also: `P15_0_SECURITY_AUDIT.md` (Rate limiting → BLOCKED prod Redis), `docs/implementation/API_KEYS_AND_RATE_LIMITS.md`.
