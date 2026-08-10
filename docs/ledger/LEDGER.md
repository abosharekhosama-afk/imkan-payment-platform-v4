# Ledger (Financial Core)

**Status:** Hardened (P15.1-B) + Balances contract (P15.1-C)  
**Fees / FX:** DEC-008 **RESOLVED** — see `docs/decisions/DEC-008-FINANCIAL-MODEL.md` (FX deferred)

## Model

Double-entry journals with immutable entries (trigger `028`). Corrections via compensating journals.

**Idempotency (I4):** unique partial index `ledger_journals_source_uq` on  
`(organization_id, source_type, source_id)` where both source fields are set.  
Service posts via SAVEPOINT-safe idempotent insert (`030` + `ledger-service`).

Default accounts per org/currency/environment:

- `pending_settlement` (ASSET)
- `merchant_payable` (LIABILITY)
- `cash_provider`, `platform_revenue`, `refunds_expense`

## Payment succeeded

Debit `pending_settlement` / Credit `merchant_payable` for amount_minor.  
Source: `payment_intent` + payment_intent id.

## Refund

Debit `merchant_payable` / Credit `pending_settlement`.  
Source: `refund` + refund id.

## Settlement finalize fees (helper — P15.1-B; wire in D)

Source: `settlement_finalize` + settlement id.

- Debit `merchant_payable` for (platform_fees + provider_fees)
- Credit `platform_revenue` for platform_fees (if > 0)
- Credit `cash_provider` for provider_fees (if > 0)
- Skip journal when both fees are 0

## Payout paid (P15.1-E)

Source: `payout` + payout id.  
Debit `merchant_payable` / Credit `cash_provider`.  
Wired on `POST /payouts/:id/mark-paid`.

## Balances API (P15.1-C)

`GET /balances` — Financial Core SoT (`source: financial_core`):

| Bucket | Formula |
|---|---|
| Pending | max(0, net `pending_settlement`) |
| Available | max(0, −net `merchant_payable`) |
| Reserved | SUM(FINALIZED `reserves_minor`) — 0 while DEC-008.3 deferred |
| Settled | SUM(payout journal DEBIT `merchant_payable`) |

Multi-currency via `currencies[]`. Never summed in the browser.  
See `docs/implementation/P15_1C_BALANCES.md`.
