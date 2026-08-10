# CURRENT STATE — IMKAN Payments V4

**Audit date:** 2026-08-10  
**SoR:** PostgreSQL 16 + `/api/v1`  
**Legacy:** MySQL `/v1` frozen (DEC-014)  
**Production Ready claim:** **NOT MADE**

---

## Phase ladder

| Phase | Status |
|---|---|
| 1 Foundation | COMPLETE |
| 2 Identity / Tenant | COMPLETE |
| 3 Merchant / KYB | COMPLETE |
| 4 Payment Core | COMPLETE (sandbox) |
| 5 Providers / Webhooks / API keys | COMPLETE (sandbox adapter only) |
| 6 Billing | COMPLETE (sandbox collection; no ledger) |
| 6.5 V4 Console | ACCEPTED + browser E2E journeys |
| 6.6 RBAC | Hardened (see RBAC_GAP_ANALYSIS) |
| 7 Financial Core | **NOT STARTED** |

---

## Domain inventory

| Domain | State | Primary evidence |
|---|---|---|
| Auth (register/login/MFA/sessions/step-up/password flows) | Present | `apps/api/src/foundation/identity-*.ts`, `phase2-routes.ts` |
| Organizations / membership / invites | Present | `001_foundation_identity_tenant.sql`, org routes |
| RBAC (system + custom roles) | Present | migrations `002`–`023`, `authz.ts`, `phase6_6-rbac-routes.ts` |
| Master data | Present | `008_phase3_master_data.sql` |
| Merchant profile / KYB / documents / bank accounts | Present | `009`–`010`, `apps/api/src/merchant/*` |
| Payments / intents / FSM | Present (sandbox) | `013`, `payment-core-service.ts` |
| Payment Links | Present | `payment-links-service.ts` |
| Hosted Checkout | Present | `apps/web/src/v4/public-checkout/CheckoutPage.tsx` |
| Customers / Products / Prices / Subscriptions / Invoices | Present | `018`–`019`, `phase6-routes.ts` |
| Provider Router + Sandbox Adapter | Present | `apps/api/src/providers/*` |
| Inbound provider webhooks | Partial (verify/dedupe/outbox; no PI apply) | `webhook-service.ts` |
| API keys + rate limit | Present | `016`, `phase5-routes.ts` |
| Merchant V4 Console | Present | `apps/web/src/v4/*` |
| Platform Admin Console UI | **Missing** | Admin APIs only (`/admin/kyb/*`, `/admin/bank-accounts/*`) |
| Ledger / Balances / Settlements / Payouts / Reconciliation | **Missing** | Phase 7+ |
| Refunds (V4) | **Missing** | Deferred perms + coming-soon UI |
| Risk / Disputes | **Missing** | — |
| Books V4 connector | **Missing** | Legacy Zoho client only; DEC-016 OPEN |
| Outbound merchant webhooks | **Missing** on V4 | Outbox worker stub |
| Real email delivery | Stub | DEC-017 OPEN |

---

## Architecture spine (do not rebuild)

```
V4 Console → /api/v1 → Payment Core → Provider Router → Sandbox Adapter
                         ↑
              Inbound Webhooks → Webhook Service → Outbox (stub delivery)
```

---

## Database

Migrations: `database/migrations/postgres/000`–`023` (latest: `023_phase6_6_rbac_hardening.sql`).  
No `ledger_*`, `refunds`, `settlements`, `payouts` (runs), `disputes`, or `books_sync_*` tables.
