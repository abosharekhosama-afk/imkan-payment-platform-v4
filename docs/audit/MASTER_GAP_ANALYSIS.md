# MASTER GAP ANALYSIS — Production Plan vs Current Code

**Date:** 2026-08-10

| Domain | Target | Current | Gap severity |
|---|---|---|---|
| Auth / Org | Full signup → verify → org | Present; onboarding wizard incomplete | Medium |
| Merchant KYB | Guided onboarding → dashboard | APIs + pages; no wizard flow | Medium |
| RBAC / Tenant isolation | Production-grade | Strong; F-04 aggregates BC; no RLS | Medium |
| Payments / Links / Checkout | Full lifecycle + webhooks apply | Sandbox create/pay/cancel; BG-W1 | High |
| Providers | Live + capability matrix | Sandbox only; DEC-009 OPEN | Critical (live) |
| Billing / Subscriptions | Payment-layer billing | Present sandbox; BG-E1 | Medium |
| Refunds | Full/partial | Missing | Critical |
| Financial Core | Double-entry ledger + balances | Missing | Critical |
| Settlement / Payout / Reconciliation | Money movement | Missing | Critical |
| Risk / Disputes | Foundation + UI | Missing | High |
| Books | Event → worker → connector | Missing; DEC-016 OPEN | Critical (integration) |
| Platform Admin UI | Separate console | APIs only | High |
| Reports / Analytics | Real DB-backed | Dashboard aggregates only; reports coming-soon | High |
| i18n AR/EN + RTL | Full product | Thin `messages.ts` + appearance RTL | Medium |
| Ops (email, secrets, backup, monitoring) | Production | Stubs / DEC OPEN | Critical |

See also: `PRODUCTION_BLOCKERS.md`, `PRODUCTION_ROADMAP.md`.
