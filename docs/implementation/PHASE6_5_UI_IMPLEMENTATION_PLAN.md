# Phase 6.5 — V4 Console & UX Rebuild / Legacy UI Cutover

**Status:** PLAN ONLY — awaiting approval  
**Date:** 2026-08-09  
**Mode:** Audit + plan. **No implementation until explicit approval.**  
**Boundaries:** Do NOT start Phase 7 · Do NOT add real providers · Do NOT modify legacy `/v1`/MySQL (except freeze docs) · Sandbox remains the only payment rail · Preserve Phase 1–6 backend contracts  

**Inputs verified:** `V4_END_TO_END_GAP_AUDIT.md`, Phase 1–6 completion reports, `OPEN_DECISIONS.md`, `LEGACY_V3_FREEZE.md`, `/api/v1` routes (`routes.ts`, `phase2–phase6-routes.ts`), V4 services, `apps/web/src/main.tsx` + `style.css`, RBAC seeds `005/007/011/014/017/020`, Payment Core / Router / Billing / Webhooks, existing tests.

---

## 1. Executive objective

Replace the monolithic Legacy console (`apps/web/src/main.tsx` tab app on mixed `/v1` + `/api/v1`) with a **new V4 Design System + merchant console** that calls **only** `/api/v1` for active workflows:

```
V4 UI → /api/v1 → V4 Domain Services → Payment Core / Billing → Provider Router → Sandbox
```

Legacy `/v1` + MySQL remain frozen and must not be used by any active V4 console path.

Phase 6.5 completion ≠ Production Ready. Expected end state: **V4 Backend + V4 Console + Sandbox E2E**.

---

## 2. Current frontend inventory (as-built)

**Structure today:** single-file React SPA (`apps/web/src/main.tsx` ~40 functions) + `style.css`. No router library, no component library, no permission-aware nav, no E2E suite. Public pages: `/checkout/public/:token`, `/pay/:token` (legacy).

### 2.1 Every existing UI screen

| # | Screen / Tab | Current class | Frontend calls | Backend SoR | Phase 6.5 disposition |
|---|---|---|---|---|---|
| 1 | Login | Partial V4 | `POST /api/v1/auth/login`, MFA; toggle → `/v1` | PG when V4 | **Rebuild V4-only** (remove legacy login toggle for active console) |
| 2 | Session probe | Partial | `/api/v1/auth/me` → fallback `/v1/auth/me` | Mixed | **V4-only**; remove fallback |
| 3 | Logout | Legacy | `POST /v1/auth/logout` | MySQL | **Cutover** → `POST /api/v1/auth/logout` |
| 4 | Dashboard | Legacy | `GET /v1/dashboard/analytics` | MySQL | **Rebuild** on V4 data (see backend gap G-01) |
| 5 | Payments | Legacy | `/v1/payments`, detail, refunds | MySQL | **Rebuild** → `/api/v1/merchant/payments` |
| 6 | Payment drawer + refund | Legacy | `/v1/payments/:id/refunds` | MySQL | **Rebuild** detail; **no refund action** (unsupported) |
| 7 | Customers | **V4** | `/api/v1/customers` | PG | **Redesign** in new DS (keep API) |
| 8 | Payment Links | Legacy | `/v1/payment-links` | MySQL | **Rebuild** → `/api/v1/merchant/payment-links` |
| 9 | Refunds | Legacy | `/v1/refunds` | MySQL | **Placeholder** (Phase 7 / provider) |
| 10 | Balances | Legacy | `/v1/balance` | MySQL | **Placeholder** (Phase 7) |
| 11 | Settlements | Legacy | `/v1/settlements` | MySQL | **Placeholder** (Phase 7+) |
| 12 | Payouts | Legacy | `/v1/payouts` | MySQL | **Placeholder** (money out); bank accounts → Merchant |
| 13 | Reconciliation | Legacy | `/v1/reconciliation/*` | MySQL | **Placeholder** |
| 14 | Risk | Legacy | `/v1/risk/assessments` | MySQL | **Placeholder** |
| 15 | Disputes | Legacy (buggy form) | `/v1/disputes` | MySQL | **Placeholder** |
| 16 | KYC/KYB | Legacy | `/v1/kyc` | MySQL | **Rebuild** → `/api/v1/merchant/*` + `/merchant/kyb` |
| 17 | Subscriptions | **V4** (combined) | products/prices/subs/customers/renewals | PG | **Split + redesign** dedicated screens |
| 18 | Invoices | **V4** | `/api/v1/invoices`, collect | PG | **Redesign** |
| 19 | Reports | Legacy | `/v1/reports/*` | MySQL | **Placeholder** |
| 20 | API & Webhooks | Legacy | `/v1/api-keys`, webhook endpoints | MySQL | **Split** → V4 API Keys + Provider Webhooks |
| 21 | Audit | Legacy | `/v1/audit-logs` | MySQL | **Rebuild** → `GET /api/v1/audit-events` |
| 22 | Errors | Legacy | `/v1/error-reports` | MySQL | **Rebuild** → `GET /api/v1/error-reports` |
| 23 | Settings | Legacy | `/v1/roles`, `/v1/users`, Zoho | MySQL | **Rebuild** org/users/invites on V4; Zoho placeholder |
| 24 | Checkout public | Legacy | `/checkout/public/:token[/pay]` | MySQL path | **Replace** with V4 checkout page |
| 25 | `/pay/:token` | Legacy | `/pay/:token`, `/v1/payment-sessions` | MySQL | **Retire from V4 console**; optional redirect note |

