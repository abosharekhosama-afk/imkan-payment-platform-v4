# P12 — Security & PCI Scope

**Status:** PARTIAL  
**Production Ready:** NOT claimed  
**PCI formal scope:** **BLOCKED BY: DEC-011**

## Controls present

- Password hashing (scrypt), MFA, step-up
- RBAC + tenant isolation (app-layer)
- Webhook signature verification + dedupe
- API key hashing; bank credential encryption
- Helmet / CORS / rate limit (in-memory)
- No PAN/CVV storage by design (hosted/sandbox tokens)

## Required before go-live

| Item | Status |
|---|---|
| Formal threat model pack | NOT IMPLEMENTED |
| Penetration test | NOT IMPLEMENTED |
| PCI SAQ / scope decision (DEC-011) | BLOCKED |
| Postgres RLS defense-in-depth | NOT IMPLEMENTED |
| Distributed rate limiting | NOT IMPLEMENTED |
| Secret manager / KMS | NOT IMPLEMENTED |

## Rule

Prefer provider-hosted fields / redirect / tokenization. Do not expand PCI scope without DEC-011.
