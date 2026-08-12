# PayTabs GCC — Ops checklist after credentials

Use after you have sandbox Profile ID + Server Key and a public HTTPS tunnel.

## A. Configure (local only)

- [ ] Choose GCC market (SA / AE / …)
- [ ] Set `PAYTABS_SANDBOX_BASE_URL` from dashboard
- [ ] Set `PAYTABS_SANDBOX_PROFILE_ID` and `PAYTABS_SANDBOX_SERVER_KEY` in `.env`
- [ ] Start API on port 3000
- [ ] Start public tunnel → copy HTTPS origin
- [ ] Set `PAYTABS_SANDBOX_CALLBACK_URL` and `PAYTABS_REAL_WEBHOOK_ENDPOINT` to `https://…/api/v1/webhooks/providers/paytabs`
- [ ] Set `PAYTABS_SANDBOX_RETURN_URL` (can be localhost for browser return if needed)
- [ ] Set `PAYTABS_ADAPTER_MODE=http` and `PAYTABS_REAL_SANDBOX_CERT=true`

## B. Verify

- [ ] `npm run paytabs:preflight` → `e2eReady=true`
- [ ] Create a sandbox payment via V4 checkout / payment link
- [ ] Complete HPP on PayTabs sandbox page
- [ ] Confirm webhook arrives and payment becomes SUCCEEDED
- [ ] Run refund if available; record evidence in `PAYTABS_SANDBOX_CERTIFICATION.md`

## C. Still blocked for production

- [ ] LIVE credentials (separate)
- [ ] DEC-009 LIVE approval
- [ ] P16 Redis / SMTP / PCI / payout
- [ ] Production Gate PASS

Do not set `PAYTABS_ENV=live` until C is complete.
