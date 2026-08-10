# P15.1 — Financial Core & Settlement Integrity  
## Assessment & Implementation Plan

**Product:** IMKAN Payments V4  
**Date:** 2026-08-10  
**Mode:** Assessment & planning only — **no code changes, no migrations, no implementation started**  
**Prerequisite:** P15.0 = PARTIAL (closed); implementation of this plan requires **explicit approval**  
**Production Ready:** NOT claimed  

**Source of Truth:** current code, migrations (`025`–`028`), `/api/v1` routes, V4 UI, tests — not stale audit docs alone.

---

## 0. Executive Recommendation

| Item | Value |
|---|---|
| **Next phase** | **P15.1 — Financial Core & Settlement Integrity** |
| **Why** | Payment→Ledger works in sandbox; Settlement/Payout/Balances/Recon/Books-event boundary are incomplete or unsafe for production money movement |
| **Must decide first** | **DEC-008** (fees/reserves/cutoffs/rounding; FX can be deferred) |
| **Books target** | **Internal IMKAN Books** (not Zoho). P15.1 delivers **event contract only** |
| **Live Provider** | Out of scope (P15.2 / DEC-009) |
| **Start implementation?** | **NO — wait for explicit approval of this plan** |

---

## 1. Current Financial Core Status

| Area | Status | Evidence |
|---|---|---|
| Payment Link → Checkout → Intent → Sandbox Provider → SUCCEEDED | **COMPLETE** (sandbox) | `payment-links-service`, `payment-core-service`, phase4/5 tests |
| Ledger post on payment success / refund | **PARTIAL** (usable) | `ledger-service.ts`; migration `028` immutability |
| Balances API | **PARTIAL** | `available`/`pending` derived; `reserved`/`settled` hard-coded `0` |
| Settlement | **PARTIAL** | `createDraft` only; fees always `0`; no finalize; double-include risk |
| Payout | **PARTIAL** | Creates `PENDING` from settlement net; no bank link, no state machine, no ledger |
| Reconciliation | **PARTIAL** | Count mismatch only |
| Books | **PARTIAL / MOCK** | `InternalBooksConnector` + `books_sync_state`; **never called** from outbox |
| Fees / FX / reserves / cutoffs | **BLOCKED** | DEC-008 OPEN; `fees = 0n` in code |
| Live rails | **BLOCKED** | DEC-009; only `sandbox` adapter registered |

**Overall Financial Core:** **PARTIAL foundation — not production-grade.**

---

## 2. Payment Lifecycle Assessment

| Component | Status | Notes |
|---|---|---|
| Payment Links API (create/list/get/patch/activate/deactivate/cancel/expire/reuse) | **COMPLETE** | Org-scoped; URL safety; KYB gate when enabled |
| Payment Links UI | **PARTIAL** | FIXED create only; missing one-time/expiry/max_uses/CUSTOMER_ENTERED/success-cancel in create form; no expire/reuse buttons |
| Payment config API | **COMPLETE** | Branding + defaults |
| Payment config UI | **PARTIAL** | Missing default success/cancel URL fields |
| Checkout API | **COMPLETE** | Session + pay; PAN/CVV rejected |
| Checkout UI | **PARTIAL** | Sandbox token UX; **no redirect** to success/cancel URL |
| Payment Intent + attempts + transactions | **COMPLETE** | Created via checkout/billing |
| State machine | **COMPLETE** | `CREATED→REQUIRES_PAYMENT→PROCESSING→SUCCEEDED\|FAILED`; cancel/expire early |
| Auth vs Capture | **PARTIAL** | Sandbox authorize coalesces to SUCCEEDED; no separate `/capture` on `/api/v1` |
| Ambiguous | **IMPLEMENTED / NEEDS HARDENING** | Intent FAILED + `query_before_retry`; no same-intent recovery API |
| Webhooks | **COMPLETE** (sandbox) | Signature, nonce, PI-org resolve, state apply |
| Idempotency (HTTP) | **COMPLETE** for create link / session / pay / cancel | Lifecycle link actions lack HTTP idempotency keys |
| `recordSuccessfulUse` | **COMPLETE** | Org-required (P15.0 closure) |

