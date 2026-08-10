# Phase 6 Completion Report — Billing

**Date:** 2026-08-09  
**Status:** COMPLETE — stop before Phase 7 (Financial Core)  
**Production Ready:** **No**

## Decisions recorded

| ID | Status |
|---|---|
| DEC-007 | **RESOLVED** — Option A (Billing Collection + Deferred Ledger); retries 3; backoff 5m/10m; grace 3d; no ledger |
| DEC-006 | **INTERIM** — `(organization_id, lower(email))` uniqueness; no auto-merge |

## Delivered

| Area | Evidence |
|---|---|
| Customers / Products / Prices | Migrations `018`, services, APIs, UI |
| Subscriptions + state machine | `019`, transitions, pause/resume/cancel |
| Invoices + period uniqueness | Unique index; invoice items |
| Renewal worker + collection | `renewal-service.ts` → `paymentCoreService.collectForBilling` → Provider Router → Sandbox |
| Failed / retry / ambiguous | PAST_DUE → UNPAID + grace → EXPIRED; query-before-retry |
| RBAC + API keys scopes | Migration `020`; expanded scopes |
| UI (V4) | Customers / Subscriptions / Invoices on `/api/v1` |
| Events | `billing.*` outbox stubs |
| Docs | `06-billing.md`, `BILLING_API.md`, state machine, renewal worker, this report |

## Explicit non-claims

- Not Production Ready
- No live recurring / real-provider capability (DEC-009 still required)
- **No ledger**, balances, settlement, payouts, fees engine (Phase 7 / DEC-008)
- Upgrade/downgrade/proration out of MVP
- Legacy `/v1` MySQL billing remains frozen

## Tests

| Suite | Result |
|---|---|
| `npm run test:pg` | **88/88 PASS** (migrations 000–020) |
| `npm test` | **109/109 PASS** |

## STOP

**Do not start Phase 7 Financial Core** until separate approval.
