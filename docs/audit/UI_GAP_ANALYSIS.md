# UI GAP ANALYSIS — V4 Console

**Date:** 2026-08-10  
**Entry:** `apps/web/src/main.tsx` → `apps/web/src/v4/*`  
**Nav:** `apps/web/src/v4/layouts/nav.ts`

## Present (wired)

Login · Dashboard · Payments · Transactions (composed) · Payment Links · Payment Config · Customers · Products · Prices · Subscriptions · Invoices · Merchant Profile/Business/KYB/Documents/Bank · Providers · Accounts/Routes · Webhook Events · API Keys · Users · Roles · Audit · Security Events · Errors · Organization · Appearance · Forbidden · Public Checkout

## Coming soon (placeholders)

Refunds · Balances · Settlements · Payouts · Reconciliation · Risk · Disputes · Reports · Ledger

## Missing

| Screen | Gap |
|---|---|
| Platform Admin Console | No separate platform UI (KYB review, orgs, system health) |
| Guided Merchant Onboarding Wizard | Pages exist; no single multi-step post-login wizard |
| Customer side-panel drawer | List pages only; no expandable detail pane |
| Books connect / sync status | None |
| Outbound webhook endpoint manager | None |
| Sandbox↔Live toggle | Blocked by DEC-012 |
| Full AR/EN product i18n | Thin catalog |

## UX rules for remaining work

- Never show fake balances/settlement/dispute numbers
- Permission-gate Coming Soon; backend remains authoritative
- Forms without manage permission must be non-editable (fieldset pattern)
