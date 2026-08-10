# Phase 6 Implementation Plan — Billing

**Date:** 2026-08-09  
**Status:** APPROVED + IMPLEMENTED (see `PHASE6_COMPLETION_REPORT.md`) — Phase 7 not started  
**Baseline:** Phase 5 ACCEPTED (Provider Router + Sandbox; migrations 000–017; PG 78/78; normal 99/99)  
**SoR:** PostgreSQL 16 + `/api/v1` only  
**Legacy:** MySQL `/v1` feature-frozen (DEC-014 / `LEGACY_V3_FREEZE.md`) — reference domain logic only; do not expand

---

## 1. Objective

Build a production-grade **V4 Billing** domain on PostgreSQL that supports:

Products → Prices → Subscriptions (lifecycle) → Invoices → Renewal worker → Payment collection via **Provider Router** → Failed-payment / retry → Billing events → Merchant UI

with tenant isolation, RBAC, idempotency, auditability, and comprehensive tests/docs.

**Explicit non-claims for Phase 6:**

- Not Production Ready for live money / live recurring rails
- No invented real-provider recurring/tokenization capabilities (DEC-009 still OPEN)
- No fee schedules, reserves, FX, settlement, payouts (DEC-008 / Phase 7+)
- No full ledger SoR posting (Phase 7 Financial Core) unless DEC-007 chooses a deferred stub (see §3)

---

## 2. What to preserve (do not break)

| Asset | Rule |
|---|---|
| Phase 1–5 migrations `000`–`017` | Do not rewrite; additive migrations only (`018+`) |
| Payment Core FSM / tables | Unchanged semantics; Billing **calls** Payment Core / creates payment intents through existing services |
| Provider Router contract | Sole path for provider money movement; Payment Core remains Router-dependent |
| API keys, rate limits, webhook ingress | Reuse; extend scopes/permissions for billing |
| Legacy `/v1` billing | Freeze — port ideas from `domain/billing` only |

---

## 3. Decision analysis (must resolve or surface before coding)

### 3.1 DEC-007 — Subscription renewal / invoice / retry / ledger effects — **OPEN (BLOCKER)**

**Tracker text:** *Subscription renewal/invoice/retry/ledger effects*  
**Blocks:** Billing financial behavior (renewals that claim money effects)

SoT (`11` §J) requires the implementation to define:

1. Renewal timing  
2. Invoice generation  
3. Failed-payment retries  
4. Webhook / event behavior  
5. Ledger effects  

**No approved V4 decision exists today.** Legacy domain helpers encode *de facto* policies that must **not** be silently promoted without approval:

| Topic | Legacy reference behavior | Risk if invented |
|---|---|---|
| Due selection | `next_billing_at <= now`, statuses `ACTIVE`/`TRIALING`/`PAST_DUE` | Wrong dunning window |
| Retries | max **3** attempts; backoff `min(3600, 2^(n-1)*300)` seconds | Over/under charging retries |
| Failure status | subscription → `PAST_DUE`; invoice stays OPEN | Wrong lifecycle |
| Grace | helper `isSubscriptionInGracePeriod` exists; engine usage incomplete | Ambiguous cancel/expire |
| Ledger | legacy engine posts via MySQL `LedgerService` | Violates Phase 7 boundary if copied blindly |
| Idempotency | invoice number / payment key loosely used | Duplicate charges |

#### Proposed DEC-007 resolution for Phase 6 approval (draft — **not implemented until approved**)

**Option A — Recommended: “Billing collection + deferred ledger”**

