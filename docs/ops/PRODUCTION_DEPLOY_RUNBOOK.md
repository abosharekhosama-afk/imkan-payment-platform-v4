# Production Deploy Runbook — Payment Platform V4

**Audience:** Platform ops  
**Goal:** Deploy collection layer (Stripe Live + SMTP + KYB + outbox) with managed PostgreSQL and Redis.

---

## Phase 0 — Prerequisites

- Managed **PostgreSQL 16+** (or `docker compose -f docker-compose.infra.yml up -d` for staging only)
- Managed **Redis 7+** with password/TLS
- **HTTPS** terminators for API and Web (reverse proxy / load balancer)
- **SMTP** relay (SendGrid, SES, Mailgun, etc.)
- **Stripe Live** account + webhook endpoint URL on public HTTPS

---

## Phase 1 — Infrastructure

### 1.1 PostgreSQL

```bash
# After DATABASE_URL_PG is set:
npm run db:migrate:pg
npm run seed:platform-owner    # once
npm run seed:stripe-routes     # all orgs → platform Stripe account
```

**Backup (schedule daily):**

```bash
npm run ops:pg-backup
# Output: .tmp/pg-backups/imkan_payments_<timestamp>.sql
```

Restore drill: `npm run ops:pg-backup-drill`

### 1.2 Redis

Set in API `.env`:

```bash
REDIS_URL=redis://:PASSWORD@redis.example.com:6379/0
RATE_LIMIT_STORE=redis
```

Production **refuses to start** without Redis + `RATE_LIMIT_STORE=redis`.

### 1.3 HTTPS & URLs

| Variable | Example |
|----------|---------|
| `APP_PUBLIC_URL` | `https://app.example.com` |
| `CORS_ORIGIN` | `https://app.example.com` |
| `TRUST_PROXY` | `true` |

---

## Phase 2 — API environment

1. Copy `.env.production.example` → `.env` on the API host
2. Fill all `REPLACE_*` secrets with cryptographically random values
3. Validate:

```bash
npm run ops:production-preflight -- --env .env
```

4. Start API (example):

```bash
NODE_ENV=production npm run dev -w apps/api
# Or: node apps/api/dist/server.js after npm run build -w apps/api
```

5. Verify readiness:

```bash
curl -s https://api.example.com/api/v1/health/ready
# Expect 200 + postgres + redis ok
```

---

## Phase 3 — Web build & deploy

1. Copy `apps/web/.env.production.example` → `apps/web/.env.production`
2. Set `VITE_API_URL=https://api.example.com` and `VITE_SESSION_TRANSPORT=cookie`
3. Build:

```bash
npm run build:web:production
```

4. Deploy `apps/web/dist/` to CDN/nginx/object storage behind HTTPS

---

## Phase 4 — Stripe Live

### Env (already in `.env.production.example`)

```bash
PAYMENT_PROVIDER=stripe
STRIPE_ENV=live
STRIPE_ALLOW_LIVE=true
STRIPE_ADAPTER_MODE=http
STRIPE_AUTO_ROUTE=false
STRIPE_CHECKOUT_UI=elements
STRIPE_LIVE_SECRET_KEY=sk_live_...
STRIPE_LIVE_PUBLISHABLE_KEY=pk_live_...
STRIPE_LIVE_WEBHOOK_SECRET=whsec_...
```

### Stripe Dashboard

- **Webhook URL:** `https://api.example.com/api/v1/webhooks/providers/stripe`
- **Events:** `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`

### Verify

```bash
npm run stripe:preflight
npm run prepare:stripe-production   # migrate + seed routes + preflight
```

**Smoke test:** Create one-time payment link → pay small amount → PI `SUCCEEDED` → link `EXPIRED`.

---

## Phase 5 — Email & verification

```bash
EMAIL_TRANSPORT=smtp
REQUIRE_EMAIL_VERIFICATION=true
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
EMAIL_FROM=payments@example.com
```

Required for: signup verification, platform invitations, KYB notifications.

`OUTBOX_WORKER_ENABLED=true` must be set (enforced in production).

---

## Phase 6 — KYB gate

```bash
REQUIRE_KYB_FOR_PAYMENTS=true
```

Merchants cannot create payment links until KYB is approved via **Platform → KYB Review** (`/platform/kyb`).

---

## Phase 7 — Books outbound webhook

After first merchant onboarded:

1. Merchant console → **Developers → Outbound Webhooks**
2. Or Platform → **Webhook deliveries** for retries

See [BOOKS_PAYMENT_LINK_FLOW.md](../books/BOOKS_PAYMENT_LINK_FLOW.md).

---

## Quick command reference

| Command | Purpose |
|---------|---------|
| `npm run ops:production-preflight` | Validate env + PG + Redis |
| `npm run db:migrate:pg` | Apply PostgreSQL migrations |
| `npm run ops:pg-backup` | Logical backup |
| `npm run build:web:production` | Build static web console |
| `npm run prepare:stripe-production` | Migrate + seed Stripe + preflight |
| `docker compose -f docker-compose.infra.yml up -d` | Local staging PG + Redis |

---

## Related docs

- [PAYMENT_PRODUCTION_CLOSURE.md](./PAYMENT_PRODUCTION_CLOSURE.md)
- [STRIPE_PRODUCTION_DEPLOY.md](./STRIPE_PRODUCTION_DEPLOY.md)
- [PRODUCTION_CONFIGURATION.md](./PRODUCTION_CONFIGURATION.md)