**Preserve path (do not rewrite):**  
Payment Link → Checkout → Intent → Provider → Success → Ledger.

**P15.1 stance on Payment Links/Checkout:** treat UI/redirect gaps as **P15.1-H polish or post-core** — not blockers for settlement integrity. Do not rebuild Payment Core.

---

## 3. Refund Assessment

| Capability | Status | Evidence |
|---|---|---|
| Full / partial / multiple partial | **COMPLETE** (sandbox) | `refunds-service`; `refund-conformance` |
| Cap vs captured | **COMPLETE** | Sum PENDING+SUCCEEDED |
| Idempotency key + unique index | **COMPLETE** | `(organization_id, idempotency_key)` |
| Ledger compensating entry same TX | **COMPLETE** | `postRefundWithClient` |
| HTTP step-up | **COMPLETE** | `requireStepUp('payments.refund')` |
| Cross-tenant deny | **COMPLETE** | Tests |
| Webhook refund apply | **COMPLETE** | Classified via `/refund/i`; not payment success |
| Status machine PENDING→SUCCEEDED/FAILED | **PARTIAL** | Create inserts **SUCCEEDED** immediately; schema allows PENDING/FAILED |
| Live provider refund | **BLOCKED** | DEC-009; forced SANDBOX env |
| Outbox on webhook refund | **MISSING** | Webhook path audits only |

**P15.1 work:** harden refund status transitions if settlement nets need PENDING refunds; ensure refunded amounts excluded from settlement eligibility; emit consistent outbox on webhook refunds.

---

## 4. Ledger Assessment

| Capability | Status | Evidence |
|---|---|---|
| Double-entry balanced journals | **COMPLETE** (app) | `postBalancedJournal` |
| Immutability UPDATE/DELETE | **COMPLETE** (DB) | `028_ledger_immutability.sql` |
| Payment / refund posting | **COMPLETE** (paths) | Checkout, billing, webhook, refunds |
| Accounts ensured | **COMPLETE** | 5 default codes |
| Accounts **used** in posts | **PARTIAL** | Only `pending_settlement`, `merchant_payable` |
| Unused accounts | — | `cash_provider`, `platform_revenue`, `refunds_expense` |
| Settlement / payout / fee journals | **MISSING** | No methods |
| Unique `(org, source_type, source_id)` | **MISSING** | App check only → race window |
| Cross-tenant posting guard | **PARTIAL** | Service org args; no RLS |

**Required for P15.1:** journal uniqueness; settlement/payout/fee posting rules; optional use of revenue/cash/refund accounts per DEC-008 model.

---

## 5. Balance Assessment

**Current formulas** (`ledgerService.getBalances`):

| Field | Current meaning | Status |
|---|---|---|
| `pending_minor` | Net of `pending_settlement` (DEBIT−CREDIT), floored at 0 | **PARTIAL** |
| `available_minor` | Negated net of `merchant_payable`, floored at 0 | **PARTIAL** |
| `reserved_minor` | Always `'0'` | **MISSING** |
| `settled_minor` | Always `'0'` | **MISSING** |

**Target semantics for P15.1 (proposed):**

| Bucket | Meaning after P15.1 |
|---|---|
| **Pending** | Captured funds not yet in a **FINALIZED** settlement (still on `pending_settlement` gross, net of refunds) |
| **Available** | FINALIZED settlement net not yet paid out (merchant claim ready for payout) |
| **Reserved** | Holds / reserves from DEC-008 (if enabled); otherwise 0 with schema ready |
| **Settled** | Amount successfully **PAID** via payout (cash left the payable) |

**Transitions (proposed):**

```text
Payment SUCCEEDED     → ↑ Pending, ↑ Payable (gross)
Refund SUCCEEDED      → ↓ Pending, ↓ Payable
Settlement FINALIZE   → ↓ Pending; ↑ Available (net); fee lines → platform_revenue
Payout PAID           → ↓ Available; ↑ Settled (and/or cash_provider movement)
Payout FAILED         → no permanent balance change (or reverse temporary reserve)
```

