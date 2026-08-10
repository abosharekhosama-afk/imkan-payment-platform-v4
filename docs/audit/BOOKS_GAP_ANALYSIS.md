# BOOKS GAP ANALYSIS — V4

**Date:** 2026-08-10  
**Extends:** `docs/books/BOOKS-INTEGRATION-GAP.md`

## Role split (binding)

- **Books:** Products, Items, Inventory, Invoice SoR (when DEC-016 chooses Books)
- **IMKAN:** Customers (payment-layer), Payment Links, Payments, Refunds, Financial Core, Providers, Events

## Present

- V4 outbox table + worker (stub delivery)
- Design contracts (`docs/BOOKS_INTEGRATION.md`, `packages/contracts`)
- Legacy Zoho OAuth client (MySQL; not registered on `/api/v1`)

## Missing

| Component | Status |
|---|---|
| V4 Books connector interface + worker | Missing |
| `books_sync_state` + external ID maps | Missing |
| Public Books-facing Payment Link APIs | Missing (merchant APIs exist; Books-oriented contract incomplete) |
| Customer `external_customer_id` / `source_system` | Partial/missing on V4 customers |
| Event delivery to Books | Missing |

## Gate

**BLOCKED BY: DEC-016** for choosing Zoho vs internal Books as primary connector.  
Internal connector + sync schema can proceed under P10 as design-compatible stand-in without inventing Zoho-specific production claims.