### 2.2 Classification summary

| Class | Screens |
|---|---|
| **Legacy (must cut over or placeholder)** | Dashboard, Payments, Payment Links, Refunds, Balances, Settlements, Payouts, Reconciliation, Risk, Disputes, KYC/KYB, Reports, API & Webhooks, Audit, Errors, Settings, Checkout public, `/pay`, Logout |
| **V4 (keep API; rebuild UX)** | Customers, Subscriptions (partial), Invoices, Login (partial) |
| **Missing V4 screens** | Products, Prices (dedicated), Payment Config, Merchant Profile, Bank Accounts, Providers, Provider Accounts/Capabilities/Routes, API Keys (V4), Provider Webhooks, Users/Invitations, Organization, Security Events, V4 Checkout, Transactions view, Theme/Localization settings |

---

## 3. Complete `/v1` frontend dependency list

Every Legacy call found in `apps/web/src/main.tsx` (must be eliminated from active V4 console):

| Path pattern | Used by |
|---|---|
| `POST /v1/auth/login` | Login toggle |
| `POST /v1/auth/mfa/verify` | Login toggle |
| `GET /v1/auth/me` | Session fallback |
| `POST /v1/auth/logout` | Logout |
| `GET /v1/dashboard/analytics` | Dashboard |
| `GET /v1/payments` | Payments |
| `GET /v1/payments/:id` | Payment drawer |
| `POST /v1/payments/:id/refunds` | Refund action |
| `GET/POST /v1/payment-links` | Payment Links |
| `POST /v1/payment-links/:id/cancel` | Payment Links |
| `GET /v1/refunds` | Refunds |
| `GET /v1/balance` | Balances |
| `GET/POST /v1/settlements` | Settlements |
| `GET/POST /v1/payouts` | Payouts |
| `GET/POST /v1/reconciliation/runs` | Reconciliation |
| `GET /v1/reconciliation/exceptions` | Reconciliation |
| `GET /v1/risk/assessments` | Risk |
| `GET/POST /v1/disputes` | Disputes |
| `GET/POST /v1/kyc` | KYC/KYB |
| `GET /v1/reports/*`, `/v1/report-exports` | Reports |
| `GET/POST /v1/api-keys` | Developer |
| `GET/POST /v1/webhook-endpoints` | Developer |
| `GET /v1/webhook-deliveries` | Developer |
| `GET /v1/audit-logs` | Audit |
| `GET /v1/error-reports` | Errors |
| `GET/POST /v1/roles`, `/v1/users` | Settings |
| `GET/POST /v1/integrations/zoho-books/*` | Settings |
| Public: `/checkout/public/:token`, `/pay/:token`, `/v1/payment-sessions` | Legacy checkout |

