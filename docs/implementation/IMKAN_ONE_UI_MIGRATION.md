# IMKAN ONE UI MIGRATION

Date: 2026-08-15

## 1. Current UI audit

Single merchant console (`apps/web/src/v4`) with `AppShell` (sidebar + 44px topbar). Duplicate classic skin remains unused for this pass. Pages lived as many sibling routes (KYB, legal, business, documents, org, appearance, payment-config, two webhook screens, customers, ledger, coming-soon reconciliation, fee schedules).

## 2. Removed UI (routes redirect; backend kept)

| UI | Action |
|---|---|
| Customers | HIDE/REMOVE from nav; `/customers` → `/` |
| General ledger | HIDE/REMOVE from nav; `/ledger` → `/wallet` |
| Reconciliation coming-soon | HIDE; `/coming-soon/reconciliation` → `/` |
| Matching | none existed as a live page |

## 3. Hidden UI

| UI | Action |
|---|---|
| API Keys | KEEP route `/developers/api-keys` + API; **not in main nav** |

## 4. Merged UI

- Legal + business + people + documents + KYB → `MerchantHubPage` tabs under `/merchant/*`
- Organization + payment config + appearance + webhooks → `SettingsHubPage` under `/settings/*`
- Outbound merchant webhooks + inbound provider webhook events → `UnifiedWebhooksPage`

## 5. Moved UI

- Commission / fee schedules: merchant `/fees` → `/platform/commissions`
- API: `GET/POST /fee-schedules` and preview require `platform.admin` or `platform.finance` (not merchant `settlements.*`)

## 6. Navigation

Workspace (dashboard, payments, links, transactions) → Business (onboarding/KYB, bank accounts) → Finance (no ledger/fees) → Settings (hub + security + providers) → Platform (includes Commissions).

## 7. Design system

- Imkan One CSS variables aliased (`--primary`, `--surface`, `--text`, …)
- Zoho utility classes mapped onto existing primitives (`zoho-btn-*`, `zoho-panel`, `zoho-table`, `input-ui`)
- Typography: Zoho Puvi / Lato fallback (EN), IBM Plex Sans Arabic (AR), Geist Mono
- Header 44px, sidebar 240px; marketing gradients removed from `body`
- Shared `Button`, `Field`, `DataTable` emit the unified classes

## 8. i18n

New keys: `section.workspace`, `section.business`, `nav.settings`, `nav.onboardingKyb`, `nav.commissions`, `settings.hub.*`, `merchant.hub.*`, `webhooks.hub.*` (EN + AR).

## 9. Responsive

Existing table wrap + module tabs wrap; onboarding uses `v4-onboarding-shell` instead of login marketing layout.

## 10. RBAC

Commission administration is platform-only on both nav and fee-schedule HTTP routes. Accrued fees on payment detail remain `payments.read`.

## 11. Tests

Run `npx vitest run --config vitest.config.ts` (unit). `npm run test:pg` requires live DATABASE_URL_PG.

## 12. Remaining gaps

- Zoho Puvi is licensed; runtime falls back to Lato until the font file is hosted.
- Collapsed 64px sidebar icon-only mode is not a toggle yet (width token is 240px expanded).
- Not every page’s raw `<table className="v4-table">` was rewritten; CSS aliases cover both class names.
- HEX remains inside `tokens.css` (source of truth) — not in TSX.
- Checkout / login public pages still use the same token file but are outside AppShell.
