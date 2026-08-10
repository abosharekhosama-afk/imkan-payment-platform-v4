# Monitoring & Alerting Baseline — P15.2

**Status:** Implemented (in-process metrics + alert rules)  
**Not claimed:** Full observability platform / on-call Production Ready

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/health` | Liveness |
| `GET /api/v1/health/ready` | Readiness: PostgreSQL, Redis (when required), rate-limit store, secret backend |
| `GET /api/v1/metrics` | JSON counters + alert evaluations |
| `GET /api/v1/metrics?format=prometheus` | Text exposition for scrapers |

## Instrumented signals

- `http_requests_total`
- `provider_requests_total` / `provider_failures_total` (hook points for P15.3)
- `webhook_failures_total`
- `payment_failures_total`
- `ambiguous_payments_total`
- `refund_failures_total`
- `settlement_failures_total`
- `payout_failures_total`
- `auth_failures_total`
- `security_events_total`
- `outbox_failures_total`
- `rate_limit_hits_total`
- `csrf_failures_total`

## Alert rules

Defined in `apps/api/src/observability/alerts.ts` (`ALERT_RULES`).  
Evaluation is available via `/api/v1/metrics` → `alerts[]` with `firing` boolean.

Wire these to PagerDuty/Opsgenie/Slack in deployment — **not** auto-paged in P15.2.

## Correlation

- Fastify `genReqId` UUID on every request
- Response `meta.request_id` / error `request_id`
- Structured log fields via `observability/logging.ts` (secret-safe)