**Also remove:** `X-Tenant-ID` header on unauthenticated requests (V4 rejects `TENANT_HEADER_FORBIDDEN`); hardcoded `MERCHANT` id in Legacy create payloads.

**Guardrail (implementation phase):** automated test / lint that fails if `apps/web` source contains fetch paths matching `/v1/` (except explicitly allowlisted freeze/docs comments). Prefer a Vitest/unit scan of API client module.

---

## 4. Complete `/api/v1` dependency map (for V4 console)

### 4.1 Auth / session / org

| UI need | Method | Path | Permission |
|---|---|---|---|
| Login | POST | `/auth/login` | public |
| MFA | POST | `/auth/mfa/verify` | public |
| Me | GET | `/auth/me` | session |
| Logout | POST | `/auth/logout` | session |
| Current org | GET | `/organizations/current` | `org.read` |
| Members | GET | `/organizations/:id/members` | `users.read` |
| Invite create/list/revoke | POST/GET/POST | invitations… | `invites.manage` + step-up |
| Deactivate user | POST | `.../users/:id/deactivate` | `users.deactivate` + step-up |
| Audit | GET | `/audit-events` | `audit.read` |
| Errors | GET | `/error-reports` | `errors.read` |

### 4.2 Merchant / KYB / bank

| UI need | Path prefix | Permissions |
|---|---|---|
| Profile / legal / business | `/merchant/profile`, legal, business | `merchant.read` / `.manage` |
| People | owners/directors/representatives | `merchant.manage` |
| Documents | `/merchant/documents` | `documents.*` |
| KYB | `/merchant/kyb`, submit | `kyb.read` / `kyb.submit` |
| Bank accounts | `/merchant/bank-accounts` (+ step-up create) | `bank.read` / `.manage` |
| Master data | `/master-data/:type` | session (+ manage for writes) |
| Admin KYB/bank (platform) | `/admin/kyb/*`, `/admin/bank-accounts` | `kyb.review` / `bank.review` |

### 4.3 Payments

| UI need | Path | Permissions |
|---|---|---|
| Payment config | GET/PUT `/merchant/payment-config` | `payment_config.*` |
| Payment links CRUD/lifecycle | `/merchant/payment-links` + activate/deactivate/cancel/expire/reuse | `payment_links.*` |
| Payments list/detail/cancel | `/merchant/payments` | `payments.*` |
| Public checkout | GET/POST `/checkout/:token`… | public |

### 4.4 Providers / developers

| UI need | Path | Permissions |
|---|---|---|
| Providers / capabilities | `/providers`, `/providers/:code/capabilities` | `providers.read` |
| Accounts / routes | `/provider-accounts`, `/provider-routes` | read / `providers.manage` |
| Inbound webhook events | GET `/provider-webhooks` | `webhooks.read` |
| API keys | GET/POST `/api-keys`, revoke | `api_keys.*` |
| Ingress (not UI-managed) | POST `/webhooks/providers/:code` | public |

### 4.5 Billing

| UI need | Path | Permissions |
|---|---|---|
| Customers | `/customers` | `customers.*` |
| Products / prices | `/products`, `/prices` | `products.*`, `prices.*` |
| Subscriptions lifecycle | `/subscriptions` + pause/resume/cancel | `subscriptions.*` |
| Invoices / collect | `/invoices`, `.../collect` | `invoices.*` |
| Renewals run | POST `/billing/renewals/run` | `billing.manage` |

---

## 5. Target V4 navigation & routes

Proposed **client routes** (new SPA router; Vite React). Paths are UI routes; APIs remain `/api/v1`.

