# Brevo HTTP API vs legacy SMTP — migration notes

## Why we switched (Aug 2026)

**Render Free tier blocks outbound SMTP** on ports `25`, `465`, and `587`.

Symptom in Neon `outbox_events`:

```text
last_error: connect ETIMEDOUT 172.246.243.66:587
```

Brevo SMTP never receives traffic; verification/invitation emails stay `PENDING`.

**Fix in use:** `EMAIL_TRANSPORT=brevo` → Brevo Transactional API over **HTTPS (443)**.

Implementation: `apps/api/src/platform/email-transport.ts` → `BrevoHttpEmailTransport`.

Legacy SMTP code is **commented out** in the same file (not deleted).

---

## Current production env (Render)

| Variable | Value |
|----------|--------|
| `EMAIL_TRANSPORT` | `brevo` |
| `BREVO_API_KEY` | Brevo → **SMTP & API** → **Create API key** (Transactional) |
| `EMAIL_FROM` | Verified sender in Brevo (e.g. `abosharekhosama@gmail.com`) |
| `EMAIL_FROM_NAME` | `IMKAN Payments` |
| `APP_PUBLIC_URL` | `https://imkan-payments-web.onrender.com` |

SMTP vars (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`) are **not required** while using `brevo`.

---

## After deploy — retry failed outbox events

```sql
UPDATE outbox_events
SET status = 'PENDING', available_at = NOW(), last_error = NULL, attempts = 0
WHERE event_type LIKE 'email.%'
  AND status IN ('PENDING', 'FAILED');
```

Then use **Resend verification** in the web UI or wait for the outbox worker.

---

## Switch back to SMTP later (paid Render or VPS)

Use when:

- Render API upgraded to **Starter** (or any paid instance), **or**
- You move API to a host that allows outbound SMTP.

### Steps

1. **`apps/api/src/platform/email-transport.ts`**
   - Uncomment the `LEGACY SMTP transport` block (`SmtpEmailTransport`, `smtpSend`, …).
   - In `getEmailTransport()`, replace `SmtpEmailTransportDisabled` with `SmtpEmailTransport`:
     ```typescript
     else if (mode === 'smtp') transport = new SmtpEmailTransport();
     ```
   - Remove or keep `SmtpEmailTransportDisabled` (optional).

2. **Environment**
   ```env
   EMAIL_TRANSPORT=smtp
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_USER=...
   SMTP_PASS=xsmtpsib-...
   EMAIL_FROM=verified-sender@example.com
   ```
   Remove or ignore `BREVO_API_KEY` when on SMTP.

3. **`render.yaml`** — set `EMAIL_TRANSPORT=smtp`, restore SMTP env vars.

4. **`apps/api/src/config.ts`** — production asserts already accept `smtp` when `SMTP_HOST` is set.

5. **Redeploy API** → test with Brevo SMTP verification page (should show logs).

6. **Retry outbox** (SQL above).

---

## Local development

| Mode | Env |
|------|-----|
| No real email | `EMAIL_TRANSPORT=stub` (default non-production) |
| Real email via API | `EMAIL_TRANSPORT=brevo` + `BREVO_API_KEY` + `EMAIL_FROM` |
| Legacy SMTP local | Uncomment SMTP block + `EMAIL_TRANSPORT=smtp` |

---

## Related

- [RENDER_DEPLOY.md](./RENDER_DEPLOY.md)
- [PRODUCTION_DEPLOY_RUNBOOK.md](./PRODUCTION_DEPLOY_RUNBOOK.md)
- Render changelog: Free web services block SMTP ports
