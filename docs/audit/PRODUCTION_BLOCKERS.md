# PRODUCTION BLOCKERS

**Date:** 2026-08-10  
**Verdict:** Development/sandbox usable · **Production Ready = NO**

## Code blockers

| ID | Issue | Severity | Target |
|---|---|---|---|
| BG-W1 | Provider webhooks do not apply Payment Intent / Invoice state | Critical | P4 |
| BG-E1 | No merchant bill-now / force-due API | Medium | P6 |
| BG-F1 | No refunds/ledger/balances/settlements/payouts/disputes | Critical | P6–P9 |
| BG-T1 | No dedicated transactions list API | Low | P4 |
| — | Platform Admin Console UI missing | High | P3/P11 |
| — | Postgres RLS not implemented (app-layer only) | Medium | P12 |
| — | Outbox delivery stub (no email/Books fanout) | High | P11 / DEC-017 |

## Open decisions

| DEC | Topic | Blocks |
|---|---|---|
| DEC-008 | Fees / FX / reserves / cutoffs | Settlement math (P7–P8) |
| DEC-009 | Live provider capability matrices | Live adapters (P5) |
| DEC-010 | External KYB vendors | Automated KYB |
| DEC-011 | PCI scope | Live card acceptance |
| DEC-012 | Sandbox↔Live switch UX | Merchant LIVE enablement UX |
| DEC-016 | Books target (Zoho vs internal) | Books connector (P10) |
| DEC-017 | Email transport | Production email |

## Policy

Do not invent fee rates, live provider behavior, or Books target. Document **BLOCKED BY: &lt;DEC&gt;** when gated work cannot proceed.