| Topic | Proposed decision |
|---|---|
| **Renewal timing** | Worker selects subscriptions where `status IN ('ACTIVE','TRIALING','PAST_DUE')` AND `cancel_at_period_end = FALSE` (or period end not yet passed for cancel) AND `next_billing_at <= NOW()` AND (`next_retry_at IS NULL OR next_retry_at <= NOW()`). Batch size configurable (default 25). UTC only. |
| **Invoice generation** | On due: create **one** `invoice` + `invoice_items` for the period in status `OPEN`, with unique `(organization_id, number)` and unique open renewal key `(subscription_id, period_start, period_end)` to prevent duplicate period invoices. Amounts = sum of subscription items’ price `unit_amount_minor` (DEC-001 `NUMERIC(30,0)` + currency). Tax = `0` unless later tax policy approved (do not invent tax rates). |
| **Payment collection** | Create/link a V4 `payment_intent` (via Payment Core helpers) for `invoice.total_minor`; collect through **Provider Router** + stored `payment_method_token` / customer default method. Sandbox: opaque token path only. Ambiguous/timeout → **query-before-retry**; never blind re-charge (Phase 5 rule). |
| **Success** | Invoice → `PAID`; subscription → `ACTIVE` (or remain `ACTIVE`); advance `current_period_*` + `next_billing_at` via interval; clear retry counters; emit events. |
| **Failure** | Invoice stays `OPEN` (or `OVERDUE` after due); subscription → `PAST_DUE`; increment `retry_count`; set `next_retry_at = NOW() + backoff`; emit events. |
| **Retry policy** | Max **3** collection attempts per invoice/period. Backoff seconds: `min(3600, 2^(attempt-1) * 300)` → 300, 600, 1200 (capped 3600). After max failures: invoice → `UNCOLLECTIBLE` (or remain OPEN+OVERDUE — **choose one in approval**); subscription → `UNPAID` then `EXPIRED` after grace. |
| **Grace period** | Default **3 days** after final failed attempt (`grace_until`). During grace: status `PAST_DUE`/`UNPAID`; after grace without pay → `EXPIRED` (or `CANCELLED` if `cancel_at_period_end`). |
| **Webhook / events** | Emit outbox domain events (see §9). Outbound merchant webhooks reuse existing delivery foundations where present; otherwise outbox-only until Security/webhook-delivery phase. No invented provider webhook types. |
| **Ledger effects** | **DEFERRED to Phase 7.** Phase 6 records billing + payment outcomes and outbox events only. **No** `ledger_*` mutations in Phase 6. Financial Core consumes `billing.invoice.paid` / `payment.succeeded` later. |
| **Upgrade/downgrade** | Phase 6 MVP: cancel-at-period-end + new subscription OR proration **deferred** (mark PARTIAL). Document as follow-up unless approved in-scope. |

**Option B — Full financial coupling (NOT recommended now)**  
Require Phase 7 ledger schema + DEC-008 fee rules inside Phase 6. **Reject for this phase** — violates “do not start Phase 7 automatically” and DEC-008 OPEN.

**Option C — Catalog-only Billing (NOT recommended)**  
Ship products/prices/subscriptions/invoices without renewal worker. Fails user-required Phase 6 scope (renewal + collection).

**Approval ask:** Accept **Option A** (or amend numbers: max retries, backoff, grace, terminal statuses) and record as **DEC-007 RESOLVED** in `docs/decisions/OPEN_DECISIONS.md` before coding renewals.

---

### 3.2 DEC-006 — Customer unique matching — **OPEN (dependency)**

Subscriptions/invoices require a customer. V4 still lacks first-class `customers` (Phase 4 noted).

**Phase 6 interim (requires approval with plan):**

- Add V4 `customers` table: `organization_id`, `email`, `name`, `phone`, `status`, `metadata_json`, timestamps  
- Uniqueness interim: **`(organization_id, lower(email))` WHERE email IS NOT NULL** (simple, reversible)  
- Document that DEC-006 may later change matching (phone/external id) without inventing merge algorithms now  
- No silent merge of duplicates

If DEC-006 is preferred resolved first with a different algorithm, pause customer APIs until that decision.

---

### 3.3 DEC-008 — Fees / FX / rounding — **OPEN (out of Phase 6 money rules)**

- Invoice totals = item sum + optional explicit `tax_minor` supplied by API (no computed tax rates)  
- No platform fee lines, reserves, FX conversion  
- Fee labels in master data may be referenced later; **no fee engine**

---

### 3.4 DEC-009 / recurring capability — **OPEN**

- Renewals in Phase 6 run against **Sandbox** evidence only  
- Do not mark `payment.recurring` VERIFIED for any real provider  
- Live off-session renewals blocked until capability evidence + DEC-009

---

### 3.5 DEC-017 — Email — **OPEN**

- Dunning/receipt emails = outbox `email.*` stubs only (same interim as Identity)  
- No invented SMTP vendor

---

## 4. Scope map

### In scope (Phase 6)

| Area | Include |
|---|---|
| Catalog | Products, Prices (recurring intervals DAY/WEEK/MONTH/YEAR) |
| Customers (interim) | Minimal V4 customers for billing attach |
| Subscriptions | Create/activate/pause/resume/cancel/expire; items; trial; cancel_at_period_end |
| Invoices | Draft/open/paid/void/overdue/uncollectible; items; link to subscription + payment_intent |
| Renewal worker | Due scan, invoice, collect via Router, retry/grace per DEC-007 |
| Events | Outbox billing.* (+ security/audit) |
| API | `/api/v1` merchant (+ limited platform read) |
| UI | Merchant portal screens for Products, Prices, Subscriptions, Invoices (V4 API) |
| RBAC | `billing.*` / `products.*` / `invoices.*` permissions |
| Tests + docs | Per feature DoD |

