# Tenant Isolation Audit — IMKAN Payments V4

**Date:** 2026-08-09  
**Phase:** 6.6 Audit  
**Authority:** Current code + DB + API tests  

---

## 1. Isolation model (current)

```text
Authenticated Session / API Key
        ↓
organization_id bound in auth context (NOT from client body for business ops)
        ↓
requireOrganizationContext() on merchant routes
        ↓
Services query WHERE organization_id = auth.organizationId
        ↓
Missing resource → typically 404 (no cross-tenant leak of payload)
```

**Rejected:** `X-Tenant-ID` header (`authz.ts` → `TENANT_HEADER_FORBIDDEN`).

**Login:** optional `organization_id` in body is validated against membership before session issuance — acceptable.

---

## 2. Resource family status

| Resource | Org scoped list/get | Mutate scoped | Cross-tenant test | Notes |
|---|---|---|---|---|
| Payments / intents | Yes | Yes | phase4 | |
| Payment links | Yes | Yes | phase4 | |
| Payment config | Yes | Yes | phase4 | |
| Customers | Yes | Yes | phase6 | |
| Products / prices | Yes | Yes | phase6 | |
| Subscriptions | Yes | Yes | phase6 | |
| Invoices | Yes | Yes | phase6 | |
| API keys | Yes | Yes | phase5 | |
| Provider webhooks (read) | Yes | n/a | phase5 | |
| Merchant profile / KYB / docs / bank | Yes | Yes | phase3 | |
| Audit / security events | Org filter | n/a | partial | |
| Checkout (public token) | Token-scoped | Token-scoped | by design | Not session-tenant |
| Inbound webhooks | Provider signature | n/a | by design | Public ingress |
| Platform KYB/bank review | By id (no merchant org) | Permission-gated | intentional | Platform scope |
| **Renewals run** | **NO org filter in worker** | Global process | **MISSING / FAIL** | See finding T-01 |

---

## 3. organization_id trust boundaries

| Source | Trusted? | Usage |
|---|---|---|
| `sessions.organization_id` | **Yes** | Primary for session auth |
| API key `organization_id` | **Yes** | Primary for key auth |
| Path `:organizationId` | Conditional | Must match session org unless platform admin/support |
| Body `organization_id` on business create | Should ignore / not override session | Most creates use session org only — verify per route in impl |
| Query `organization_id` | Not used as sole trust | — |
| `X-Tenant-ID` | **Forbidden** | Hard fail |

---

## 4. Finding T-01 — CRITICAL — Cross-tenant renewal side effects

**Evidence:**
- Route: `POST /api/v1/billing/renewals/run` (`phase6-routes.ts`)  
  Requires `billing.manage` + org context, but handler calls:
- `renewalService.processDueSubscriptions(limit)` (`renewal-service.ts` ~170–184)  
  SQL selects due subscriptions **across all organizations** (no `organization_id` predicate).

**Impact:** Merchant A (finance/owner with `billing.manage`) can trigger invoice collection / subscription state transitions for Merchant B.

**Required fix (Phase 6.6):**
1. Add `organizationId?: string` filter to `processDueSubscriptions`.  
2. Merchant route **must** pass `request.auth.organizationId`.  
3. Global run only for `platform.admin` (or dedicated platform permission) without merchant context, or separate admin endpoint.  
4. Add API test: Org A run must not touch Org B subscriptions.

**Classification:** **INSECURE** — must fix in implementation.

---

## 5. Finding T-02 — MEDIUM — Platform by-id access

Platform reviewers access KYB/bank/documents by UUID without org filter.  
**Acceptable** if strictly gated by `kyb.review` / `bank.review` / `platform.admin` and audit-logged.  
**Verify** no merchant permission can hit these admin routes.

---

## 6. Finding T-03 — LOW — Frontend deep links

Authenticated user without `api_keys.read` can open `/developers/api-keys`; API returns 403.  
No data leak if backend correct; UX gap only. Route guards should deny earlier.

---

## 7. Finding T-04 — INFO — Public checkout

Checkout uses payment-link token, not session org. Correct for hosted checkout. Ensure tokens are unguessable and rate-limited (existing).

---

## 8. Database isolation notes

- Partial unique indexes on `user_roles` separate platform vs merchant assignments.  
- Scope trigger prevents merchant role without org and platform role with org.  
- No Row-Level Security (RLS) policies observed — isolation is **application-layer**. Acceptable for current monolith if services are consistent; Phase 6.6 should not invent RLS unless approved.

---

## 9. Required verification suite (Phase 6.6)

For each resource family:

```text
Actor Org A → GET/POST resource of Org B → 403 or 404 (no payload leak)
Unauthenticated → 401
Authenticated missing permission → 403
```

Plus renewals-specific isolation test (T-01).

---

## 10. Tenant isolation status (pre-fix)

| Dimension | Status |
|---|---|
| Session-bound org | **PASS** |
| Header tenant spoof | **PASS** (rejected) |
| Merchant resource queries | **PASS** (dominant) |
| Renewals merchant trigger | **FAIL** |
| Platform admin cross-org | **BY DESIGN** (permission-gated) |
| UI-only isolation | **N/A** (not trusted) |

**Overall pre-fix:** **PARTIAL**

---

*End of tenant isolation audit.*
