# Sensitive Operations Registry — Phase 6.6 Final

**Source of truth:** `apps/api/src/foundation/sensitive-operations.ts`  
**Listing API:** `GET /api/v1/rbac/sensitive-operations`  
**Enforcement:** `requireStepUp(opCode)` + MFA-backed step-up tokens (`X-Step-Up-Token`)

| Code | Permission(s) | Step-up now | Audit | Risk | Status |
|---|---|---|---|---|---|
| auth.password.change | (authenticated self) | yes | yes | medium | active |
| users.invite | invites.manage / users.invite | yes | yes | medium | active |
| users.deactivate | users.deactivate / users.manage | yes | yes | high | active |
| roles.assign | roles.manage / users.manage | yes | yes | high | active |
| roles.custom.manage | roles.manage | yes | yes | high | active |
| bank.account.create | bank.manage | yes | yes | high | active |
| bank.account.set_default | bank.manage | yes | yes | high | active |
| bank.account.activate | bank.manage | yes | yes | high | active |
| api_keys.create | api_keys.manage | yes | yes | high | active |
| api_keys.revoke | api_keys.manage | yes | yes | high | active |
| providers.credentials | providers.manage | yes (route upsert) | yes | high | partial — live credential store DEF |
| invoices.collect | invoices.pay / manage | yes | yes | high | active |
| billing.renewals.run | billing.manage / platform.admin | yes | yes | high | active |
| subscriptions.pause/resume/cancel | subscriptions.* | no (audited) | yes | medium | active |
| org.ownership | org.manage | yes (registry) | — | critical | DEF — no API |
| payments.refund / partial_refund | payments.refund* | yes (registry) | — | critical | DEF — Phase 7+ |
| payouts.execute | payouts.manage | yes (registry) | — | critical | DEF — Phase 7+ |
| settlements.manage | settlements.manage | yes (registry) | — | high | DEF — Phase 7+ |
| security.settings | security.manage | yes (registry) | — | high | DEF admin policy; self MFA enable without step-up |

## Step-up abstraction

- MFA must be enabled (`POST /auth/mfa/enable` self-service).  
- `POST /auth/mfa/step-up` issues short-lived token.  
- Routes call `requireStepUp` which consumes the token.  
- API keys cannot perform step-up (session-only).  
- Future MFA challenge / re-auth policies are encoded in `futureMfaPolicy` without inventing UX yet.
