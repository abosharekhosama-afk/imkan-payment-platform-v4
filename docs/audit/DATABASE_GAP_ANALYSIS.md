# DATABASE GAP ANALYSIS — PostgreSQL V4

**Date:** 2026-08-10  
**Migrations:** `database/migrations/postgres/000`–`023`

## Applied waves

| Range | Content |
|---|---|
| 000–005 | Schema bookkeeping, identity, RBAC, audit, outbox, seeds |
| 006–007 | Phase 2 identity tokens/invites + RBAC |
| 008–012 | Master data, merchant/KYB, banking accounts, RBAC, outbox fix |
| 013–014 | Payments / links / intents |
| 015–017 | Providers, webhooks, API keys |
| 018–020 | Customers, catalog, subscriptions, invoices |
| 021–023 | Phase 6.6 RBAC catalog, matrix, hardening |

## Present money-related tables

Payment intents/attempts/transactions · payment_links · provider_transactions · invoices · subscriptions · payout_**accounts** (metadata only)

## Missing tables (required for production money path)

| Table family | Purpose | Target phase |
|---|---|---|
| `ledger_accounts`, `ledger_entries` (immutable journals) | Double-entry SoT | P7 |
| `refunds` | Refund lifecycle | P6 |
| `balance_snapshots` / derived views | Available/pending/reserved | P7 |
| `settlements`, `settlement_lines` | Settlement cycles | P8 |
| `payouts` / `payout_runs` | Money movement (≠ payout_accounts) | P8 |
| `reconciliation_runs`, `discrepancies` | Provider↔ledger↔settlement | P8 |
| `risk_signals`, `disputes` | Risk/disputes | P9 |
| `books_sync_state`, external ID maps | Books connector | P10 |
| `webhook_endpoints`, `webhook_deliveries` | Outbound merchant webhooks | P4/P11 |

## Rules

- Additive migrations only (`024+`)
- Money: `NUMERIC(30,0)` minor units + `CHAR(3)` currency (DEC-001)
- Never edit applied migrations