| Nav group | UI route | Screen | Backend support | Phase 6.5 mode |
|---|---|---|---|---|
| — | `/login` | Login / MFA | Yes | Full |
| Dashboard | `/` or `/dashboard` | V4 Dashboard | Gap G-01 | Full (compose or additive API) |
| Payments | `/payments` | Payment list | Yes | Full |
| Payments | `/payments/:id` | Payment detail / timeline | Yes | Full |
| Payments | `/payment-links` | Links list | Yes | Full |
| Payments | `/payment-links/:id` | Link detail + copy URL | Yes | Full |
| Payments | `/payment-links/new` | Create | Yes | Full |
| Payments | `/transactions` | Alias/filter of payments/txns | Partial (via payment detail) | View composed from payments |
| Checkout | `/checkout/:token` | **Public** V4 checkout | Yes | Full |
| Billing | `/customers` | Customers | Yes | Full |
| Billing | `/products` | Products | Yes | Full |
| Billing | `/prices` | Prices | Yes | Full |
| Billing | `/subscriptions` | Subscriptions | Yes | Full |
| Billing | `/invoices` | Invoices | Yes | Full |
| Billing | `/invoices/:id` | Invoice detail | Yes | Full |
| Merchant | `/merchant/profile` | Profile | Yes | Full |
| Merchant | `/merchant/kyb` | KYB status/submit | Yes | Full (manual/stub labeled) |
| Merchant | `/merchant/payment-config` | Branding/config | Yes | Full |
| Merchant | `/merchant/bank-accounts` | Bank metadata | Yes | Full (no money payout) |
| Developers | `/developers/api-keys` | API keys | Yes | Full |
| Developers | `/developers/webhooks` | Provider webhook events | Yes | Full + **limitation banner** |
| Developers | `/developers/docs` | Static API docs links | Docs only | Placeholder/static |
| Providers | `/providers` | Catalog | Yes | Full (sandbox) |
| Providers | `/providers/accounts` | Accounts | Yes | Full |
| Providers | `/providers/capabilities` | Caps matrix | Yes | Full |
| Providers | `/providers/routes` | Routing | Yes | Full (sandbox) |
| Security | `/security/users` | Members + invites | Yes | Full |
| Security | `/security/roles` | Role matrix (read-only system roles) | Partial | **Read-only** from `/auth/me` + docs; no custom role CRUD API |
| Security | `/security/audit` | Audit events | Yes | Full |
| Security | `/security/events` | Security events | Gap G-02 | Placeholder or additive GET |
| Settings | `/settings/organization` | Org | Yes | Full |
| Settings | `/settings/general` | Session/lang hints | Partial | Light |
| Settings | `/settings/localization` | EN/AR | Client-only | Full (client) |
| Settings | `/settings/theme` | Theme tokens | Client-only | Full (design system) |
| Deferred | `/refunds`, `/balances`, `/settlements`, `/payouts`, `/reconciliation`, `/risk`, `/disputes`, `/reports`, `/books` | — | No V4 | **Documented disabled placeholders** |

**Checkout URL strategy:** Backend `public_url` currently points at `/api/v1/checkout/:token` (API). UI must present a **web** URL `/checkout/:token` (Vite origin). Copy-link uses web origin; API remains source of truth for token. Optional later: env `CHECKOUT_BASE_URL` / `VITE_APP_ORIGIN` (additive config only — approve if needed as G-03).

---

## 6. Backend gaps that affect UI (document first)