### Out of scope (explicit)

- Ledger / balances / settlements / payouts / reconciliation (Phase 7)  
- Risk / disputes  
- Books sync (Phase 9; DEC-016)  
- Real provider recurring adapters  
- Proration engine (unless approved under DEC-007)  
- Expanding legacy MySQL billing routes  

---

## 5. Proposed database entities (additive migrations `018+`)

All money: `NUMERIC(30,0)` + `currency_code CHAR(3)` FK → `master_currencies` (DEC-001).  
All tenant rows: `organization_id` FK → `organizations` + indexes for isolation.

| Table | Purpose | Key constraints |
|---|---|---|
| `customers` | Billing/payment customer | org scope; unique `(org, lower(email))` interim |
| `products` | Catalog product | org; `code` unique per org; type ONE_TIME\|SUBSCRIPTION; status |
| `prices` | Price for product | FK product; amount_minor + currency; interval_unit/count for recurring; active flag; no delete if referenced |
| `subscriptions` | Subscription header | FK org, customer, (default) price or items; status machine; period fields; `next_billing_at`, `next_retry_at`, `retry_count`, `grace_until`, `cancel_at_period_end`, version/optimistic lock |
| `subscription_items` | Line items | FK subscription, price; quantity ≥ 1 |
| `subscription_transitions` | Append-only status history | like payment_intent_transitions |
| `invoices` | Invoice header | unique number per org; status; totals; FK subscription nullable; FK payment_intent nullable; period_start/end |
| `invoice_items` | Lines | amount_minor, description, price_id nullable |
| `billing_collection_attempts` | Collection attempts per invoice | attempt_number; provider refs; status; idempotency_key unique per org |

**Optional / only if needed:** `billing_schedules` — prefer columns on `subscriptions` to avoid speculative tables.

**RBAC seed migration:** permissions e.g. `products.read/manage`, `prices.read/manage`, `subscriptions.read/manage`, `invoices.read/manage`, `billing.manage` (aggregate), assign to MERCHANT_OWNER/ADMIN/FINANCE/DEVELOPER (read) patterns consistent with Phase 3–5.

**Idempotency:** reuse `idempotency_keys` for mutating APIs; DB unique keys for renewal invoice per period + collection attempt keys.

---

## 6. Domain / state machines

### 6.1 Subscription statuses (align SoT `11` §J; normalize spelling)

Proposed: `TRIALING` → `ACTIVE` → `PAST_DUE` → `UNPAID` → `EXPIRED`  
Also: `PAUSED`, `CANCELLED` (prefer SoT spelling `CANCELLED`; map legacy `CANCELED` in ports).

Transitions (summary):

| From | To | Trigger |
|---|---|---|
| (new) | TRIALING / ACTIVE | create (+ trial_days) |
| TRIALING | ACTIVE | trial end + successful first invoice **or** trial end with $0 trial |
| ACTIVE | PAST_DUE | failed renewal collection |
| PAST_DUE | ACTIVE | successful collection |
| PAST_DUE | UNPAID | max retries exhausted |
| UNPAID | EXPIRED | grace elapsed |
| ACTIVE/TRIALING/PAST_DUE | PAUSED | merchant pause |
| PAUSED | ACTIVE | resume (if period valid) |
| * | CANCELLED | cancel (immediate or at period end) |

### 6.2 Invoice statuses

`DRAFT` → `OPEN` → `PAID` | `VOID`  
`OPEN` → `OVERDUE` → `UNCOLLECTIBLE`  
(Exact terminal after max retries fixed by DEC-007 approval.)

### 6.3 Services (V4 modules under `apps/api/src/billing/`)

| Service | Responsibility |
|---|---|
| `customer-service` | CRUD + tenant isolation |
| `product-service` / `price-service` | Catalog |
| `subscription-service` | Lifecycle + items + transitions |
| `invoice-service` | Invoice CRUD, void, link payment |
| `renewal-service` + `renewal-worker` | Due processing, retries (DEC-007) |
| `billing-collection-service` | Payment Intent + Provider Router authorize; ambiguous handling |

Reuse: `providerRouter`, Payment Core session/intent patterns where applicable, `emitOutboxEvent`, `writeAuditEvent`, `rateLimit`, API key scopes.

---

## 7. APIs (`/api/v1`)

All mutating POSTs/PUTs: `Idempotency-Key` required (Phase 2 middleware).  
Auth: session Bearer **or** API key with billing scopes.  
Rate limits: billing write buckets + reuse payment buckets for collection.

