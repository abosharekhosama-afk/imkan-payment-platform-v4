# P15.0 — PostgreSQL Row-Level Security (RLS) Assessment

**Product:** IMKAN Payments V4  
**Phase:** P15.0 security hardening  
**Date:** 2026-08-10  
**Status:** **BLOCKED / deferred by design** — RLS is **not** implemented in P15.0  
**Production Ready:** **NOT claimed**

**Related:** `TENANT_ISOLATION.md`, `TENANT_ISOLATION_MODEL.md`, `P15_0_SECURITY_AUDIT.md`

---

## 1. Is RLS required now?

**Recommendation: No — defer RLS until after connection-pooling tenant-context design (P15.4).**

| Question | Answer | Evidence |
|---|---|---|
| Is app-layer tenant isolation the current primary control? | Yes | `requireOrganizationContext()`, session/API-key `organizationId`, service `WHERE organization_id = $sessionOrg`; see `TENANT_ISOLATION_MODEL.md` |
| Does Postgres currently enforce RLS policies? | No | No `ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` in migrations; audit row “RLS \| Not present” |
| Would enabling RLS without pool-safe tenant context be safe? | No | Transaction-mode pooling (PgBouncer) drops session state; `SET LOCAL` without a disciplined session-variable design is fragile |
| Residual risk of deferring? | High if SQL bugs omit org filters | Mitigated today by parameterized queries + org-scoped services + cross-tenant tests; not defense-in-depth at DB |

**Primary control for P15.0:** application-layer isolation.  
**RLS role:** optional defense-in-depth, scheduled after P15.4 pool/tenant-context design — **not** a P15.0 deliverable.

---

## 2. Which tables would need RLS

Candidate tables are those carrying `organization_id` (or equivalent tenant FK) and merchant-sensitive data. Platform-shared rows (`organization_id IS NULL`) need explicit bypass policies for platform/system actors.

### 2.1 High priority (money / credentials / PII)

| Table group | Examples (migrations) | Why |
|---|---|---|
| Payments | `payment_links`, payment intents / attempts (Phase 4) | Cross-tenant money movement / IDOR |
| Providers | `provider_accounts`, `provider_credentials_metadata`, `provider_routes`, `provider_transactions` | Credential blast radius; shared sandbox uses `organization_id NULL` |
| API keys | `api_keys` | Auth material |
| Financial core | `refunds`, `ledger_accounts`, `ledger_journals`, `ledger_entries`, `settlements`, `settlement_lines`, `payouts`, `reconciliation_*`, `disputes`, `risk_signals` | Financial integrity |
| Banking / KYB | bank account ciphertext tables, company profiles, documents | Encrypted secrets + identity docs |
| Billing | customers, subscriptions, invoices (Phase 6) | Merchant customer data |

### 2.2 Medium priority

| Table group | Examples | Why |
|---|---|---|
| Webhooks | `provider_webhook_events` (nullable org) | Org resolution must remain DB-authoritative |
| Rate limit audit | `rate_limit_events` | Observability; lower confidentiality |
| Custom roles | `roles` where `organization_id IS NOT NULL` | Tenant RBAC customization |
| Books sync | `books_sync_state` | Integration state |

### 2.3 Typically excluded or special-cased

| Object | Rationale |
|---|---|
| Global catalogs (`providers`, `provider_capabilities`, system `roles` with `organization_id NULL`) | Shared reference data |
| Platform/system outbox / workers without org | Need `BYPASSRLS` or dedicated role |
| Migrations / admin DDL role | Superuser or owner — not application role |

---

## 3. Connection pooling impact

IMKAN API uses a shared Postgres pool. Production deployments commonly place **PgBouncer** (or equivalent) in **transaction pooling** mode.

| Mechanism | Behavior under transaction pooling | Risk |
|---|---|---|
| `SET LOCAL app.organization_id = '…'` | Bound to transaction; cleared at COMMIT/ROLLBACK | Safe **only if** every request sets it at transaction start |
| Session `SET` (non-LOCAL) | Leaks across clients on the same backend connection | **Cross-tenant contamination** — unacceptable |
| Relying on `current_setting` without `SET` | Policy sees empty/null → deny-all or accidental allow | Outages or leaks |
| `SET LOCAL` mid-request after pool checkout without wrapping | Easy to miss on read-only paths | Silent bypass of intended RLS |

**Implication:** RLS must not ship until:

1. A single DB access path always opens a transaction (or uses session pooling).
2. Tenant context is set atomically with the first statement (middleware / query wrapper).
3. Workers and platform admin paths use an explicit bypass role or a well-defined `app.is_platform = true` GUC.
4. Pool mode is documented and tested (transaction vs session).

Until that design lands in **P15.4**, enabling RLS would be operationally unsafe.

