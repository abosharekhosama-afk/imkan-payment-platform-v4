# Regional Market Readiness — Palestine + GCC + Arab Markets

**Date:** 2026-08-13  
**Target model:** Zoho Payments-like — direct payout to each merchant IBAN, full fee/net transparency, real security controls  
**Markets:** Palestine (PS/ILS), GCC (SA/AE/KW/QA/BH/OM), broader Arab (EG/JO as PayTabs endpoints allow)

---

## Current state (baseline)

| Capability | Status |
|------------|--------|
| Collect (Checkout / Payment Links) | Works — Stripe + PayTabs **sandbox** |
| Money destination | **Platform-shared** Stripe/PayTabs account (`organization_id IS NULL`) |
| Merchant IBAN | `payout_accounts` — **no live bank transfer** |
| Ledger / Settlement / Payout | Implemented — sandbox; `mark-paid` is manual, not bank API |
| Commissions / net per payment | **Settlement aggregate only** — no per-payment accrual (see DEC-008) |
| GCC master data | SA/AE/KW/QA/BH/OM + currencies in `008_phase3_master_data.sql` |
| Palestine | PS + ILS in `038_palestine_master_data.sql`; provider docs only |
| Palestine adapters | **No code** — blocked on private API docs + contracts |

---

## Target architecture

```
Customer pays
  → Regional provider (PS: BOP/Jawwal | GCC: PayTabs | Intl: Stripe optional)
  → payment_intent + fee_accrual (gross, provider_fee, platform_fee, net)
  → Ledger (per organization_id)
  → Settlement (period)
  → Payout rail → payout_accounts (merchant IBAN)
```

### Regional routing matrix

| Market | Primary collect | Payout path | Notes |
|--------|-----------------|-------------|-------|
| **Palestine** | BOP / Jawwal / PalPay — **per-merchant MID** | Provider settlement → IBAN | No public APIs yet; outreach first |
| **GCC** | PayTabs LIVE (priority) | PayTabs settlement file + IMKAN payout rail | Endpoints per country |
| **Intl cards in GCC** | Stripe (optional) | Platform settle → IBAN or Connect (later) | Not for PS merchants initially |
| **EG / JO** | PayTabs if merchant accepted | Same as GCC | Endpoint selection |

**Stripe Connect** is deferred as optional GCC enhancement — Palestine requires local acquirers.

---

## Phase 1 — Financial transparency (fees, deductions, net)

**Goal:** Every payment records gross / provider_fee / platform_fee / adjustments / net — merchant-facing statements.

### 1.1 Database (`039_payment_fee_accruals.sql`)

- Add `environment` to `payment_intents` (fix settlement cross-env risk)
- Add fee columns on `payment_intents` OR new `payment_fee_accruals` table
- Extend `settlement_lines` with `platform_fees_minor`, `provider_fees_minor`, `net_after_fees_minor`
- New `settlement_adjustments` (CHARGEBACK, RESERVE, MANUAL_CREDIT, …)

### 1.2 Application

- On `payment.succeeded` (`webhook-state-apply.ts`, `payment-core-service.ts`):
  - Resolve fee schedule (`fee-schedules-service.ts`) by org + env + currency
  - Accrue fees; post ledger (split gross → payable + platform_revenue)
- Settlement draft aggregates accruals; provider fees from import not manual-only
- APIs: `GET /merchant/finance/statement`, payment detail fee breakdown
- UI: extend `FinancePages.tsx`; wire fee-schedule CRUD (API exists, web missing)

**Exit:** Merchant sees exact commission, deductions, and net received — like Zoho Payments statements.

---

## Phase 2 — Per-merchant money path (direct payout)

**Goal:** Each `organization` linked to real receive account — not IMKAN-only Stripe.

### 2.1 Per-org provider accounts

Schema supports `provider_accounts.organization_id` — implementation missing:

- `POST /merchant/provider-accounts` + credential metadata (SecretResolver)
- Refactor adapter `credentials.ts` to load by `provider_account_id`
- UI: Providers → Connect gateway (PayTabs keys / BOP merchant ID)

### 2.2 Regional router

Extend `providers/router.ts`:

- Route by signup country + currency (PS+ILS → bop; SA+SAR → paytabs)
- Replace global `seed-stripe-routes` with country-aware bootstrap

### 2.3 Live payout rail (P16.7)

- New `PayoutRailAdapter` interface
- Implementations: audited manual break-glass → bank file → provider settlement webhook
- `mark-paid` only after bank/provider confirmation

### 2.4 Merchant readiness

Update `merchant-readiness-service.ts` for region-specific providers (not stripe-only).

**Exit:** Pay → accrue → settle → **scheduled transfer** to merchant IBAN.

