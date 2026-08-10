# Books Integration — Gap Report

**Date:** 2026-08-09  
**Target architecture (spec `00` §16, `11` §O):** `Domain Event → Outbox → Books Worker → Books Connector → Books API / Internal Books System`. Payment Core must never call Books directly.

## What exists

| Component | Location | State |
|---|---|---|
| Outbox (V4, PostgreSQL) | `outbox_events` (migrations 004, 012) + `foundation/outbox-worker.ts` | ✅ Real, transactional, tested. Worker currently has **stub handlers** (marks email/kyb/bank events processed, no external delivery — DEC-017 pattern) |
| Outbox (legacy, MySQL) | `outbox_events` + `integration_outbox`/`integration_inbox` (migration 008) + `application/integrations.ts` | 🟡 Dual-write helper exists; feeds the legacy **merchant webhook** worker, not a Books worker |
| Zoho Books connector | `apps/api/src/infrastructure/integrations/zoho-books.ts` | 🟡 Real OAuth2 client (encrypted access/refresh tokens in MySQL `integration_connections`), invoice lookup + customer-payment creation — but the HTTP routes that would use it are **instantiated and never registered** (dead wiring in legacy `routes.ts`) |
| Books contract document | `docs/BOOKS_INTEGRATION.md` | ✅ Payments↔Books contract (idempotency keys `books:{invoice_id}:{attempt}`, external ids, HMAC webhooks, no card data) — still a valid design reference |
| Event contract types | `packages/contracts` (`PlatformEvent`, payment/refund/settlement/payout payloads) | 🟡 Defined, **consumed by nothing** |
| Books worker | — | 🔴 MISSING (both generations) |
| Books simulator | — | 🔴 MISSING (no simulator component exists; note: the spec does not mandate a named simulator — an *internal Books system* behind the connector is the allowed stand-in) |
| Sync-status / mapping storage (V4) | — | 🔴 MISSING (`books_sync_state`, external-id mapping tables not designed yet) |

## Contracts

- **Exists:** `docs/BOOKS_INTEGRATION.md` (flow, idempotency, external IDs, security) and `packages/contracts` event payload types.
- **Missing:** V4-side canonical event schema per domain (customer/payment/invoice/refund/fee/payout/settlement/reconciliation), versioned; mapping-table design (`external_customer_id`, `external_invoice_id`, `external_payment_id` per Books target); sync-state model (PENDING / SYNCED / FAILED / RETRYING with attempt counts and last error).

## Events

- V4 outbox already emits domain events with idempotency keys where meaningful (`kyb.*`, `bank_account.*`, `email.*`); payment-domain events (`payment.succeeded`, `refund.succeeded`, …) will exist once Phase 4 lands — the Books worker consumes those, so **Books work cannot start before Payments events exist** (it can be designed in parallel).

## Mapping (required by spec, none implemented on V4 side)

| Domain | Books mapping needed |
|---|---|
| Customer | create/lookup by `external_customer_id` |
| Payment | customer payment record against invoice |
| Invoice | invoice lookup/creation policy (depends on DEC-016: Zoho owns invoices vs internal Books) |
| Refund | credit note / payment reversal |
| Fee | expense/journal mapping (blocked by DEC-008 fee rules) |
| Payout / Settlement | transfer/journal entries |
| Reconciliation | sync verification report |

## Outbox / Worker / Retry / Idempotency requirements (to build)

1. **Books worker** as a dedicated consumer of `outbox_events` (PG): claim → transform → deliver → record `books_sync_state`; batch + interval like the existing outbox worker.
2. **Retry:** exponential backoff, max attempts, then parked FAILED state visible in an admin surface (Error/Incident Center per `11` §M); manual replay.
3. **Idempotency:** deterministic delivery keys (`books:{aggregate}:{event_id}`); Books-side duplicate rejection per the contract doc; never re-post a SYNCED event.
4. **Failure recovery:** worker restart-safe (claimed-but-unfinished events re-eligible); poison-event quarantine.
5. **Audit:** every delivery attempt recorded (who/what/when/result).

## Simulator → Real Books migration path

1. **Now (Phase 4–8):** define canonical event schemas (adopt/extend `packages/contracts`), add mapping + sync-state tables in a Payments-era migration wave.
2. **Books phase, step 1:** implement Books worker + a `BooksConnector` interface with an **internal connector** (writes to internal Books tables or a minimal internal Books system — the spec-allowed stand-in). All retry/idempotency/sync-state logic is exercised for real against the internal target.
3. **Books phase, step 2 (after DEC-016):** implement the real connector behind the same interface — Zoho connector can reuse the existing OAuth client (port token storage from MySQL `integration_connections` to PG). Payment Core is untouched: only a connector registration changes.
4. **Cutover:** dual-run window (internal + real connector in shadow mode) → reconcile → switch primary → keep internal as fallback record.

**Blockers:** DEC-016 (target system) for step 2; Zoho credentials (external) if Zoho is chosen. Steps 1 and the schema work have no external blockers.
