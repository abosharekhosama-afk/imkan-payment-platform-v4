# V4 — Implementation Readiness

**Date:** 2026-08-09  
**Question:** can Phase 4 (Payments) and the remaining V4 phases start on the current baseline?

## Verdict: **READY WITH FIXES**

The V4 foundation (Phases 1–3 on PostgreSQL 16, `/api/v1`) is complete, tested (43/43 PG, 64/64 normal) and passed a final source-level audit (2026-08-09). Nothing in the V4 codebase blocks starting Phase 4. The "fixes" are: a small set of **decisions** that must be approved before specific milestones inside the next phases, a few **hygiene items**, and an explicit **legacy-freeze policy** — none requires reworking completed phases.

## What prevents unqualified READY

1. Open decisions gate specific milestones (below).
2. The `/api/v1` surface lacks rate limiting and API-key auth — mandatory (`00` §17, `04`) before any payment endpoint is exposed, and API-key auth is the developer-surface prerequisite for server-to-server payments.
3. The production UI depends entirely on legacy `/v1`; without a per-phase UI plan on `/api/v1`, V4 features fail the spec's Definition of Done (UI is part of DoD, `11` §R).

## Fix-first list (prioritized)

### P0 — approve before the affected milestone starts
| Item | Why | Gate |
|---|---|---|
| **Legacy-freeze policy**: declare V3 `/v1` + MySQL feature-frozen (bug-fix only), no new features on legacy; document that legacy sandbox console remains for demo only until V4 UI replaces it | Prevents dual-track drift; DEC-002 already forbids treating `/v1` as the V4 contract | Before Phase 4 coding starts |
| **DEC-006** (customer unique-matching strategy) | Blocks `customers` upsert rules in the Payments phase | Before Customers implementation (early Phase 4) |
| **DEC-016** (Books target: Zoho vs internal) | Determines connector to build | Before Books phase (late; decide any time earlier) |

### P1 — must land inside Phase 4/5 before exposure
| Item | Why |
|---|---|
| Rate limiting on `/api/v1` (per-key/per-IP, sensitive-endpoint tiers) | Spec `00` §17; currently only legacy has it |
| API keys + scopes on `/api/v1` | Required for developer surface and payment APIs |
| Inbound webhook subsystem design (signature verify, replay protection, `webhook_events`/`webhook_deliveries` on PG) | Spec `00` §15; nothing exists on V4 side |
| **DEC-008** (fees/reserves/rounding/FX) approval | Blocks Financial Core phase; fee **labels** exist, rules don't |
| **DEC-009** (per-provider capability verification) | Blocks activating any live provider |
| **DEC-007** (subscription renewal financial behavior) | Blocks Billing phase renewals |

### P2 — hygiene (do during Phase 4, low risk)
| Item | Why |
|---|---|
| Fix or explicitly retire dead legacy wiring: PayTabs callback route unregistered + `signature_valid` hardcoded `true`; Zoho routes unregistered; `/pay/:token` has no pay handler | Traps if anyone wires them; harmless while frozen — document in freeze note |
| Legacy `001_core.sql` markdown fences (clean-MySQL replay would fail; 002 duplicates content) | Only matters if a fresh legacy environment is ever provisioned |
| `packages/contracts` unused | Adopt as the event-contract package for Books/webhooks in Phase 4+, or retire |
| Web console dispute-create payload bug | Only if legacy console stays user-facing during transition |
| DEC-017 email vendor decision | Needed for receipts/notifications by end of Payments phase |

### P3 — minor
| Item |
|---|
| Legacy risk service uses `Number()` on amounts for thresholds (not money storage) — note for the V4 risk port |
| `VITE_REQUIRE_LOGIN` documented but unread in web app |
| Root legacy planning docs (`IMPLEMENTATION_PLAN.md`, `PROJECT_GAP_ANALYSIS.md`) outdated by Phases 1–3 — mark superseded |

## What can be developed immediately (no blockers)

- Payment domain schema wave on PG (intents, sessions, attempts, payments, methods, refunds — DEC-001/002/003 all resolved).
- Payment Links + hosted checkout + branding storage (spec `11` §E–G).
- Provider architecture skeleton: `PaymentProviderAdapter` interface, router, 6 provider tables, sandbox adapter as the first **registered** adapter (sandbox is a legitimate permanent test-mode adapter — clearly separated per `00` §14).
- Idempotency/outbox/audit reuse — already built and tested.
- API keys + rate limiting (P1 items are themselves immediately startable).
- V4 merchant portal foundation targeting `/api/v1` (login/org/KYB screens already have APIs).

## Dependencies map

```
DEC-006 ──► Customers ──► Payment Links/Checkout (customer attach)
Payments schema ──► Provider router ──► DEC-009 ──► any LIVE provider   ❌ external agreements
Payments ──► Billing (DEC-007) ──► Financial Core (DEC-008) ──► Settlement/Payout rails ❌ bank/provider
Outbox (done) ──► Books worker ──► DEC-016 ──► Books connector (Zoho creds ❌ external)
API keys + rate limiting ──► exposing payment APIs
DEC-011 (PCI scope) + hosted/tokenized capture ──► production card acceptance
DEC-017 ──► production email
```

`❌` = external dependency (cannot be closed by code alone).

## Blockers that are NOT code (external)

Provider/acquiring agreements per market (incl. Palestine routing), provider sandbox credentials, KYB vendor selection (DEC-010), Zoho (or internal Books) credentials, PCI assessment, production secrets management/WAF/backup infrastructure.

## Recommended implementation order

Follow `V4-IMPLEMENTATION-SEQUENCE.md` (spec §2 order): **Phase 4 Payments → Phase 5 Providers → Phase 6 Billing → Phase 7 Financial Core → Phase 8 Risk/Disputes → Phase 9 Books → Phase 10 Security/Production**, with UI + tests + docs inside each phase's Definition of Done. Do not start a live-provider integration before the router/adapter layer and DEC-009 evidence exist.
