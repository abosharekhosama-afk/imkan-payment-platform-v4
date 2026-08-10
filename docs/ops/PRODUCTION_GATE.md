# P14 — Production Gate (Evidence)

**Date:** 2026-08-10  
**Overall:** **NOT PASSED**  
**Forbidden label until all PASS:** Production Ready  

**P15.2 note:** Infrastructure/security baseline improved (Redis RL architecture, secrets layer, HttpOnly cookies, monitoring baseline, backup drill). This does **not** make the gate PASS.

| Requirement | Evidence | Test | Result | Date | Status |
|---|---|---|---|---|---|
| Signup | `/signup` + register API | phase2 / test:pg | Works | 2026-08-10 | PASS |
| Onboarding | Wizard + Gate | manual/code | Skip allowed | 2026-08-10 | PARTIAL |
| Organization | merchant/org pages | phase3 | Present | 2026-08-10 | PARTIAL |
| Dashboard | real aggregates | phase6_5 | No fake ledger | 2026-08-10 | PARTIAL |
| Payments | list/detail | phase4 | Sandbox only | 2026-08-10 | PASS |
| Payment Links | CRUD + external_invoice_ref | phase4 | Sandbox | 2026-08-10 | PARTIAL |
| Customers | drawer + external ids | phase6 | History incomplete | 2026-08-10 | PARTIAL |
| Refunds | conformance suite | refund-conformance | Sandbox | 2026-08-10 | PASS |
| Billing | subscriptions/invoices | phase6 | Sandbox | 2026-08-10 | PARTIAL |
| Reports | | | | | NOT IMPLEMENTED |
| Settings | org/appearance | | | | PARTIAL |
| RBAC | phase6_6 + e2e matrix file | test:pg | | 2026-08-10 | PASS |
| API authorization | requirePermission | phase6_6 | | 2026-08-10 | PASS |
| Tenant isolation | cross-tenant refund/renewals | test:pg | | 2026-08-10 | PASS |
| Custom roles | escalation guards | phase6_6 | | 2026-08-10 | PASS |
| First live provider | | | DEC-009 | | **BLOCKED** |
| Webhooks | signature + state apply + ledger | phase5 + code | Sandbox | 2026-08-10 | PARTIAL |
| Credential security | hashing + secret_ref metadata + resolver | P15.2 | KMS vendor not wired | 2026-08-10 | PARTIAL |
| Ledger | balanced journals + unique source | refund + P15.1-B | | 2026-08-10 | PASS |
| Balances | Financial Core SoT (`GET /balances`) | P15.1-C | | 2026-08-10 | PASS |
| Settlement | draft → finalize → cancel; fee ledger on finalize | P15.1-D | Internal lifecycle PASS; no provider settlement file | 2026-08-10 | PARTIAL |
| Payout | create → submit → mark-paid/fail/cancel + ledger | P15.1-E | **Sandbox API only — not a live bank rail** | 2026-08-10 | PARTIAL |
| Reconciliation | count mismatch | phase7 | thin — P15.1-F not started | 2026-08-10 | PARTIAL |
| Books connector | internal only | | DEC-016 | | **BLOCKED** |
| Authentication MFA | | | | | PASS |
| Step-up | refunds/api keys/settlement/payout | | | | PASS |
| Session cookies | HttpOnly + Secure + CSRF (P15.2) | p15-2-session-cookies | Prod path cookie; Bearer kept for API | 2026-08-10 | PARTIAL |
| Secrets/Encryption | env AES-GCM + SecretResolver (env/file/kms stub) | p15-2-secrets | KMS SDK not connected | 2026-08-10 | PARTIAL |
| Distributed rate limiting | RedisRateLimitStore + bootstrap | p15-2-redis-rate-limit | Architecture PASS; deploy Redis in prod | 2026-08-10 | PARTIAL |
| PCI scope | | | DEC-011 | | **BLOCKED** |
| Security testing | suite + P15.2 regression | test:pg | pen-test missing | 2026-08-10 | PARTIAL |
| Monitoring/Alerts | `/health/ready` + `/metrics` + alert rules | p15-2-health-metrics | Baseline only | 2026-08-10 | PARTIAL |
| Backup/Restore | scripts + embedded drill evidence | ops:pg-backup-drill | Local drill PASS; offsite/WAL open | 2026-08-10 | PARTIAL |
| Unit/API/Integration | test:pg | | 2026-08-10 | PASS |
| E2E | role-matrix present | not re-executed here | | PARTIAL |
| Load | | | | | NOT IMPLEMENTED |
| Financial invariants | refund + P15.1 model/ledger | | | 2026-08-10 | PASS |
| Live payout / settlement rail | | | mark-paid ≠ bank transfer | | **BLOCKED** |

## Explicit blockers (unchanged by P15.2 completion)

1. **Live Provider = BLOCKED** (DEC-009; registry = sandbox only)
2. **PCI = BLOCKED** (DEC-011)
3. **Live payout = BLOCKED** (sandbox mark-paid is not money movement)
4. **Production Gate = NOT PASSED**

## Audit follow-up history

### 2026-08-10 (pre-P15.1)

Independent code audit confirmed remaining gaps; sync checkout ledger and minor UI fixes applied.

### 2026-08-10 (P15.1-A→E)

Financial Core sandbox path completed: model, ledger hardening, balances, settlement lifecycle, payout sandbox lifecycle. Gate rows for Settlement/Payout/Balances/Ledger updated above — still PARTIAL where live rails missing.

### 2026-08-10 (P15.2)

Production Security & Infrastructure Gate implemented. See `docs/implementation/P15_2_PRODUCTION_SECURITY_INFRASTRUCTURE.md` and `P15_2_FINAL_AUDIT.md`.
