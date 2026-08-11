# GCC PayTabs Activation — Next Step (Sandbox → Production Path)

**Date:** 2026-08-11  
**Scope:** Start real PayTabs Sandbox certification for GCC markets  
**LIVE money:** **NOT ENABLED** in this step  
**Production Gate:** Remains **NOT PASSED** until LIVE + P16 ops complete  

Related: [P15_4_REAL_PAYTABS_SANDBOX.md](../../implementation/P15_4_REAL_PAYTABS_SANDBOX.md), [PAYTABS_SANDBOX_CERTIFICATION.md](./PAYTABS_SANDBOX_CERTIFICATION.md)

---

## Why PayTabs for GCC first

- V4 adapter already exists (`apps/api/src/providers/paytabs/`)
- Regional endpoints cover KSA, UAE, Oman, Jordan, Kuwait, Qatar, Egypt, etc.
- Local Palestine rails remain **DISCOVERED** (no public API) — see [palestine/](./palestine/)

---

## Regional base URLs (choose the one PayTabs assigns to your merchant profile)

| Market / region | Typical PayTabs base URL |
|---|---|
| Saudi Arabia | `https://secure.paytabs.sa` |
| UAE / Global (default portal) | `https://secure.paytabs.com` |
| Egypt | `https://secure-egypt.paytabs.com` |
| Oman | `https://secure-oman.paytabs.com` |
| Jordan | `https://secure-jordan.paytabs.com` |
| Kuwait | Confirm in PayTabs merchant dashboard |
| Qatar / Bahrain | Confirm in PayTabs merchant dashboard |

**Rule:** Use the exact base URL from your PayTabs dashboard — do not guess. Set:

```bash
PAYTABS_SANDBOX_BASE_URL=<url-from-dashboard>
```

---

## Step 0 — Create PayTabs merchant (you)

1. Register at PayTabs for your GCC entity (company in SA/AE/etc.).  
2. Open **Sandbox** credentials in the merchant portal.  
3. Copy **Profile ID** and **Server Key** (never commit them).  
4. Note the regional endpoint shown in the portal.

---

## Step 1 — Configure local `.env` (do not commit secrets)

```bash
PAYTABS_ENV=sandbox
PAYTABS_ADAPTER_MODE=http
PAYTABS_REAL_SANDBOX_CERT=true
PAYTABS_SANDBOX_BASE_URL=https://secure.paytabs.sa   # example SA — replace with yours
PAYTABS_SANDBOX_PROFILE_ID=<from portal>
PAYTABS_SANDBOX_SERVER_KEY=<from portal>
# Must be public HTTPS (ngrok / cloudflare tunnel / staging host) — not localhost
PAYTABS_SANDBOX_CALLBACK_URL=https://<public-host>/api/v1/webhooks/providers/paytabs
PAYTABS_SANDBOX_RETURN_URL=https://<public-or-dev-host>/checkout/return
# Same public URL used for E2E readiness gate
PAYTABS_REAL_WEBHOOK_ENDPOINT=https://<public-host>/api/v1/webhooks/providers/paytabs
```

Expose local API publicly for webhooks, e.g.:

```bash
# example only
npx cloudflared tunnel --url http://127.0.0.1:3000
# or ngrok http 3000
```

Then paste the HTTPS URL into `PAYTABS_SANDBOX_CALLBACK_URL` and `PAYTABS_REAL_WEBHOOK_ENDPOINT`.

---

## Step 2 — Run preflight (no secrets printed)

```bash
npm run paytabs:preflight
```

Exit code `0` = `e2eReady=true`. Exit `2` = blockers listed.

Expected when credentials are missing:

- Missing `PAYTABS_SANDBOX_SERVER_KEY` / `PROFILE_ID`
- Callback not public HTTPS
- `PAYTABS_REAL_SANDBOX_CERT` not true

---

## Step 3 — Real sandbox HTTP certification checklist

When preflight is green:

| ID | Action | Pass criteria |
|---|---|---|
| GCC-PT-01 | Create payment intent via V4 → PayTabs HPP | `REQUIRES_ACTION` + `redirect_url` |
| GCC-PT-02 | Complete payment on PayTabs sandbox page | Callback received; intent SUCCEEDED |
| GCC-PT-03 | Invalid webhook signature rejected | 4xx / verify fail |
| GCC-PT-04 | Duplicate webhook idempotent | No double capture |
| GCC-PT-05 | Full refund (if sandbox supports) | Refund SUCCEEDED |
| GCC-PT-06 | Query status after ambiguous timeout | Query-before-retry works |

Record evidence under `docs/providers/PAYTABS_SANDBOX_CERTIFICATION.md` (append GCC real-HTTP section).

---

## Step 4 — After sandbox CERTIFIED (later — not this step)

1. Obtain **LIVE** Profile ID + Server Key (separate env vars — never mix with sandbox).  
2. Explicit DEC-009 approval to set `supports_live=TRUE`.  
3. Minimal live transaction.  
4. Complete P16 ops (Redis, SMTP, cookies, backup, PCI).  
5. Only then update Production Gate.

**Forbidden now:** `PAYTABS_ENV=live` (adapter throws).

---

## Current repo status (2026-08-11)

| Item | Status |
|---|---|
| Adapter + simulate tests | PASS |
| Real HTTP cert | BLOCKED on merchant credentials + public webhook |
| LIVE | BLOCKED |
| npm script | `npm run paytabs:preflight` |

---

## What you send us to unblock HTTP cert

Fill and keep private (local `.env` only):

| Field | Value |
|---|---|
| GCC market (SA / AE / …) | |
| `PAYTABS_SANDBOX_BASE_URL` | |
| Profile ID set? (yes/no) | |
| Server Key set? (yes/no) | |
| Public webhook HTTPS ready? (yes/no) | |

Do **not** paste Server Key into chat or git.
