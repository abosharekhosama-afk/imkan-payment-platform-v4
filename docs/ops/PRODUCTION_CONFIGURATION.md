# Production Configuration — P15.2

## Required in `NODE_ENV=production`

| Variable | Requirement |
|---|---|
| `REDIS_URL` | Required — distributed rate limiting + readiness |
| `RATE_LIMIT_STORE` | Must be `redis` (memory forbidden) |
| `PAYMENT_PROVIDER` | **Explicit** — no silent default to sandbox |
| `SESSION_TRANSPORT` | `cookie` or `dual` (bearer-only needs break-glass flag) |
| `CORS_ORIGIN` | Explicit allowlist (no `*`) |
| `TRUST_PROXY` | `true` behind reverse proxy / TLS terminator |
| Encryption / webhook secrets | Non-dev values (existing `requiredInProduction`) |

## Recommended

| Variable | Purpose |
|---|---|
| `SECRET_BACKEND` | `env` \| `file` \| `kms` |
| `SECRET_FILE_PATH` | When `SECRET_BACKEND=file` |
| `KMS_PROVIDER` | When preparing KMS (`aws`\|`gcp`\|`azure`) — SDK not wired until later |
| `SESSION_COOKIE_SECURE` | Force Secure cookies outside NODE_ENV production |
| `SESSION_COOKIE_SAMESITE` | `lax` (default) \| `strict` \| `none` |
| `RATE_LIMIT_REDIS_PREFIX` | Key namespace (default `rl:`) |
| `LOG_LEVEL` | `info` / `warn` |

## Sandbox isolation

- Built-in `sandbox` adapter remains registered for test/sandbox deploys.
- Production must set `PAYMENT_PROVIDER` explicitly. Using `sandbox` in production is allowed only as an **explicit** non-live label until P15.3 live adapter exists — never as an accidental fallback when unset.
- Live provider activation is **out of scope for P15.2** (DEC-009).

## TLS

- Terminate TLS at reverse proxy / load balancer.
- Set `TRUST_PROXY=true` and `SESSION_COOKIE_SECURE` / production Secure cookies.
- API assumes HTTPS in production for Secure cookie semantics.

## Frontend

| Variable | Purpose |
|---|---|
| `VITE_SESSION_TRANSPORT` | `cookie` in production builds (no localStorage session tokens) |
| `VITE_API_URL` | API origin; client uses `credentials: 'include'` |
