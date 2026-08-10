# PROVIDER GAP ANALYSIS

**Date:** 2026-08-10

## Present

| Component | Path | State |
|---|---|---|
| Adapter contract | `apps/api/src/providers/adapter.ts` | Present |
| Provider Router | `apps/api/src/providers/router.ts` | Present |
| Sandbox adapter | `apps/api/src/providers/sandbox-adapter.ts` | Present (`supports_live=false`) |
| Registry | `apps/api/src/providers/registry.ts` | Sandbox only |
| Webhook ingress | `apps/api/src/providers/webhook-service.ts` | Verify, replay, dedupe, outbox |
| Credential encryption metadata | Phase 5 migrations | Partial |

## Gaps

| Gap | Severity | Phase |
|---|---|---|
| No live adapter registered (Stripe/PayTabs/MyFatoorah) | Critical | P5 / **BLOCKED BY: DEC-009** until matrix approved |
| Capability matrix not driving UI actions | High | P5 |
| Webhook does not apply PI/invoice state (BG-W1) | Critical | P4 |
| Live credential vault + rotate UX incomplete | High | P5 |
| Sandbox refund unsupported | Expected until P6 | P6 |
| Merchant Providers console: connect/test/enable live | Partial read-only | P5 |

## Rules

- Payment Domain must not contain provider-specific logic
- SANDBOX and LIVE must never share credentials, ledger, or webhooks
- Do not claim live provider readiness without lifecycle evidence
