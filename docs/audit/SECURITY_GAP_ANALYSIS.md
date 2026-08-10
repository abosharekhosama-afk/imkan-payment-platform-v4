# SECURITY GAP ANALYSIS — IMKAN Payments V4

**Date:** 2026-08-10  
**Production Ready claim:** NOT MADE

## Present controls

| Control | State | Evidence |
|---|---|---|
| Password hashing (scrypt) | Present | `foundation/crypto.ts` |
| Sessions + MFA + step-up | Present | Phase 2 identity |
| RBAC + custom roles + escalation guards | Present | Phase 6.6 |
| Tenant isolation (app-layer) | Present | `requireOrganizationContext`, service `organization_id` filters |
| Reject `X-Tenant-ID` | Present | `authz.ts` |
| Idempotency keys | Present | financial/create routes |
| Webhook signature verify + nonce/dedupe | Present | `webhook-service.ts` |
| API key hashing | Present | `api-keys.ts` |
| Bank account encryption | Present | Phase 3 banking |
| Audit / security events | Partial | sensitive ops covered; not every mutation |
| Rate limiting | Present (in-memory) | multi-instance = DEC-005 |
| CORS / structured errors | Present | apiV1 error handler |

## Gaps

| Gap | Severity | Target |
|---|---|---|
| Postgres RLS not implemented | Medium | P12 defense-in-depth |
| Real email transport (DEC-017) | High | P11 |
| PCI scope document (DEC-011) | Critical for live cards | P12 |
| Live provider credentials vault UX | High | P5 / DEC-009 |
| Distributed rate limiting | Medium | P11 |
| Outbound webhook endpoint secrets | Missing | P4–P11 |
| Platform admin UI audit trails for cross-tenant ops | Medium | P11 |
| Pen test / formal threat model pack | High | P12 |
| Backup/restore verified drills | Critical for go-live | P11 |
| Secret manager / KMS in production | High | P11 |
| KYB document object storage | High | P11 |

## Logging / secrets

Never log: passwords, API secrets, provider credentials, PAN/CVV, MFA secrets, bearer tokens.  
Current redaction: webhook bodies truncated; bank fields encrypted. Continue enforcing in new modules.
