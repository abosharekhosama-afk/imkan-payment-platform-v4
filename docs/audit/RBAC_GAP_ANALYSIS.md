# RBAC GAP ANALYSIS — Refresh (post Phase 6.6 hardening)

**Date:** 2026-08-10  
**Prior report:** `docs/audit/RBAC_FINAL_REPORT.md`

## PASS (retained)

- Permission catalog + role matrix (migrations 021–023)
- Central AuthZ (`authz.ts`): session/API key, org context, permissions, step-up
- Custom roles with escalation prevention + OWNER assign guard
- Tenant isolation on renewals (F-01)
- Frontend `RequirePermission` + permission-aware nav
- Sensitive operations registry
- API key create/revoke step-up
- Invoice collect + renewals step-up (hardening)

## PARTIAL / remaining for P2

| Item | Action |
|---|---|
| F-04 `*.manage` OR-gates | Keep as documented BC; prefer granular for new routes |
| Full Playwright merchant+platform matrix | Expand `apps/web/e2e/role-matrix.spec.ts` evidence |
| Form editability without manage | fieldset disabled pattern on remaining screens |
| Audit coverage | Ensure all sensitive mutations write audit events |
| Platform Admin UI | Separate from merchant RBAC (P3/P11) |

## NOT a Phase 6.6 failure

Deferred modules without APIs (refunds, ledger, payouts…) correctly have permission codes only.

## Target for P2 exit

`RBAC_FINAL_REPORT.md` Final Status = **PASS** (not Production Ready), or explicit **BLOCKED BY** for any residual.