Exact account mapping is finalized in **P15.1-A** after DEC-008.

---

## 6. DEC-008 Decision Analysis

**Current:** OPEN in `docs/decisions/OPEN_DECISIONS.md`.  
**Code today:** `fees = 0n` with comment BLOCKED BY DEC-008.  
**Master data:** `master_fee_types` labels only (PROCESSING, REFUND, CHARGEBACK, PAYOUT, SUBSCRIPTION) — no rules engine.

### Required decisions

#### DEC-008.1 — Fee ownership model

| | |
|---|---|
| **Decision** | Who charges fees recorded in IMKAN settlement net? |
| **Options** | A) Platform fees only (IMKAN) · B) Provider fees only (pass-through) · C) Both (platform + provider) · D) Fees always 0 until later |
| **Recommended** | **C** with **provider_fee_minor** and **platform_fee_minor** columns; P15.1-A may ship with schedules defaulting to 0 |
| **Impact** | Settlement net = gross − platform − provider − reserves ± adjustments |
| **Schema/API** | Fee schedule tables; settlement fee breakdown fields |

#### DEC-008.2 — Fee schedule shape

| | |
|---|---|
| **Decision** | How are platform fees computed? |
| **Options** | A) bps of gross + optional fixed minor · B) tiered volume · C) per-payment-method matrix · D) manual adjustment only |
| **Recommended** | **A** for P15.1 (org + environment + currency + optional fee_type); tiers later |
| **Impact** | Deterministic, testable; expandable |
| **Schema/API** | `fee_schedules` / `fee_schedule_lines`; preview API optional |

#### DEC-008.3 — Reserves / holds

| | |
|---|---|
| **Decision** | Are rolling reserves in P15.1? |
| **Options** | A) None in P15.1 · B) Fixed % of gross held N days · C) Manual reserve adjustments only |
| **Recommended** | **A** for first ship + schema column `reserves_minor` default 0; **B** as P15.1-D+ if product requires |
| **Impact** | Avoids inventing hold release jobs prematurely |
| **Schema/API** | `settlements.reserves_minor`; later `reserve_releases` |

#### DEC-008.4 — Settlement cutoff

| | |
|---|---|
| **Decision** | How is eligibility time-bounded? |
| **Options** | A) Explicit `period_start`/`period_end` on create only · B) Cron cutoffs by timezone · C) Provider settlement file import |
| **Recommended** | **A** in P15.1; B/C later |
| **Impact** | Merchant-driven or ops-driven batches without inventing schedules |
| **Schema/API** | Require period on finalize; optional on draft |

#### DEC-008.5 — Rounding

| | |
|---|---|
| **Decision** | Rounding when bps × amount is non-integer |
| **Options** | A) Floor · B) Half-up · C) Banker’s · D) Always fixed-only fees |
| **Recommended** | **B Half-up** on minor units after bps (document in DEC) |
| **Impact** | Deterministic fees |
| **Schema/API** | Stored fee amounts as integers; document mode in org settings |

#### DEC-008.6 — FX

| | |
|---|---|
| **Decision** | Multi-currency conversion in P15.1? |
| **Options** | A) Out of scope — settlement is single-currency · B) Mid-market FX table · C) Provider FX pass-through |
| **Recommended** | **A** — one currency per settlement/payout; FX = later phase |
| **Impact** | Unblocks Financial Core without inventing rates |
| **Schema/API** | Enforce currency match; no FX tables in P15.1 |

#### DEC-008.7 — Taxes

| | |
|---|---|
| **Decision** | VAT/tax in settlement? |
| **Options** | A) Out of scope · B) Tax line on settlement · C) Books-only tax |
| **Recommended** | **A / C** — tax in Internal Books later; Payments records gross/fee/net only |
| **Impact** | Keeps Payments SoR focused |

### P15.1 fee model (executable without waiting for live FX)

**Phase 1 shippable model:**

```text
gross_minor          = sum(eligible payment amounts)
provider_fees_minor  = 0 (until provider reports; column ready)
platform_fees_minor  = schedule(bps, fixed) or 0
reserves_minor       = 0 (column ready)
adjustments_minor    = signed manual lines (optional)
net_minor            = gross - provider_fees - platform_fees - reserves + adjustments
```

