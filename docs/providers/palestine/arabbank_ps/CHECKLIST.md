# Arab Bank Palestine (CyberSource) — Activation Checklist

**Code:** `arabbank_ps`  
**Lifecycle:** **DISCOVERED** (2026-08-11)  
**Research:** [../RESEARCH.md](../RESEARCH.md)

## Lifecycle

| Stage | Status | Evidence |
|---|---|---|
| DISCOVERED | Done | arabbank.ps Payment Gateway page |
| CONTRACTED | Pending | Call 02-2953333 / Arabi Next + outreach email |
| SANDBOX_CONFIGURED | Blocked | Need CyberSource merchant pack from bank |
| LIVE_ENABLED | Blocked | DEC-009 |

## Notes
- Do not confuse with Arab Bank Open Banking APIs.  
- Expect CyberSource Secure Acceptance or REST under bank-issued credentials.  
- PAN must never hit IMKAN API.

## Checklist
- [ ] Auth mechanism documented
- [ ] Sandbox credentials via SecretResolver
- [ ] Webhook / silent post verified
- [ ] Refund / void mapped
- [ ] Platform/marketplace answers recorded