| Method | Path | Permission (draft) |
|---|---|---|
| CRUD | `/customers` | `customers.manage` / read |
| CRUD | `/products`, `/products/:id` | `products.*` |
| CRUD | `/prices`, `/prices/:id` | `prices.*` |
| POST/GET | `/subscriptions`, lifecycle actions (`pause`,`resume`,`cancel`) | `subscriptions.*` |
| GET/POST | `/invoices`, `void`, `pay` (collect) | `invoices.*` |
| GET | `/billing/overview` (counts) | `subscriptions.read` |

Public: none for billing (no anonymous subscription create in Phase 6 MVP).

---

## 8. Renewal worker

- Process interval env-configurable (default ~5s in non-prod; higher in prod docs)  
- `SELECT … FOR UPDATE SKIP LOCKED` (or equivalent) for concurrency  
- Per subscription/invoice idempotency keys: `billing-renew:{subscription_id}:{period_start}` / `billing-collect:{invoice_id}:{attempt}`  
- Payment path: **Provider Router only** (sandbox in test)  
- On AMBIGUOUS/TIMEOUT: record attempt, set query-before-retry; do not advance period; do not create second charge key  

---

## 9. Events (outbox)

| Event type | When |
|---|---|
| `billing.customer.created` | customer create |
| `billing.product.created` / `price.created` | catalog |
| `billing.subscription.created` / `.updated` / `.cancelled` / `.past_due` / `.expired` | lifecycle |
| `billing.invoice.created` / `.paid` / `.voided` / `.uncollectible` | invoice |
| `billing.collection.succeeded` / `.failed` / `.ambiguous` | collection |

Payloads include `organization_id`, aggregate ids, amounts as strings, currency, `request_id` when available.  
Audit + security events on cancel, void, collection failure bursts.

---

## 10. UI (Definition of Done requires UI)

Target: extend `apps/web` with **V4 `/api/v1`** screens (not legacy `/v1`):

| Screen | Purpose | Roles |
|---|---|---|
| Products | list/create/activate | OWNER/ADMIN/FINANCE |
| Prices | attach to product, interval, amount | OWNER/ADMIN/FINANCE |
| Subscriptions | list, detail, pause/resume/cancel | OWNER/ADMIN/FINANCE |
| Invoices | list, status, pay/retry (sandbox) | OWNER/ADMIN/FINANCE |
| Customers (minimal) | create/list for subscription attach | OWNER/ADMIN |

Keep legacy Subscriptions tab labeled/frozen or dual-run behind flag — **do not add features to legacy `/v1`**. Prefer new V4 nav entries.

UI follows existing portal patterns; no invented live provider branding.

---

## 11. Feature-by-feature Definition of Done

Each feature below must be completed with: Objective · Dependencies · Database · Domain/service · APIs · UI · Events · Tests · Documentation · Acceptance Criteria · Production Gate.

### F1 — Customers (interim)
- **Objective:** Tenant-scoped customer records for subscriptions/invoices  
- **Dependencies:** DEC-006 interim approval; orgs/RBAC  
- **DB:** `customers`  
- **AC:** CRUD + isolation; unique email per org; no PAN  
- **Production Gate:** matching algorithm may change under DEC-006 — document limitation  

### F2 — Products & Prices
- **Objective:** Recurring catalog  
- **Dependencies:** master_currencies; F1 optional  
- **DB:** `products`, `prices`  
- **AC:** DEC-001 money; cannot delete in-use price; interval validation  
- **Production Gate:** catalog-only until subscriptions proven  

### F3 — Subscription lifecycle
- **Objective:** State machine + items + trial + cancel_at_period_end  
- **Dependencies:** F1–F2; DEC-007 for renewal-related statuses  
- **DB:** `subscriptions`, `subscription_items`, `subscription_transitions`  
- **AC:** Illegal transitions rejected; append-only history; tenant isolation  
- **Production Gate:** no live recurring claim  

### F4 — Invoices
- **Objective:** Invoice + items linked to subscription/payment  
- **Dependencies:** F3; DEC-007 invoice rules; DEC-008 out (no fee engine)  
- **DB:** `invoices`, `invoice_items`  
- **AC:** unique number; totals exact; void rules; link payment_intent  
- **Production Gate:** not a tax engine  

### F5 — Renewal scheduling / worker
- **Objective:** Due renewals processed safely  
- **Dependencies:** **DEC-007 RESOLVED**; F3–F4; Provider Router  
- **DB:** retry/grace columns; collection attempts  
- **AC:** no duplicate period invoice; SKIP LOCKED concurrency; idempotent reruns  
- **Production Gate:** sandbox evidence only  

