# PRODUCTION ROADMAP — IMKAN Payments V4

**Date:** 2026-08-10  
**Rule:** Do not start a phase whose critical dependency is OPEN/BLOCKED.  
**Never claim Production Ready until P14 gate passes.**

---

## P0 — Audit + architecture + blockers

**Status:** COMPLETE (this audit pack)  
**Deliverables:** `docs/audit/*`, this roadmap  
**Exit:** Gaps known; no silent Phase 7/Live/Books starts

---

## P1 — Authentication + Organization + Merchant Onboarding

**Depends on:** P0  
**Work:** Guided onboarding wizard; signup country; post-login routing to incomplete KYB  
**Exit:** Sign Up → Verify → Login → Onboarding → Dashboard when complete

---

## P2 — RBAC + Tenant Isolation + Security

**Depends on:** P0 (builds on Phase 6.6)  
**Work:** Close PARTIALs; role-matrix E2E; RBAC_FINAL_REPORT = PASS  
**Exit:** Phase 6.6 PASS (not Production Ready)

---

## P3 — V4 Console + Dashboard + Customers + Payment Links

**Depends on:** P1–P2  
**Work:** Real dashboard aggregates; customer drawer; org sections; i18n; no fake finance widgets  
**Exit:** Sandbox merchant console complete for existing APIs

---

## P4 — Payments + Checkout + Webhooks state apply

**Depends on:** P3  
**Work:** BG-W1 webhook→PI apply; payment timeline; checkout polish; BG-T1 optional  
**Exit:** Sandbox lifecycle evidence with webhook-driven state

---

## P5 — Provider Architecture + First Live Provider

**Depends on:** P4, **DEC-009**  
**Work:** Capability matrix; Providers UI; credentials; first live adapter  
**If DEC-009 OPEN:** implement matrix + sandbox hardening; document **BLOCKED BY: DEC-009** for live activation

---

## P6 — Refunds + Billing + Subscriptions alignment

**Depends on:** P4 (P7 preferred for ledger posting)  
**Work:** Refunds API/UI; Books mapping fields; BG-E1 policy  
**Exit:** Full/partial refund in sandbox with audit + idempotency

---

## P7 — Financial Core (Ledger + Balances)

**Depends on:** P6 payment/refund events (fee rates **DEC-008** gated)  
**Work:** Double-entry ledger migrations + posting + balances API  
**Exit:** Ledger integrity tests; balances from ledger only

---

## P8 — Settlement + Payout + Reconciliation

**Depends on:** P7; fee math **DEC-008** for complete net settlement  
**Work:** Settlement records, payouts, discrepancy engine  
**Exit:** Auditable settlement→payout path (sandbox/manual bank first)

---

## P9 — Risk + Disputes

**Depends on:** P4–P6  
**Work:** Risk foundation + disputes lifecycle + UI  
**Exit:** Permission-gated risk/dispute screens with APIs

---

## P10 — Books Integration

**Depends on:** P4 events; **DEC-016** for production connector  
**Work:** Books APIs, sync tables, worker, internal connector stand-in  
**Exit:** Invoice→Payment Link→Pay→Event path; or **BLOCKED BY: DEC-016** for Zoho cutover

---

## P11 — Production Infrastructure

**Depends on:** P0+  
**Work:** Email (DEC-017), secrets, object storage, backups, metrics, alerts  
**Exit:** Runbooks + health/readiness + restore drill docs

---

## P12 — Security Audit + PCI Scope

**Depends on:** P2, P5, **DEC-011**  
**Work:** Threat review, IDOR re-test, optional RLS, PCI doc  
**Exit:** Security pack signed; PCI scope decided

---

## P13 — Full E2E + Load + Failure + Security Tests

**Depends on:** P1–P10 surfaces that exist  
**Work:** Full role matrices; cross-tenant; webhook replay; financial invariants  
**Exit:** Evidence suites green for implemented modules

---

## P14 — Production Gate

**Depends on:** All critical product/financial/provider/security/ops/integration gates  
**Exit:** Pass/fail checklist with evidence — only then may Production Ready be considered

---

## Bucket mapping (spec §2)

| Bucket | Roadmap phases |
|---|---|
| P0 Production blockers | P0 + PRODUCTION_BLOCKERS.md |
| P1 Product functionality | P1, P3, P4, P6 |
| P2 Financial Core | P7, P8 |
| P3 Providers | P5 |
| P4 Risk/Disputes | P9 |
| P5 Books | P10 |
| P6 Security/Operations | P2, P11, P12 |
| P7 Go-Live | P13, P14 |