All amounts `NUMERIC(30,0)` minor units (DEC-001). Currency single per settlement.

**Do not treat `fees = 0` as permanent product truth** — treat as **default schedule** until configured.

---

## 7. Fee Model (target)

| Element | P15.1 plan |
|---|---|
| Gross | Sum of included payment_intent amounts (net of prior refunds — see eligibility) |
| Provider fees | Field + optional import later; default 0 |
| Platform fees | Schedule-driven; post to `platform_revenue` on finalize |
| Taxes | Out of Payments SoR |
| Reserves | Column; logic optional |
| Adjustments | `settlement_adjustments` table (credit/debit reasons) |
| Net | Computed and stored; immutable after FINALIZED |
| Rounding | Half-up (DEC-008.5) |
| Currency | Single; no FX |

**Eligible payment amount for settlement:**  
`captured_minor - succeeded_refunds_minor` (not raw PI amount if partial refunds exist).

---

## 8. Settlement Model

### Separation

| Concept | Meaning |
|---|---|
| **Settlement** | Accounting batch: what the merchant **earned/net** for a period/currency |
| **Payout** | Cash movement instruction to merchant bank for (part of) finalized net |

### Proposed lifecycle

```text
DRAFT
  → FINALIZED   (ledger posted; lines locked; eligible PIs marked settled)
  → CANCELLED   (from DRAFT only; no ledger)

FINALIZED
  → (optional) CLOSED / PAID_OUT when remaining payable for this settlement is 0
```

**Recommendation vs current CHECK (`DRAFT|FINALIZED|PAID|CANCELLED`):**  
Keep `PAID` as “fully paid out” aggregate, or rename in additive migration to `CLOSED`. Prefer **keep PAID** = all linked payouts in terminal PAID and sum covers net.

### Rules

1. **Eligible payments:** `SUCCEEDED`, currency match, period window, `settlement_inclusion` not already FINALIZED, refundable remaining > 0.  
2. **Exclude already settled:** unique `(payment_intent_id)` among lines of non-cancelled settlements that are DRAFT or FINALIZED (or dedicated `payment_intent_settlement` status).  
3. **Concurrent create:** transaction + advisory lock per `(org, currency, environment)` or unique constraint strategy.  
4. **Finalize:** recompute fees; post ledger; emit outbox; set FINALIZED; step-up required.  
5. **Cancel:** DRAFT only.  
6. **Idempotency:** HTTP key on create/finalize; financial idempotency via journal source + settlement version.  
7. **Audit + outbox:** `settlement.created`, `settlement.finalized`, `settlement.cancelled`.

### APIs (proposed)

| Method | Path | Auth | Permission | Step-up | Idempotency | Side effects |
|---|---|---|---|---|---|---|
| GET | `/settlements` | session/API key | `settlements.read` | — | — | — |
| GET | `/settlements/:id` | yes | `settlements.read` | — | — | — (**missing today**) |
| POST | `/settlements` | yes | `settlements.manage` | yes | `settlements.create` | DRAFT + lines |
| POST | `/settlements/:id/finalize` | yes | `settlements.manage` | yes | `settlements.finalize` | Ledger + FINALIZED |
| POST | `/settlements/:id/cancel` | yes | `settlements.manage` | yes | `settlements.cancel` | CANCELLED if DRAFT |
| POST | `/settlements/:id/adjustments` | yes | `settlements.manage` | yes | optional | DRAFT only |

---

## 9. Payout Model

### Lifecycle (sandbox/internal — no live rail)

```text
PENDING
  → SUBMITTED     (accepted by internal payout runner)
  → PAID          (sandbox success)
  → FAILED        (sandbox failure / validation)
  → CANCELLED     (from PENDING only)
```

Schema already: `PENDING|SUBMITTED|PAID|FAILED|CANCELLED`.

### Rules

