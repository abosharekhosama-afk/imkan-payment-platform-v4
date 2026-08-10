# V4 E2E Flows

## Specs

- Playwright: `apps/web/e2e/sandbox-journeys.spec.ts`
- Config: `apps/web/playwright.config.ts`
- Command: `npm run e2e:v4` (from repo root) or `npm run test:e2e -w apps/web`

## Intended journeys

1. Login → Dashboard (Sandbox banner)
2. Payment Config → Create Payment Link → Public Checkout → Sandbox `tok_ok` → SUCCEEDED
3. Customer → Product → Price → Subscription → Run renewals → Invoices
4. API Keys page loads

## Environment

- API: `VITE_API_URL` (default `http://localhost:3000`)
- Web: Playwright webServer on `5173`
- Credentials: `V4_E2E_EMAIL` / `V4_E2E_PASSWORD` (defaults `owner@example.com` / `Password123!`)

## Execution status (2026-08-09)

**Playwright Chromium download failed** in this environment (CDN/timeout to `chrome-for-testing`). Specs are present but browser E2E was **not executed** here.

### Compensating verification (executed)

| Proof | Suite | Result |
|---|---|---|
| Checkout → Router → Sandbox | `tests/phase4-payments.test.ts`, `tests/phase5-providers.test.ts` | PASS |
| Billing → Payment Core → Router → Sandbox | `tests/phase6-billing.test.ts` | PASS |
| V4 dashboard + security-events APIs | `tests/phase6_5-dashboard.test.ts` | PASS |
| No Legacy `/v1` in active UI | `tests/phase6_5-v4-legacy-guard.test.ts` | PASS |
| Frontend unit (API client) | `apps/web` vitest | 4/4 PASS |
| Frontend build + tsc | `apps/web` | PASS |

Re-run browser E2E after `npx playwright install chromium` succeeds on a network that can reach Playwright CDNs.