---

## Phase 3 — GCC readiness

### 3.1 PayTabs LIVE (DEC-009)

- Complete `docs/providers/PROVIDER_CHECKLIST.md`
- Country endpoints in `paytabs/config.ts` (SA/AE/OM/JO/KW/QA)
- Public HTTPS webhook on production API
- Live refunds in `refunds-service.ts`
- Sandbox certification → LIVE enable

### 3.2 Stripe (optional — international cards)

- Remain platform-shared or Connect later
- Route: SAR/AED → PayTabs first; USD → Stripe

### 3.3 Regional defaults

- Fee schedule seeds per GCC currency
- e-Invoicing hooks deferred (ZATCA/UAE in `regional.ts` — Books scope)

**Exit:** Saudi/UAE merchant collects SAR/AED via PayTabs; receives IBAN payout T+N.

---

## Phase 4 — Palestine local providers

### 4.0 Commercial (parallel — no code without docs)

- Send `docs/providers/palestine/OUTREACH.md` + `PLATFORM_MODEL_QUESTIONNAIRE.md`
- Priority: BOP → Jawwal Pay → PalPay → Arab Bank PS
- Store received docs in `docs/providers/palestine/inbox/<provider>/`

### 4.1 Implementation (per `NEXT_ADAPTER_PLAN.md`)

Per provider:

1. Migration: `providers` row (`region=PS`, `supports_live=FALSE` until certified)
2. Scaffold `apps/api/src/providers/bop/` (mirror PayTabs HPP)
3. Register in `registry.ts`; webhook signature tests
4. Per-merchant MID: `provider_accounts(organization_id=merchant)`

### 4.2 Palestine UX

- Signup PS → ILS default routes
- KYB + IBAN validation for PS

**Exit:** PS merchant connects BOP → customer pays ILS → settlement → PS IBAN.

---

## Phase 5 — Security & money protection

| Control | Action |
|---------|--------|
| KMS | Wire `kms-resolver.ts` (AWS/GCP/Render) |
| Per-account webhook secrets | DB + webhook-service lookup |
| Idempotency | payment-link lifecycle + bank activate/deactivate |
| Payout dual control | submit + platform approve before rail |
| Audit | payout rail + fee accrual + credential changes |
| Redis rate limit | Production Render env |
| PCI (DEC-011) | HPP/hosted only; SAQ-A documentation |
| Pen test + DR | P16.10 |

---

## Phase 6 — Ops & go-live

- Regional preflight scripts (GCC PayTabs, PS BOP when ready)
- Runbooks: payout failure, settlement mismatch, provider outage
- Platform admin: KYB + payout approval + fee schedules
- Alerts: `payout_failures_total`, webhook failures

---

## Recommended timeline

| Phase | Duration | Dependency |
|-------|----------|------------|
| P1 Fee accruals + statements | 4–6 weeks | None |
| P2 Per-merchant accounts + routing | 4 weeks | P1 |
| P2 Payout rail | 6–8 weeks | P1, bank/provider agreement |
| P3 PayTabs LIVE (GCC) | 6–8 weeks | P2.1, sandbox cert |
| P4 Palestine BOP | 3–6 months | **Private API docs from bank** |
| P5 Security | 6 weeks | Parallel from P2 |
| P6 Ops | 2 weeks | Before each regional go-live |

**Fast path GCC (3–4 months):** P1 → P2.1 → P3 → audited manual payout → go-live  
**Palestine:** Start P4.0 outreach **now**; code after first doc package

---

## Definition of done — “ready for market”

| Market | Collect | Fee statement | Direct payout | Provider |
|--------|---------|---------------|---------------|----------|
| GCC | PayTabs LIVE | Per-payment + settlement | IBAN T+N | PayTabs CERTIFIED |
| Palestine | BOP/Jawwal LIVE | Same | PS IBAN | BOP SANDBOX_TESTED → LIVE |
| Security | — | — | Dual-control payout | KMS + pen test |

---

## Explicit non-goals

- Stripe Connect (phase later, GCC optional)
- Zoho Payments as a provider
- FX multi-currency settlement (DEC-008 deferred)
- Tax/e-invoicing execution (Books)
- Live money without DEC-009 evidence

---

## Key files

- Financial: `apps/api/src/finance/financial-model.ts`, `phase7-financial-routes.ts`
- Providers: `apps/api/src/providers/router.ts`, `provider-admin-service.ts`
- Palestine: `docs/providers/palestine/RESEARCH.md`, `NEXT_ADAPTER_PLAN.md`
- Gate: `docs/ops/PRODUCTION_GATE.md`, `docs/decisions/DEC-008-FINANCIAL-MODEL.md`
