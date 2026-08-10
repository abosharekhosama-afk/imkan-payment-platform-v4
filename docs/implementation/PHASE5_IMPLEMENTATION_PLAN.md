# Phase 5 Implementation Plan — Providers

**Date:** 2026-08-09  
**Baseline:** Phase 4 COMPLETE (Payment Core → direct `getPaymentProvider()` sandbox).  
**Scope:** V4 PostgreSQL + `/api/v1` only. Legacy `/v1`/MySQL feature-frozen (no expansion).

## Reuse from Phase 4

| Asset | Action |
|---|---|
| `payments/provider-interfaces.ts` sandbox behavior | Move behind V4 adapter registry; keep Phase 4 file as thin re-export or switch callers to router |
| `payment-core-service.ts` confirm/create calls | Replace `getPaymentProvider()` with `providerRouter.resolve(...).adapter` — **no payment FSM rewrite** |
| `rate-limit-prep.ts` hook points | Replace no-op with real limiter |
| Outbox + audit/security events | Reuse for provider/webhook/api-key events |
| `master_provider_types` / `master_provider_capabilities` | Reference for capability codes where useful; operational capabilities live on provider tables |

## Do not touch

- Phase 4 payment tables DDL / state machine semantics
- Migrations 000–014
- Legacy MySQL routes/adapters (except freeze note in docs)
- Billing / Ledger / Settlement / Payouts / Risk / Disputes / Books

## Build order

1. Migrations 015–017: providers domain, inbound webhooks, API keys + rate-limit audit support, RBAC
2. Provider errors / retry / timeout helpers
3. Canonical `ProviderAdapter` contract + sandbox adapter registration
4. Provider registry persistence + router (env + capability + route rules)
5. Wire Payment Core → Router → Sandbox
6. Webhook ingress service + public route `/api/v1/webhooks/providers/:providerCode`
7. API keys + auth hook support + rate limiting
8. Contract tests + PG integration + webhook security tests
9. Docs + readiness matrix update + `PHASE5_COMPLETION_REPORT.md`

## Production gate (explicit non-claim)

Sandbox-through-router ≠ Production Ready. Live provider activation requires DEC-009, checklist, agreements, credentials, sandbox/live evidence.