### F6 — Payment collection via Provider Router
- **Objective:** Collect invoice through Router → Adapter  
- **Dependencies:** Phase 5 Router; Payment Core; F4–F5  
- **AC:** success/fail/ambiguous paths; query-before-retry; provider_transactions recorded  
- **Production Gate:** sandbox only; DEC-009 for live  

### F7 — Failed-payment / retry / grace
- **Objective:** Dunning per DEC-007  
- **Dependencies:** DEC-007 numbers approved  
- **AC:** backoff, max attempts, grace → EXPIRED/CANCELLED as decided  
- **Production Gate:** policy change requires decision update  

### F8 — Billing events + API + RBAC + rate limits
- **Objective:** Operable, secured surface  
- **Dependencies:** outbox; Phase 5 API keys  
- **AC:** permissions enforced; scopes; audit on sensitive actions  
- **Production Gate:** keys hashed; no secret in logs  

### F9 — Merchant UI (V4)
- **Objective:** Operable billing screens on `/api/v1`  
- **Dependencies:** F1–F8 APIs  
- **AC:** create product→price→subscription→see invoice; role-gated  
- **Production Gate:** prototype quality OK; not PCI UI  

### F10 — Tests & documentation
- **Objective:** Regression + billing proof  
- **AC:** unit state machines; PG integration; renewal concurrency; tenant isolation; Router collection; webhook/outbox; migration tests; update readiness docs  
- **Production Gate:** green tests ≠ Production Ready  

---

## 12. Test plan (minimum)

| Suite | Coverage |
|---|---|
| Unit | subscription/invoice state machines; period advance; retry backoff; grace |
| Integration (PG) | CRUD catalog; subscription lifecycle; renewal happy/fail/ambiguous; duplicate period protection; tenant isolation; RBAC |
| API | Idempotency replay; validation; API key scopes |
| Worker | Concurrent workers do not double-charge (SKIP LOCKED + idempotency) |
| Regression | `npm run test:pg` includes Phase 1–5 + Phase 6; `npm test` unit/domain |
| Port legacy domain tests | Re-home pure domain tests against V4 modules (keep legacy tests or mark superseded) |

---

## 13. Documentation plan

| Doc | Purpose |
|---|---|
| `PHASE6_IMPLEMENTATION_PLAN.md` | This plan |
| `06-billing.md` | Architecture overview after impl |
| `BILLING_API.md` | API contract |
| `SUBSCRIPTION_STATE_MACHINE.md` | Transitions |
| `INVOICES.md` | Invoice rules |
| `RENEWAL_WORKER.md` | Scheduling/retry/idempotency |
| Update `OPEN_DECISIONS.md` | DEC-007 (+ DEC-006 interim if approved) |
| `PHASE6_COMPLETION_REPORT.md` | End of phase (after impl) |
| Freeze hygiene only for legacy billing notes | No feature expansion |

---

## 14. Implementation order (after approval)

1. Record DEC-007 (+ DEC-006 interim) in OPEN_DECISIONS  
2. Migrations `018+` (customers → catalog → subscriptions → invoices → attempts → RBAC)  
3. Domain state machines + services  
4. APIs + RBAC + rate-limit buckets + API key scopes  
5. Renewal worker + Router collection  
6. UI screens  
7. Tests  
8. Docs + completion report  
9. **STOP** — do not start Phase 7  

---

## 15. Production Gate (phase-level)

Phase 6 may be marked **COMPLETE** only when feature DoDs pass **and**:

- DEC-007 recorded as RESOLVED (or explicitly DEFERRED with narrowed scope)  
- Sandbox renewal evidence exists  
- No live provider recurring claim  
- Ledger explicitly deferred (Option A) or Phase 7 started under separate approval  
- PCI / DEC-011 / DEC-009 still block production card recurring  
- Completion report states **Not Production Ready**

---

## 16. Approval checklist (wait here)

Before any Phase 6 code:

- [ ] Phase 6 plan accepted  
- [ ] **DEC-007 Option A accepted or amended** (retries, backoff, grace, terminal invoice/subscription statuses, ledger deferred)  
- [ ] **DEC-006 interim** email uniqueness accepted (or alternate matching decided)  
- [ ] Confirm upgrade/downgrade/proration **out of MVP**  
- [ ] Confirm UI in `apps/web` on `/api/v1` is required in this phase (yes per SoT DoD)  
- [ ] Confirm no Phase 7 ledger work in this phase  

---

## 17. Stop

**No Phase 6 implementation begins until this plan and DEC-007 (and customer interim) are approved.**  
**Do not start Phase 7 Financial Core automatically after planning or after a future Phase 6 completion.**
