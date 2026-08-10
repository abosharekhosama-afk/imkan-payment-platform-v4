# PROJECT GAP ANALYSIS — IMKAN Payments V4 vs Current V3.4.1

**Phase:** ANALYSIS ONLY  
**Date:** 2026-08-08  
**Verdict:** Current platform is a **usable multi-tenant payments foundation** (MySQL, Fastify, sandbox-first). It is **not** V4-compliant. Largest blockers: **PostgreSQL mandate**, **Organization/KYB/Master Data/Admin**, **provider router model**, and **incomplete AuthZ coverage**.

---

## 1. Scope of comparison

| Side | Basis |
|---|---|
| Target | New-folder V4 `00` + `11`–`13` (binding) |
| Current | Workspace `Payment-Platform-V3.4.1-Windows-Local-Ready` |
| Secondary | Older `e:\process\*`, Downloads enhanced plan — detail only when non-conflicting |

---

## 2. Executive gap summary

| Area | Gap severity | Summary |
|---|---|---|
| Database engine | **CRITICAL** | MySQL today; PostgreSQL mandatory |
| Money representation | **HIGH** | Minor-unit `DECIMAL(30,0)` vs V4 NUMERIC + explicit currency model — needs Decision on storage form |
| Tenant model | **CRITICAL** | `tenants`/`merchants` vs `organizations` + membership |
| Identity/Auth completeness | **HIGH** | Login/MFA exist; registration/verify/reset/invitations/step-up incomplete |
| RBAC completeness | **CRITICAL** | Permissions not enforced on all protected routes |
| Admin portal | **CRITICAL** | Missing |
| KYB / verification engine | **CRITICAL** | Missing as first-class domain |
| Master Data | **CRITICAL** | Missing DB-backed catalogs |
| Payment Intent model | **HIGH** | Sessions/payments exist; `payment_intents` missing |
| Provider router + capabilities | **CRITICAL** | Env factory only; no capability matrix/routing tables |
| Webhook inbound verification/replay | **HIGH** | Outbound HMAC exists; inbound incomplete / unwired |
| Books connector | **HIGH** | Zoho-specific partial; not generic V4 connector |
| UI portals / UX | **HIGH** | Single console file; no Admin/Public product surfaces |
| Testing pyramid | **HIGH** | Domain unit tests + smoke; weak API/E2E/security/financial abuse |
| Documentation V4 shape | **MEDIUM** | Pre-V4 docs; missing `docs/implementation`, `docs/decisions`, etc. |
| Sandbox/Production isolation | **HIGH** | Partial production guards; not full V4 isolation model |

---

## 3. Reusable components (keep / port)

These exist and should be **ported or adapted**, not discarded blindly:

1. **Domain layering** — `domain` / `application` / `infrastructure` / `interfaces`
2. **`PaymentProvider` interface** — authorize/capture/refund/payment-method pattern
3. **Sandbox provider** — required for non-production testing (never treat as real money)
4. **PayTabs adapter skeleton** — rewrite against verified capability docs only
5. **Payment state machine** — `domain/payments/state.ts`
6. **Double-entry ledger checks** — `domain/ledger/ledger.ts` + posting services
7. **Idempotency records pattern** — header + persistence
8. **Outbox + webhook delivery worker** — reliability pattern
9. **Session hashing, scrypt passwords, AES-GCM token vault, MFA TOTP**
10. **Billing domain math tests** — subscription/invoice/renewal unit tests
11. **Contracts package** — expand for V4 events
12. **Customers / payment_links / refunds / settlements / payouts concepts** — product knowledge exists even if schema must change
13. **Error reporting + audit log concepts**
14. **Windows local run tooling** — retarget to PostgreSQL

---

## 4. Must rebuild / replace

| Item | Why |
|---|---|
| MySQL + `mysql2` + MySQL migrations | V4 §10 PostgreSQL mandatory |
| Tenant schema (`tenants`) | Replace with organizations membership model |
| HTTP route surface shape | Align to V4 API groups; Admin vs Merchant separation |
| Web UI architecture | Merchant + Admin + Public; AR/EN RTL; Master Data-driven forms |
| Provider selection | Env switch → Router + `providers` / `provider_accounts` / `capabilities` / `routes` |
| Books integration | Zoho-only → Books Connector interface + adapters |
| Seed/demo auth shortcuts | `X-Tenant-ID` incompatible with production-oriented AuthZ |
| Overlapping/legacy migrations + `.bak` | Clean PostgreSQL migration history from V4 catalog |

---

## 5. Feature gap matrix (Coverage Checklist from `11` §S)

| Checklist item | Current | Gap |
|---|---|---|
| Authentication/identity | Partial (login/MFA/logout/me) | Registration, email verify, password reset, invitations, device/session mgmt |
| Organization/tenant model | `tenants` + `merchants` | Rebuild as organizations |
| Company legal/business/people/docs | Missing | Full KYB data model |
| KYB/verification engine | Remote KYC stub only | Dedicated verification domain + states |
| Bank/payout accounts | `bank_accounts` + payouts | Align to `payout_accounts` + verification + step-up |
| Payment Links | Present | Align statuses/fields from `11` §E; schema Decision |
| Hosted Checkout | Partial | Branding, addresses, secure return, locale/RTL |
| Checkout branding | Missing PG config | Required |
| Customers | Basic table/API | Matching strategy Decision; full lifecycle |
| Payments / Refunds | Core present | Add Intent model; harden AuthZ/invariants tests |
| Subscriptions / Invoices | Partial | Renewal/retry/dunning rules Decision |
| Ledger / Balances | Present | Align naming (`balances`), derived views, NUMERIC policy |
| Settlements / Payouts / Reconciliation | Partial | Fees/reserves tables; lifecycle alignment |
| Provider router/adapters | Partial adapters | Router, capabilities, health, fallback anti-double-charge |
| Provider webhooks | Incomplete wiring | Signature + replay + persist pipeline |
| Developer API | Partial `/v1` | Versioned contract completeness |
| Books Connector | Zoho partial | Generic connector |
| Dashboard | Basic UI | Authoritative metrics only |
| Admin Error Center | Tenant `error_reports` | Admin-only incident model |
| Master Data administration | Missing | All `master_*` tables + APIs |
| RBAC | Partial | Full platform/merchant role set + enforcement |
| Audit | `audit_logs` | Split audit/security/login events |
| Security / Financial / E2E testing | Weak vs V4 | See `TEST_PLAN.md` |
| Documentation per operation | Missing V4 folders | Create structure during phases |
| Sandbox/Production isolation | Partial | Strict env/credential/data isolation |
| Production readiness review | Notes exist | Re-run under V4 gate |

