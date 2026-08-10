# P11 — Production Infrastructure Foundations

**Status:** PARTIAL (foundations + requirements documented)  
**Production Ready:** NOT claimed

## Required components

| Component | Current | Target |
|---|---|---|
| Email delivery | Dev token expose | Real provider — **BLOCKED BY: DEC-017** |
| Queue / outbox worker | Present | Production HA + monitoring |
| Redis | Optional / in-memory rate limit | Distributed rate limit |
| Object storage (KYB docs) | Local/dev paths | Encrypted object storage |
| Secrets / KMS | Env vars | Secret manager in prod |
| Monitoring / metrics | Structured logs partial | Metrics + alerts |
| Health / readiness | Present on API | Expand queue + provider + DB |
| Backup | Not verified | Documented + restore drill |

## Non-negotiables

- Never mix Dev / Sandbox / Production databases or credentials
- No demo passwords in production seeds
- Secrets never in git, logs, or frontend bundles

## Exit criteria for P11

- [ ] Email DEC-017 decided and implemented or explicitly deferred with UX
- [ ] Outbox worker supervised in all environments
- [ ] Backup + restore drill evidence attached
- [ ] Alert runbook for payment failure spike / webhook failure / queue backlog