1. Settlement must be **FINALIZED**.  
2. Amount ≤ remaining unpaid net for that settlement (sum PAID+SUBMITTED+PENDING).  
3. Currency match.  
4. `payout_account_id` required; account org-scoped, verified/approved per bank module rules.  
5. Step-up on create and mark-paid (sensitive).  
6. **Sandbox runner:** internal job/API transitions PENDING→SUBMITTED→PAID/FAILED without external provider.  
7. **Ledger on PAID:** reduce available / move to settled (per P15.1-A mapping).  
8. **FAILED:** no net money movement (or reverse SUBMITTED reserve if used).  
9. Outbox: `payout.created`, `payout.submitted`, `payout.paid`, `payout.failed`.

### APIs (proposed)

| Method | Path | Permission | Step-up | Notes |
|---|---|---|---|---|
| GET | `/payouts` | `payouts.read` | — | exists |
| GET | `/payouts/:id` | `payouts.read` | — | add |
| POST | `/payouts` | `payouts.manage` | yes | bind bank account + settlement |
| POST | `/payouts/:id/submit` | `payouts.manage` | yes | sandbox submit |
| POST | `/payouts/:id/mark-paid` | `payouts.manage` | yes | sandbox success + ledger |
| POST | `/payouts/:id/fail` | `payouts.manage` | yes | sandbox fail |
| POST | `/payouts/:id/cancel` | `payouts.manage` | yes | PENDING only |

**Live provider payout rail:** out of scope (DEC-009 / P15.2).

---

## 10. Reconciliation Model

### Current

Count `SUCCEEDED` PIs vs `provider_transactions`; write `COUNT_MISMATCH`.

### Target (P15.1)

Match on:

| Dimension | Check |
|---|---|
| Reference | provider_transaction_id / attempt ref ↔ PI |
| Amount | minor units |
| Currency | code |
| Status | provider vs PI vs ledger presence |
| Settlement | PI included exactly once if FINALIZED expected |
| Payout | payout amount vs settlement remaining |

**Discrepancy types (proposed):**  
`MISSING_PROVIDER`, `MISSING_PAYMENT`, `DUPLICATE_PROVIDER`, `AMOUNT_MISMATCH`, `CURRENCY_MISMATCH`, `STATUS_MISMATCH`, `SETTLEMENT_MISMATCH`, `PAYOUT_MISMATCH`, `LEDGER_MISSING`.

### Schema (plan)

- Extend `reconciliation_runs` with `scope`, `started_at`, `finished_at`, `status` CHECK  
- Extend discrepancies with `left_ref`, `right_ref`, `expected_minor`, `actual_minor`, `currency_code`  
- Optional `reconciliation_match_pairs` for audit

