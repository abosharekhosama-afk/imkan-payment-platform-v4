# P13 — Testing Program

**Status:** PARTIAL  
**Production Ready:** NOT claimed

## Suites

| Layer | Command / location | Notes |
|---|---|---|
| Unit / API / PG | `npm run test:pg` | Foundation + phase suites |
| E2E | Playwright `e2e/` + `scripts/e2e-v4-stack.mjs` | Restart stack before runs |
| Role matrix | `e2e/role-matrix.spec.ts` | Merchant roles |
| Financial invariants | P7+ | Double-entry, idempotency, replay |
| Security | P12 | AuthZ bypass, IDOR, webhook forgery |
| Load | NOT IMPLEMENTED | Required before gate |

## Rule

Do not use mock payment success or fake balances to force green tests for missing financial modules.