| ID | Gap | Blocks | Proposed resolution (post-approval only) | Severity |
|---|---|---|---|---|
| **G-01** | No `GET /api/v1/.../dashboard` analytics | Rich dashboard | **Preferred:** minimal additive aggregate over `payment_intents` (counts/volume by status, last N days). **Fallback:** client compose from `listPayments` (weaker). | Medium |
| **G-02** | `security.read` exists; no list API for `security_events` | Security Events screen | Minimal `GET /api/v1/security-events` or keep placeholder until approved | Low |
| **G-03** | `public_url` is API path, not web checkout | Copy-link UX | UI builds `VITE_APP_ORIGIN/checkout/:token`; optional env fix in `payment-links-service` | Low |
| **G-04** | Payment list search is status+paging only (no free-text) | Search UX | Client filter on loaded page **or** additive `q=` on list | Low |
| **G-05** | Webhook verify → outbox **does not apply** PI/invoice state | Webhook E2E “state application” | **Do not fake in UI.** Document banner. Optional **smallest additive applier** only after separate approval (out of pure UI scope unless approved as 6.5a) | High (honesty) |
| **G-06** | No V4 refund/settlement/balance/dispute/risk APIs | Legacy tabs | Placeholders only — **no** new Financial APIs in 6.5 | Block inventing |
| **G-07** | No custom roles CRUD on V4 | Settings Roles | Read-only system roles + invite `role_code`; no invent | Low |
| **G-08** | Email delivery stub (DEC-017) | Invite/verify UX | Show “email via outbox stub / dev token” in non-prod | Known |
| **G-09** | LIVE API key env allowed in API | Keys UI | Default SANDBOX; disable/warn LIVE (`supports_live` false for sandbox rail) | Medium |
| **G-10** | Admin KYB review UI | Platform ops | Optional secondary “Platform” nav if `kyb.review`; else omit from merchant console | Low |

**Rule:** No backend rewrite of working services. Only minimal additive `/api/v1` changes after gap is listed and approved. **No Phase 7 schema.**

---

## 7. Design system requirements

Build a **new** V4 design system (not a recolor of Legacy). Document in `docs/ui/V4_DESIGN_SYSTEM.md` during implementation.

| Token / component | Requirement |
|---|---|
| Layout | App shell: sidebar + top bar + content; mobile collapse |
| Typography | Distinct professional stack (not Inter/Roboto/Arial default cluster); clear hierarchy |
| Color | CSS variables; financial neutrals + status semantic colors; **avoid** purple-glow / cream-terracotta AI clichés |
| Spacing | 4/8 scale |
| Components | Button, Input, Select, FormField, Table, Pagination, Card (interaction only), Modal, Drawer, Alert, Toast, Badge, EmptyState, Skeleton, ConfirmDialog, Tabs, Toolbar |
| States | Loading / empty / error / success for every data view |
| Status badges | Payment, invoice, subscription, KYB, link lifecycle |
| A11y | Focus rings, labels, keyboard nav, `aria-*`, contrast; RTL via existing lang toggle |
| Permission | `Can` / `usePermissions` from `/auth/me`; hide+disable; backend remains authority |
| Responsive | Desktop / tablet / mobile |
| Brand | Project V4 language — not Zoho / not copyrighted assets |

**Architecture:** split `apps/web` into modules e.g. `src/v4/{app,pages,components,api,auth,theme,routes}` — stop growing the single `main.tsx` monolith.

---

## 8. Feature workstreams (implementation order after approval)

### WS-0 — Foundation
- Scaffold V4 app shell, router, theme, API client (`baseURL` → `/api/v1` only)
- Auth session store; permission hooks
- Legacy console entry removed or redirected to V4 shell
- `/v1` call detector test

### WS-1 — Auth & shell
- Login, MFA, logout, me, org header
- Nav permission filtering
- Localization EN/AR + theme settings

### WS-2 — Payments cutover (mandatory)
- Payment Links (create, list, filter status, detail, activate/deactivate/cancel/expire/reuse, copy web checkout URL)
- V4 Checkout public page (branding, summary, customer fields, sandbox token method UI: `tok_ok` / `tok_FAIL` / etc. — **no PAN/CVV**)
- Payments list/detail (attempts, transactions, transitions, cancel)
- Payment config

### WS-3 — Billing UX completion
- Dedicated Customers / Products / Prices / Subscriptions / Invoices
- Journey: customer → product → price → subscription → renewal run → collect → invoice states
- Clear state machines in UI