---

## 4. How tenant context would be passed (future design sketch)

**Not implemented in P15.0.** Target pattern for a later phase:

```
HTTP request
  → auth resolves organizationId (session or API key)
  → begin transaction
  → SET LOCAL app.current_organization_id = '<uuid>'
  → SET LOCAL app.actor_type = 'merchant' | 'platform' | 'system'
  → application SQL
  → COMMIT / ROLLBACK  (clears LOCAL settings)
```

Policy sketch (illustrative only):

```sql
-- NOT APPLIED IN P15.0
CREATE POLICY tenant_isolation ON payment_links
  FOR ALL
  USING (
    current_setting('app.actor_type', true) IN ('platform', 'system')
    OR organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );
```

**Passing rules:**

| Actor | Context source | Policy expectation |
|---|---|---|
| Merchant user / API key | `request.auth.organizationId` | Row `organization_id` must match |
| Platform admin (HTTP) | Session + platform permission | `actor_type=platform` bypass or scoped review filters |
| Background worker | System credential, no merchant session | `actor_type=system` / `BYPASSRLS` role |
| Public checkout | Token → PI → org from DB | Org derived server-side; still set GUC from resolved org |

Client-supplied `organization_id` / `X-Tenant-ID` must never set the GUC.

---

## 5. Workers / platform admin impact

| Path | Today (app-layer) | With RLS (future) |
|---|---|---|
| Merchant HTTP | Org from session/API key | Same + `SET LOCAL` |
| Platform KYB/bank review | Intentional cross-org under `platform.*` / review perms | Needs bypass or per-row allowlist; misconfiguration → outage or over-exposure |
| Billing renewals worker | System actor may process all tenants | Must use system role; merchant HTTP already scoped (`TENANT_ISOLATION.md`) |
| Webhook ingress | Org resolved from PaymentIntent DB row (P15.0 fix) | GUC set after org resolution; never from webhook payload alone |
| Shared sandbox provider account | `organization_id NULL` | Dedicated policy for NULL platform rows |

**Risk if RLS is rushed:** platform and worker jobs fail closed (deny-all) or, worse, policies are widened to “fix” workers and erase the benefit.

---

## 6. Migration + rollback strategy (when P15.4+ proceeds)

### 6.1 Phased enablement (recommended)

1. **Inventory** — list all tenant tables; classify platform-null rows.  
2. **App role split** — migrate API/worker connections from table owner to non-superuser roles (`imkan_app`, `imkan_worker`).  
3. **FORCE ROW LEVEL SECURITY** only after policies exist for the app role.  
4. **Shadow / dual-run** — enable RLS in staging; compare app-layer denials vs DB denials; run cross-tenant suites.  
5. **Canary** — one schema subset (e.g. `api_keys`, `payment_links`) before financial tables.  
6. **Full rollout** — remaining tenant tables + monitoring for `42501` / unexpected empty sets.

### 6.2 Rollback

| Step | Action |
|---|---|
| Immediate | `ALTER TABLE … DISABLE ROW LEVEL SECURITY` (or drop policies) on affected tables |
| Connection | Keep app-layer filters — they remain the primary control during rollback |
| Role | Optionally reconnect as previous role if `FORCE RLS` caused owner issues |
| Evidence | Capture failing SQL + `current_setting` values before disabling |

Rollback does **not** remove the need for app-layer org filters.

---

## 7. Residual risk while deferred

| Residual risk | Severity | Compensating control today |
|---|---|---|
| SQL bug omits `organization_id` filter | High | Code review, parameterized queries, cross-tenant tests (`phase6_6`, `p15-0-security`, Playwright role-matrix) |
| Compromised DB role reads all rows | High | Network isolation, least-privilege DB users (ops), no merchant direct DB access |
| Platform path misuse | Medium | RBAC + step-up + audit; Platform Admin UI still **NOT IMPLEMENTED** |
| Pool mis-set GUC if RLS added prematurely | Critical (hypothetical) | **Do not enable RLS until P15.4 design** |

---

## 8. Conclusion

| Decision | Detail |
|---|---|
| P15.0 implementation | **NOT IMPLEMENTED** — RLS deliberately skipped |
| Status label | **BLOCKED (deferred by design)** pending P15.4 connection-pooling tenant-context |
| Primary isolation | App-layer session/API-key org scope |
| Do not claim | Production Ready DB defense-in-depth via RLS |

**Clear statement:** IMKAN Payments V4 P15.0 documents RLS as a future defense-in-depth control. It is **not** being implemented in this phase; deferral is intentional to avoid unsafe `SET LOCAL` / PgBouncer interaction. Residual cross-tenant risk from SQL mistakes remains and is accepted only with continued app-layer hardening and tests — **not** as a Production Ready posture.
