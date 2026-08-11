# Next Adapter Plan — Palestine Providers (post-docs)

**Status:** Ready to execute **after** first private docs package arrives  
**Gate:** `supports_live=FALSE` until DEC-009 evidence + sandbox certification  
**Do not** claim Production Ready or LIVE enablement from scaffolding alone

## Preconditions (all required)

- [ ] Merchant/platform commercial path confirmed with provider  
- [ ] Private API or HPP docs received (saved under `docs/providers/palestine/inbox/<provider>/`)  
- [ ] [PLATFORM_MODEL_QUESTIONNAIRE.md](./PLATFORM_MODEL_QUESTIONNAIRE.md) answered for that provider  
- [ ] Sandbox credentials available via SecretResolver (env/file) — **never** committed to git  
- [ ] Webhook public HTTPS endpoint available for certification (not localhost)

## Received docs (fill in)

| Provider | Docs received? | Date | Path | Integration type | Platform model |
|---|---|---|---|---|---|
| bop | | | | | |
| arabbank_ps | | | | | |
| jawwalpay | | | | | |
| palpay | | | | | |

**First provider to implement:** ________________ (recommend BOP if Custom docs arrive first)

---

## Target architecture (mirror PayTabs)

```text
Checkout / Payment Core
  → Provider Router (env, capability, credentials)
    → ProviderAdapter (new code under apps/api/src/providers/<code>/)
      → HPP redirect or provider HTTP
  ← Webhook pipeline (verify → dedupe → normalize → outbox)
```

### Code touchpoints (existing patterns)

| Area | Path |
|---|---|
| Adapter contract | `apps/api/src/providers/adapter.ts` |
| Registry | `apps/api/src/providers/registry.ts` |
| Router LIVE gate | `apps/api/src/providers/router.ts` (`supports_live`) |
| PayTabs reference | `apps/api/src/providers/paytabs/` |
| Capability matrix | `apps/api/src/providers/capability-matrix.ts` |
| Checklist | `docs/providers/PROVIDER_CHECKLIST.md` → copy to `docs/providers/<code>/CHECKLIST.md` |
| DB seed | `database/migrations/postgres/` — `providers` row with `supports_live=FALSE` |

### Proposed provider codes (stable)

| Code | Display name | Notes |
|---|---|---|
| `bop` | Bank of Palestine Gateway | Priority 1 |
| `arabbank_ps` | Arab Bank Palestine (CyberSource) | May wrap CyberSource SA/REST |
| `jawwalpay` | Jawwal Pay | Wallet + online gateway |
| `palpay` | PalPay | Distinct from Pallapay crypto |

---

## Implementation phases (per provider)

### Phase P-PS.1 — DISCOVERED → CONTRACTED (no LIVE)

1. Migration: insert `providers` (`status` appropriate, `supports_sandbox=TRUE`, `supports_live=FALSE`, region metadata `PS` / ILS).  
2. Seed empty/unknown `provider_capabilities` rows marked UNKNOWN until evidenced.  
3. Scaffold adapter module implementing `ProviderAdapter`:
   - Unsupported ops return `NOT_AVAILABLE` (never invent success).  
   - Sandbox-only assert helper (like PayTabs `assertPayTabsSandboxOnly`).  
4. Register adapter in `registry.ts`.  
5. Config + SecretResolver refs in `.env.example` (no secrets).  
6. Unit/contract tests with recorded fixtures (no real network until cert flag).  
7. Copy checklist to `docs/providers/<code>/CHECKLIST.md` — start DISCOVERED/CONTRACTED.

### Phase P-PS.2 — SANDBOX_TESTED

1. `ADAPTER_MODE=http` + sandbox credentials.  
2. Real create payment → HPP → return URL.  
3. Inbound webhook signature tests + one live sandbox webhook.  
4. Refund path if API exists; else document UNSUPPORTED.  
5. Update capability matrix + DEC-009 partial evidence for **sandbox only**.

### Phase P-PS.3 — LIVE_READY (blocked until evidence)

1. Separate LIVE credential plane.  
2. Minimal-value live transaction per provider policy.  
3. Set `supports_live=TRUE` only with DEC-009 approval + checklist PASS.  
4. Still does **not** auto-PASS Production Gate (PCI, payout rail, ops remain).

---

## Env template (example — fill names after docs)

```bash
# Palestine provider (example: BOP) — SANDBOX ONLY until DEC-009
BOP_ENV=sandbox
BOP_ADAPTER_MODE=simulate
BOP_SANDBOX_BASE_URL=
BOP_SANDBOX_MERCHANT_ID=
BOP_SANDBOX_API_KEY=
BOP_SANDBOX_CALLBACK_URL=https://<public>/api/v1/webhooks/providers/bop
BOP_SANDBOX_RETURN_URL=https://<public>/checkout/return
# LIVE_* intentionally omitted until certified
```

---

## Forbidden until docs + certification

- Enabling LIVE via env alone  
- Storing secrets in PostgreSQL or the repo  
- Claiming Production Gate PASS  
- Accepting PAN/CVV on IMKAN API  
- Treating simulate/stub success as provider evidence  

---

## Exit criteria for “first adapter done”

- [ ] Adapter registered; router can select it for SANDBOX org routes  
- [ ] Checklist at least SANDBOX_CONFIGURED / SANDBOX_TESTED as evidenced  
- [ ] `supports_live=FALSE` still true  
- [ ] Questionnaire matrix filled for that provider  
- [ ] No Production Gate status change without ops package