### WS-4 — Merchant / KYB
- Profile, legal/business, KYB submit/status, documents list/upload where API supports, bank accounts (masked metadata)
- Label manual/stub verification (DEC-010)

### WS-5 — Developers & Providers
- API keys: create (show secret once), scopes, revoke, last_used; never show hash
- Provider webhooks event list + detail; banner: “verification/dedupe/outbox only; state application not implemented”
- Providers / accounts / capabilities / routes (sandbox)

### WS-6 — Security & Settings
- Users/members, invitations (step-up flows), audit logs, error reports
- Roles read-only matrix
- Org settings
- Placeholders for Financial/Risk/Reports/Books

### WS-7 — Dashboard
- Sandbox-oriented metrics from G-01 resolution
- Explicit “Sandbox rail · Not production balances”

### WS-8 — E2E + docs + freeze notes
- Playwright (or agreed harness) for critical journeys
- Docs listed in §12
- Update gap/readiness docs
- Update `LEGACY_V3_FREEZE.md` (console cutover note)

---

## 9. RBAC requirements

### 9.1 System roles (existing)

`MERCHANT_OWNER`, `MERCHANT_ADMIN`, `MERCHANT_FINANCE`, `MERCHANT_DEVELOPER`, `MERCHANT_SUPPORT`, `MERCHANT_VIEWER`, plus platform roles.

### 9.2 Screen → permission mapping (minimum)

| Screen | Read | Mutate |
|---|---|---|
| Dashboard | `payments.read` (and/or org.read) | — |
| Payments | `payments.read` | `payments.manage` (cancel) |
| Payment Links | `payment_links.read` | `payment_links.manage` |
| Payment Config | `payment_config.read` | `payment_config.manage` |
| Customers | `customers.read` | `customers.manage` |
| Products/Prices | `products/prices.read` | `.manage` |
| Subscriptions | `subscriptions.read` | `.manage` |
| Invoices | `invoices.read` | `invoices.manage` / collect |
| Renewals run | — | `billing.manage` |
| Merchant / KYB | `merchant.read` / `kyb.read` | `.manage` / `kyb.submit` |
| Bank | `bank.read` | `bank.manage` (+ step-up) |
| API Keys | `api_keys.read` | `api_keys.manage` |
| Webhooks events | `webhooks.read` | — |
| Providers | `providers.read` | `providers.manage` |
| Users | `users.read` | `users.manage` / invites |
| Audit | `audit.read` | — |
| Org | `org.read` | `org.manage` |

Frontend hiding is insufficient — E2E must prove 403 on unauthorized API.

---

## 10. E2E requirements

Add UI/E2E (Playwright recommended; none exists today). Minimum:

| Journey | Steps | Assert |
|---|---|---|
| **Payment** | Login → create link → open `/checkout/:token` → session → pay with sandbox success token → payment SUCCEEDED | Router/sandbox path; no `/v1` |
| **Payment fail** | Same with `FAIL` token | FAILED + error UI |
| **Billing** | Customer → product → price → subscription → renewals/run → invoice PAID (or collect) | States visible |
| **Security** | Login as viewer → mutate blocked; as admin → allowed | UI + API 403 |
| **API Keys** | Create → secret once → use key on API → revoke → rejected | Scopes |
| **Webhook** | POST signed sandbox webhook → appears in `/provider-webhooks` · signature fail 401 · replay/dedupe | **Do not claim PI mutation** unless G-05 approved & implemented |
| **No legacy** | Static/source scan + runtime spy | Zero `/v1` from V4 client |

Also keep: `npm run test:pg`, `npm test` (Phase 1–6 regression = fail phase).

---

## 11. Acceptance criteria

Phase 6.5 Done when:

- [ ] New V4 design system + documented
- [ ] New V4 navigation/shell
- [ ] Legacy console is not the active V4 interface
- [ ] Payment Links, Checkout, Payments, Customers, Products, Prices, Subscriptions, Invoices, API Keys, Merchant/KYB (supported), Providers (sandbox), Audit use `/api/v1`
- [ ] No accidental frontend `/v1` for V4 workflows (automated check)
- [ ] RBAC enforced (UI + API tests)
- [ ] Critical E2E journeys pass
- [ ] `test:pg` and `npm test` pass (no Phase 1–6 regression)
- [ ] Sandbox-only; no real-provider claims; no Phase 7
- [ ] Docs complete (§12)
- [ ] Completion report lists remaining production blockers

**Non-goals:** Financial Core, real providers, live money, refunds, settlement, PCI/3DS, distributed rate limits, real email, DR certification.

---

## 12. Documentation deliverables (implementation phase)

| Doc | Purpose |
|---|---|
| `docs/implementation/PHASE6_5_UI_IMPLEMENTATION_PLAN.md` | This plan (approved baseline) |
| `docs/implementation/PHASE6_5_IMPLEMENTATION_PLAN.md` | Optional synced copy / execution checklist after approval |
| `docs/implementation/PHASE6_5_COMPLETION_REPORT.md` | Results, test counts, limitations |
| `docs/ui/V4_DESIGN_SYSTEM.md` | Tokens + components |
| `docs/ui/V4_CONSOLE_ARCHITECTURE.md` | App structure, routing, API client |
| `docs/ui/V4_SCREEN_INVENTORY.md` | Final screen ↔ API ↔ RBAC matrix |
| `docs/ui/V4_LEGACY_CUTOVER.md` | Before/after `/v1` removal map |
| `docs/ui/V4_E2E_FLOWS.md` | E2E journeys |
| Update `V4_END_TO_END_GAP_AUDIT.md` / readiness notes | Reflect console cutover |
| Update `LEGACY_V3_FREEZE.md` | Console no longer depends on `/v1` |

Per feature: objective, dependencies, UI route, API, RBAC, backend, tests, acceptance, limitations.

---

## 13. Staging / production gate (Phase 6.5)

| Gate | Phase 6.5 target |
|---|---|
| Development | V4 console runnable locally against PG + sandbox |
| Staging / Sandbox | Console + E2E green; no `/v1` in active paths |
| Production Ready | **OUT OF SCOPE** — still blocked by providers, ledger, PCI, etc. |

---

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Scope creep into Phase 7 | Placeholders only for financial screens |
| Fake webhook “delivery” UI | Show inbound events only; state-application banner |
| LIVE key creation confusion | UI defaults SANDBOX; warn LIVE unsupported for sandbox rail |
| Checkout URL mismatch | Web route + clear copy |
| Big-bang rewrite breaks billing tabs | Keep API contracts; migrate screen-by-screen behind new shell |
| A11y/RTL regression | Design system includes RTL tokens |

---

## 15. Effort sketch (informational)

| Workstream | Relative size |
|---|---|
| WS-0/1 Foundation + Auth | M |
| WS-2 Payments + Checkout | L |
| WS-3 Billing redesign | M |
| WS-4 Merchant/KYB | M |
| WS-5 Developers/Providers | M |
| WS-6 Security/Settings | M |
| WS-7 Dashboard | S–M (depends G-01) |
| WS-8 E2E + docs | M |

---

## 16. Approval checklist (for reviewers)

Please approve or amend:

1. Proceed with **full V4 console rebuild** (new DS + router), not Legacy restyle  
2. **Placeholders** for Refunds/Balances/Settlements/Payouts/Recon/Risk/Disputes/Reports/Books  
3. Backend additive changes allowed only for: **G-01** (dashboard), optional **G-02**, **G-03**, optional **G-04**  
4. **G-05 webhook state applier:** include in 6.5 / defer / separate 6.5a? (**recommend defer** unless you want true webhook E2E)  
5. E2E harness: **Playwright** default OK?  
6. Confirm **no Phase 7** and **no real providers** during 6.5  

---

## 17. STOP

**No code, schema, API, or UI changes have been made in this planning step.**

Awaiting explicit approval of this plan before Phase 6.5 implementation begins.
