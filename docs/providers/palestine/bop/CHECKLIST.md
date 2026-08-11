# Bank of Palestine Gateway — Activation Checklist

**Code:** `bop`  
**Lifecycle:** **DISCOVERED** (2026-08-11)  
**Copy of:** [PROVIDER_CHECKLIST.md](../PROVIDER_CHECKLIST.md)  
**Research:** [../palestine/RESEARCH.md](../RESEARCH.md)

## Lifecycle

| Stage | Status | Evidence |
|---|---|---|
| DISCOVERED | Done | Public product page + research |
| CONTRACTED | Pending | Outreach kit ready — await commercial reply |
| SANDBOX_CONFIGURED | Blocked | Need private API docs + credentials |
| SANDBOX_TESTED | Blocked | |
| CERTIFIED | Blocked | |
| LIVE_READY | Blocked | DEC-009 |
| LIVE_ENABLED | Blocked | `supports_live` must stay FALSE |

## Checklist (fill after docs)

### 1. Access & authentication
- [ ] API authentication documented
- [ ] Sandbox credentials via SecretResolver
- [ ] Live credentials separate plane
- [ ] Rotation procedure documented

### 2. Webhooks
- [ ] Sandbox ≠ live webhook URLs
- [ ] Signature verification + tests
- [ ] Replay protection
- [ ] Event mapping table

### 3. Core capabilities
- [ ] Idempotency — UNKNOWN
- [ ] Refund full — UNKNOWN
- [ ] Partial refund — UNKNOWN
- [ ] Recurring — UNKNOWN
- [ ] Tokenization / HPP — UNKNOWN (marketing: 3DS cards)
- [ ] Payout — UNKNOWN
- [ ] Dispute — UNKNOWN
- [ ] Settlement — UNKNOWN (marketing: T+1 to BOP account)

### 4–6. Behavior / security / evidence
- [ ] See master checklist when coding starts ([NEXT_ADAPTER_PLAN.md](../NEXT_ADAPTER_PLAN.md))