---

## 6. Conflicts (Current vs V4)

### 6.1 Hard conflicts (must resolve before/at Foundation)

| # | Conflict | Current | V4 | Resolution approach |
|---|---|---|---|---|
| C1 | DB engine | MySQL 8.4 | PostgreSQL mandatory | Migrate platform to PostgreSQL; new migration chain |
| C2 | Tenant identity | `tenant_id` on `tenants` | `organization_id` / organizations | Schema + Auth context remap |
| C3 | Money storage | Integer minor units `DECIMAL(30,0)` | NUMERIC/DECIMAL + explicit currency | **Decision DEC-001** — choose storage convention without inventing FX/rounding |
| C4 | API prefix | `/v1/...` | Older sketches `/api/v1/...`; New `04` group-level | **Decision DEC-002** |
| C5 | Product branding | “PayPlatform” | IMKAN Payments | Rename surfaces/docs |
| C6 | Admin surface | None | Full Admin Portal | Build as separate portal/routes |
| C7 | AuthZ completeness | Selective `requirePermission` | Server-side on all protected ops | Harden middleware |
| C8 | Provider model | Single env provider | Multi-provider router + capabilities | Rebuild provider domain |
| C9 | Books | Zoho-specific | Generic Books Connector | Interface + adapters |
| C10 | Master Data | Hardcoded/regional | DB Master Data | New domain |
| C11 | Payment model | No `payment_intents` | Intent-first lifecycle | Introduce Intent layer |
| C12 | Roles | Custom permission codes | Named platform/merchant roles | Role catalog Decision + seed |

### 6.2 Spec package conflicts (V4 internal / secondary)

| # | Topic | Conflict | Action |
|---|---|---|---|
| S1 | `customers` / `payment_links` tables | Required by product/`11`; absent from `00`/`03`/`13` catalogs | **DEC-003** |
| S2 | `master_settlement_types` | Concept in `00` §9; not in master table list §10 | **DEC-004** |
| S3 | Master Data extras | Downloads adds subscription_plan_types, phone_country_codes | **DEC-004** |
| S4 | Architecture auxiliaries | Downloads allows Redis/queues/object storage; New `00` silent | Safe design OK if PG remains SoR — **DEC-005** |
| S5 | API concreteness | New `04` groups only; older `05` has paths | Use older paths only after DEC-002 confirmation |

---

## 7. Unresolved requirements (do not guess)

See `docs/decisions/OPEN_ISSUES.md` for full list. Highest priority:

1. **DEC-001** Money storage: minor units vs major-unit NUMERIC scale
2. **DEC-002** Canonical API base path and versioning
3. **DEC-003** DDL for `customers` and `payment_links`
4. **DEC-004** Final Master Data table set
5. **DEC-005** Allowed auxiliaries (Redis/queue/object storage)
6. **DEC-006** Customer unique matching strategy
7. **DEC-007** Subscription renewal timing, invoice generation, failed-payment retries, ledger effects
8. **DEC-008** Fee schedules, reserves %, settlement cutoffs, rounding mode, FX
9. **DEC-009** Provider capability matrices (per provider, verified sources only)
10. **DEC-010** External KYB verification vendors
11. **DEC-011** PCI scope / hosted-fields boundary documentation
12. **DEC-012** Sandbox↔Live environment switching policy for merchants
13. **DEC-013** OAuth product scope (“OAuth-ready” vs full OAuth server)
14. **DEC-014** Data migration from existing MySQL demo/prod-like data (if any must be preserved)

Until decided, implementation may proceed only on **non-financial structural foundations** that do not encode unsettled business/financial/provider rules.

---

## 8. Risk register (analysis)

| Risk | Impact | Mitigation |
|---|---|---|
| Big-bang rewrite destroys working payment flows | High | Phase port of domain tests + keep sandbox path |
| Inventing fee/rounding/provider caps | Critical financial/legal | Block behind Decisions |
| Incomplete AuthZ leaves IDOR/cross-tenant holes | Critical | AuthZ tests every phase |
| Dual docs (V3 vs V4) confuse agents | Medium | Mark V3 docs historical; V4 plans authoritative |
| Incomplete webhook routes already in V3 | High | Fix in Providers phase with signature/replay tests |

---

## 9. What “Production-Oriented” means here

Not a prototype: each phase must deliver implementation + PostgreSQL migrations + AuthZ/tenant tests + financial invariant tests when money moves + API/UI/error tests + `docs/implementation/<operation>.md`. Critical failures block the next phase.

---

## 10. Analysis conclusion

**Proceed to phased implementation starting at Foundation (PostgreSQL + project structure + security/testing/docs skeleton), after Decision triage for DEC-001–DEC-005 at minimum.**  
No production code was written in this analysis phase.