### APIs

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/reconciliation/runs` | exists — deepen POST body (period, provider) |
| GET | `/reconciliation/runs/:id` | add with discrepancies |

---

## 11. Idempotency Model

| Operation | HTTP idempotency | Financial side-effect idempotency |
|---|---|---|
| Payment success ledger | N/A (internal) | **Need** UNIQUE `(organization_id, source_type, source_id)` on `ledger_journals` |
| Refund create | `refunds.create` + refunds unique key | Journal source `refund` + refund id |
| Settlement create | `settlements.create` | Unique lines / inclusion table |
| Settlement finalize | `settlements.finalize` | Journal source `settlement_finalize` + settlement id; status guard |
| Payout create | `payouts.create` | Unique business key optional `(org, settlement_id, idempotency_key)` |
| Payout paid | `payouts.mark_paid` | Journal source `payout` + payout id |
| Webhook apply | provider event id unique | Existing webhook event + PI terminal skip |

**Recommended constraint:**

```text
UNIQUE (organization_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL
```

on `ledger_journals` (additive migration after approval).

---

## 12. Financial Invariants

| # | Invariant | Enforce at |
|---|---|---|
| I1 | Every journal balances (debit = credit) | Service (`postBalancedJournal`) + test |
| I2 | Posted journals/entries immutable | DB trigger (`028`) + test |
| I3 | No cross-tenant financial write | Service org scope + tests; RLS deferred |
| I4 | No duplicate ledger post per source | **Unique index** + app check |
| I5 | Refund ≤ refundable captured | Service + test |
| I6 | Payout ≤ unpaid finalized net | Service TX + test |
| I7 | Payment cannot be in two non-cancelled settlements | **Unique index** on settlement_lines.payment_intent_id WHERE settlement active |
| I8 | Finalize once | Status CHECK + UPDATE … WHERE status='DRAFT' |
| I9 | Failed provider path does not post success ledger | Service + existing ambiguous tests |
| I10 | Retry does not double money | I4 + HTTP idempotency + tests |
| I11 | Settlement net = gross − fees − reserves + adjustments | Service compute + stored CHECK optional |
| I12 | FINALIZED settlement lines immutable | Trigger or status guard on lines |

---

## 13. Database Changes (planning only — do not apply now)

### Modify existing

| Table | Change |
|---|---|
| `ledger_journals` | Unique partial index on `(organization_id, source_type, source_id)` |
| `settlements` | Add `provider_fees_minor`, `platform_fees_minor`, `reserves_minor`, `adjustments_minor`, `finalized_at`, `finalized_by`, `version` |
| `settlement_lines` | Add `gross_minor`, `refunded_minor`, `net_minor`; unique PI inclusion |
| `payouts` | Require `payout_account_id` on create path; add `idempotency_key`, `failure_reason`, `submitted_at`, `paid_at` |
| `reconciliation_runs` | Status CHECK; richer counters |
| `reconciliation_discrepancies` | Structured amount/currency fields |

### New tables (proposed)

| Table | Purpose |
|---|---|
| `fee_schedules` | Org/env/currency schedule header |
| `fee_schedule_lines` | bps + fixed_minor + fee_type |
| `settlement_adjustments` | Manual signed adjustments on DRAFT |
| `payment_settlement_marks` (optional) | Explicit PI↔settlement FINALIZED marker if unique on lines insufficient |
| `financial_outbox_dead_letters` (optional) | Later; may reuse `outbox_events` |

### Not in P15.1

FX rate tables, live payout provider credentials, Zoho mappings.

---

## 14. API Changes (current vs required)

### Exists today (phase7)

| Method | Path | Step-up | Notes |
|---|---|---|---|
| GET/POST | `/refunds` | POST yes | |
| GET | `/balances` | — | |
| GET | `/ledger/accounts`, `/ledger/entries` | — | |
| GET/POST | `/settlements` | POST yes | create DRAFT only |
| GET/POST | `/payouts` | POST yes | PENDING only |
| GET/POST | `/reconciliation/runs` | — | thin |
| GET | `/books/sync-state` | — | read stub |

### Required additions / changes

See Settlement (§8) and Payout (§9) tables. Also:

| Method | Path | Purpose |
|---|---|---|
| GET | `/settlements/:id` | Detail + lines (service exists, route missing) |
| GET | `/fee-schedules` | Read schedules |
| PUT | `/fee-schedules` | Upsert (step-up) |

Auth remains session/API key + org context + RBAC; sensitive ops keep step-up.

---

## 15. Event / Outbox Contract

### Already emitted (payments/refunds)

`payment.created|processing|succeeded|failed|cancelled|expired`, `payment.refunded`, `payment.partially_refunded`, `refund.created`, `provider.webhook.received`

### Must add in P15.1

| Event | When |
|---|---|
| `settlement.created` | DRAFT created (upgrade audit → outbox) |
| `settlement.finalized` | After ledger post |
| `settlement.cancelled` | DRAFT cancelled |
| `payout.created` | Payout inserted |
| `payout.submitted` | Sandbox submit |
| `payout.paid` | Paid + ledger |
| `payout.failed` | Failed |
| `fee.recorded` | Optional on finalize (or embed in settlement.finalized payload) |
| `adjustment.created` | When adjustment added |

### Payload contract (minimum)

```text
organization_id, environment, event_id, occurred_at,
resource_type, resource_id,
currency_code, amounts { gross, fees, net, ... },
related_ids { payment_intent_id[], settlement_id, payout_id },
idempotency_key
```

Worker today no-ops most events — P15.1 wires **financial events → Internal Books connector boundary** (record `books_sync_state`), not a full Books product.

---

## 16. Internal Books Integration Boundary

**Decision (product):** target is **IMKAN Internal Books** (Zoho-like), **not** Zoho cutover.

| Layer | P15.1 responsibility |
|---|---|
| Payments Financial Core | Emit domain events via outbox |
| Contract | Versioned event schema + docs |
| Connector | `BooksConnector.syncEvent` persists to `books_sync_state` |
| IMKAN Books System | **Out of scope** — built later consuming the contract |

Update planning note for DEC-016: prefer closing as **Internal Books** rather than Zoho; formal DEC update on approval.

**Do not build:** chart of accounts UI, invoices in Books, Zoho API.

---

## 17. UI Gaps

| Screen | Gap | P15.1 priority |
|---|---|---|
| Settlements | Draft create exists; need finalize/cancel/detail/lines/fees breakdown | **In scope** |
| Payouts | Create exists; need account select, status actions, failure reasons | **In scope** |
| Balances | Show reserved/settled when implemented | **In scope** |
| Reconciliation | Nav “Coming soon”; API thin | **In scope** (basic UI) |
| Ledger browser | Coming soon | Optional / later |
| Payment Links create | Missing advanced fields | **Defer** (post-core or H) |
| Checkout redirects | No success/cancel navigation | **Defer** |
| ComingSoonPage copy | Stale finance text | Cleanup |

---

## 18. Test Plan

### Payment (regression — keep green)

success, failure, retry/concurrent, duplicate session pay, webhook, idempotency (existing phase4/5).

### Refund

full, partial, multi-partial, duplicate, concurrent, failed provider, webhook once (existing + extend FAILED path if added).

### Settlement (new)

correct inclusion; exclude refunded net; no duplicate PI; period cutoff; finalize ledger; cancel draft; concurrent finalize; retry finalize idempotent; fees default 0 and non-zero schedule.

### Balance (new)

pending/available/reserved/settled after pay→finalize→payout; invalid transitions rejected.

### Payout (new)

valid verified account; invalid/missing account; insufficient remaining; duplicate idempotency; retry; fail; paid ledger.

### Ledger (extend)

balanced; immutable; unique source; rollback on finalize failure; tenant isolation.

### Reconciliation (new)

exact match; amount/currency/status/missing/duplicate/settlement/payout mismatches.

### Integration E2E (required)

```text
Payment Link → Checkout → SUCCEEDED → Ledger → Balances
→ Settlement DRAFT → FINALIZE → Balances
→ Payout → PAID → Balances
→ Reconciliation run
→ Outbox financial events → books_sync_state
```

---

## 19. Migration Plan (after approval only)

Additive only (`029+`), never edit applied migrations.

1. Inspect live schema  
2. `029_ledger_journal_source_unique.sql`  
3. `030_settlement_fee_breakdown_and_marks.sql`  
4. `031_fee_schedules.sql`  
5. `032_payout_hardening.sql`  
6. `033_reconciliation_enrichment.sql`  
7. Migrate → rollback notes → tests  

Exact numbering assigned at implementation time based on latest applied migration.

---

## 20. Implementation Phases (proposed)

| Phase | Name | Goal | Depends on |
|---|---|---|---|
| **P15.1-A** | Financial Model / DEC-008 | Close DEC-008.1–.7; fee schedule schema; eligibility = gross−refunds; document balance semantics | Approval |
| **P15.1-B** | Ledger Hardening | Unique journal source; settlement/payout/fee posting helpers; use revenue/cash accounts as designed | A |
| **P15.1-C** | Balances | Real reserved/settled; API contract; no frontend sums | B |
| **P15.1-D** | Settlement | Eligibility, anti-double-include, finalize/cancel, ledger, outbox, APIs, UI | A–C |
| **P15.1-E** | Payout | Bank binding, sandbox state machine, ledger on PAID, APIs, UI | D |
| **P15.1-F** | Reconciliation | Amount/reference matching + discrepancy types + API/UI basics | D–E |
| **P15.1-G** | Financial Events / Books Contract | Outbox payloads; wire connector; document Internal Books boundary; update DEC-016 intent | D–E |
| **P15.1-H** | Full Financial E2E | Integration suite + regression `test:pg` | A–G |
| **P15.1-I** | Final Audit | DoD checklist; Production Gate impact note; **STOP** | H |

**Optional parallel (non-blocking):** Payment Link UI / checkout redirect polish — only after D or in H if time permits.

**Ordering rationale:** Cannot finalize settlement honestly without fee/eligibility model (A); cannot trust balances without ledger posts (B→C); payout requires finalized settlement (D→E); recon and Books contract need stable events (F–G).

---

## 21. Dependencies

| Dependency | Type | Blocks |
|---|---|---|
| Explicit approval of this plan | Process | All implementation |
| DEC-008 decisions (esp. .1–.5; .6 FX defer OK) | Product | Fee math / finalize |
| Verified payout accounts (Phase 3 banking) | Exists | Payout binding |
| P15.0 residuals (Redis, KMS, cookies, PCI, E2E security) | Tracked | **Production Gate**, not P15.1 start |
| DEC-009 live provider | Out of scope | Live payout/capture |
| Internal Books product build | Later | Full accounting UX |

---

## 22. Risks

| Risk | Mitigation |
|---|---|
| Shipping with fees=0 forever | DEC-008.1 + schedules default 0, not hard-coded forever |
| Double settlement inclusion | Unique constraint + finalize lock |
| Balance semantics confuse merchants | Document + UI labels + tests |
| Payout without bank validation | Require verified account |
| Scope creep into Live Provider / Zoho | Explicit out-of-scope list |
| Breaking checkout regression | Preserve payment path; run phase4/5/refund suites every phase |
| Concurrent finalize races | TX + status WHERE DRAFT + journal unique |

---

## 23. Definition of Done (P15.1)

P15.1 is **DONE** only when all are true with evidence:

1. DEC-008 decided (FX may be deferred explicitly).  
2. Settlement DRAFT→FINALIZE→CANCEL works with no double PI inclusion.  
3. Finalize posts balanced immutable ledger journals.  
4. Balances expose meaningful pending/available/settled (reserved per DEC).  
5. Payout sandbox lifecycle works with bank account + ledger on PAID.  
6. Reconciliation detects amount/reference/status classes of mismatch.  
7. Financial outbox events defined and written; Internal Books connector receives finalize/payout events into `books_sync_state`.  
8. Invariants I1–I12 covered by tests.  
9. `npm run test:pg` green including new financial E2E suite.  
10. No Live Provider / Zoho implementation claimed.  
11. Final audit doc written; Production Ready still **not** claimed.  
12. **STOP** — no auto-start of P15.2.

---

## 24. Production Gate Impact

| Gate area | After P15.1 |
|---|---|
| Financial invariants | Moves PARTIAL → much closer to PASS (sandbox integrity) |
| Settlement / payout | Moves from stub → real internal lifecycle |
| Fees | Unblocked only if DEC-008 closed |
| Live money movement | Still BLOCKED (DEC-009) |
| Books | Contract ready; product still later |
| Security residuals | Unchanged (Redis/KMS/PCI/E2E) |
| Overall Production Gate | Remains **NOT PASSED** until P15.2–P15.6 + external gates |

---

# PROPOSED P15.1 IMPLEMENTATION PLAN

1. **P15.1-A — Financial Model / DEC-008**  
2. **P15.1-B — Ledger Hardening**  
3. **P15.1-C — Balances**  
4. **P15.1-D — Settlement**  
5. **P15.1-E — Payout (sandbox lifecycle)**  
6. **P15.1-F — Reconciliation**  
7. **P15.1-G — Financial Events / Internal Books Contract**  
8. **P15.1-H — Full Financial E2E**  
9. **P15.1-I — Final Audit → STOP**

---

## Approval Gate

```text
IMPLEMENTATION MUST NOT START until explicit user approval of this plan.

No code changes.
No migrations applied.
No P15.2 / Live Provider.
No Zoho Books integration.
No Internal Books product build in P15.1 beyond connector contract.
```

**Awaiting approval to begin P15.1-A.**
