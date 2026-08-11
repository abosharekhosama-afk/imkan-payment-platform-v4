# P16 — Production Activation (Non-PayTabs)

**Date:** 2026-08-11  
**Scope:** Close sandbox/mock/stub behavior for production **except PayTabs** (P15.x track unchanged)  
**Production Gate:** **NOT PASSED** (P16 in progress)  
**Verdict:** **IN PROGRESS** — P16.0/1/3 done; P16.2/4/5/6/8/10 remain (PayTabs excluded)

---

## 1. Goal

Finish production readiness for all platform surfaces that are still sandbox, stub, or mock — **without** activating PayTabs LIVE or blocking on PayTabs sandbox certification.

PayTabs remains:

- P15.5 real sandbox cert (credentials blocked)
- P15.6+ LIVE (explicit approval)

---

## 2. What P16 includes vs excludes

| In P16 | Out of P16 (PayTabs track) |
|---|---|
| Email delivery (DEC-017) | PayTabs adapter HTTP/LIVE |
| Production UX (no tok_ok in prod) | PayTabs sandbox credentials |
| KMS / Redis / cookies prod | PayTabs CERTIFIED / LIVE_ENABLED |
| KYB object storage + admin UI | PayTabs webhook from PayTabs servers |
| Document storage adapter | |
| Merchant webhooks V4 delivery | |
| Live payout rail (not mark-paid) | |
| Settlement import | |
| Deep reconciliation (P15.1-F) | |
| Internal Sandbox adapter **kept for tests** | |

---

## 3. Work packages (ordered)

| ID | Package | Status |
|---|---|---|
| **P16.0** | Runtime config API + sandbox token guard + UI labels | **DONE** |
| **P16.1** | Email transport (SMTP) + outbox worker + public auth pages | **DONE** |
| **P16.2** | Session cookie-only prod + KMS wiring | PARTIAL (P15.2) |
| **P16.3** | Onboarding prod: object storage, KYB admin UI, notifications | **DONE** |
| **P16.4** | DEC-012 sandbox/live merchant policy + refund env alignment | **STARTED** (refund env) |
| **P16.5** | Checkout production UX (hosted fields shell, success/cancel redirect) | **STARTED** (redirect) |
| **P16.6** | Billing: real PM tokens, dunning email, no tok_ok default | **STARTED** (API + UI guard) |
| **P16.7** | Finance: settlement import, live payout rail, deep recon | NOT STARTED |
| **P16.8** | Merchant webhooks V4 outbox delivery | NOT STARTED |
| **P16.9** | Books connector (DEC-016) | BLOCKED |
| **P16.10** | Ops gate: pen test, offsite backup, E2E, gate doc refresh | NOT STARTED |

---

## 4. P16.0 — Implemented

### API

- `GET /api/v1/platform/runtime` — public runtime flags (no secrets)
- `apps/api/src/platform/runtime-config.ts`
- `apps/api/src/platform/sandbox-token-guard.ts`
- Checkout + billing reject `tok_*` when production disallows sandbox tokens

### Web

- `usePlatformRuntime()` hook
- AppShell rail label from runtime
- Checkout hides sandbox token picker in production mode

### Env

```bash
NODE_ENV=production
PAYMENT_PROVIDER=sandbox   # or none / external provider when registered
ALLOW_SANDBOX_TOKENS_IN_PRODUCTION=false   # staging exception: true
```

### Tests

- `tests/p16-runtime-config.test.ts`

---

## 4b. P16.1 — Email (DONE)

- `email-transport.ts` — vendor-neutral SMTP (stub in dev)
- `email-outbox-handlers.ts` — verify, reset, invite, KYB notifications
- Production boot requires `SMTP_HOST`, `EMAIL_FROM`, `APP_PUBLIC_URL`
- Public pages: `/verify-email`, `/forgot-password`, `/resend-verification`, `/reset-password`, `/accept-invitation`
- Env: `EMAIL_TRANSPORT`, `EMAIL_FROM_NAME`, `SMTP_*`, `PLATFORM_KYB_NOTIFY_EMAIL`
- Tests: `tests/p16-email-transport.test.ts` (7 tests)

---

## 4c. P16.5 — Checkout redirect (STARTED)

- Terminal payment → redirect to `success_url` / `cancel_url`
- `/checkout/return` landing page

---

## 4d. P16.6 — Billing guards (STARTED)

- API guards on customer/subscription create
- UI hides sandbox token fields when production blocks them

---

## 4f. P16.3 — KYB documents + admin review (DONE)

- `document-storage.ts` — local filesystem + optional S3
- Upload flow: `POST /merchant/documents/upload-intent` → `PUT .../content`
- Admin: `/platform/kyb` UI + enriched case detail + document preview
- KYB emails: submitted / needs_information / decided
- Env: `DOCUMENT_STORAGE_BACKEND`, `DOCUMENT_STORAGE_PATH`, `S3_*`, `PLATFORM_KYB_NOTIFY_EMAIL`
- Tests: `tests/p16-document-storage.test.ts`

---

## 5. What stays sandbox permanently

| Component | Reason |
|---|---|
| Internal Sandbox adapter | CI/regression (`tok_ok`) |
| PayTabs simulate mode | P15 tests |
| Dev tokens / dev secrets | Prod-guarded at boot |
| Demo MySQL seed | Local only |

---

## 6. Definition of Done (P16 full)

P16 = PASS when (excluding PayTabs LIVE):

- No stub email in production
- No tok_ok in production checkout/billing unless explicit staging flag
- Document uploads use object storage
- KYB review has platform admin UI
- V4 merchant webhooks deliver over HTTP
- Payout uses real rail OR mark-paid is break-glass only with audit
- Settlement/reconciliation beyond count-only
- Production Gate rows move from PARTIAL → PASS where applicable
- **PayTabs still may be SANDBOX_TESTED** — that is OK for P16

---

## 7. Next implementation steps

1. **P16.1** — Pick email vendor (DEC-017), wire outbox worker
2. **P16.3** — S3-compatible document storage for KYB uploads
3. **P16.5** — Checkout success/cancel URL redirect after payment
4. **P16.8** — Merchant webhook delivery worker on PG outbox
5. **P16.10** — Refresh `PRODUCTION_GATE.md` after each package

---

## 8. Files (P16.0)

| Created |
|---|
| `apps/api/src/platform/runtime-config.ts` |
| `apps/api/src/platform/sandbox-token-guard.ts` |
| `apps/web/src/v4/hooks/usePlatformRuntime.ts` |
| `tests/p16-runtime-config.test.ts` |
| `docs/implementation/P16_PRODUCTION_ACTIVATION.md` |

| Modified |
|---|
| `apps/api/src/interfaces/http/apiV1/routes.ts` |
| `apps/api/src/foundation/authz.ts` |
| `apps/api/src/payments/payment-core-service.ts` |
| `apps/api/src/billing/renewal-service.ts` |
| `apps/web/src/v4/public-checkout/CheckoutPage.tsx` |
| `apps/web/src/v4/layouts/AppShell.tsx` |
| `apps/web/src/v4/api/endpoints.ts` |
| `scripts/verify-foundation-pg.mjs` |
| `.env.example` |

---

**STOP:** P16 does not authorize PayTabs LIVE or Production Gate PASS.
