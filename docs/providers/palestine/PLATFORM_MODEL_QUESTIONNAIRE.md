# Platform / Marketplace Model Questionnaire

**Purpose:** Ask every Palestine provider the same questions. Copy answers into the table at the bottom when replies arrive.  
**Why it matters:** IMKAN V4 is multi-tenant. A provider that only supports a single legal merchant cannot be used as a platform rail without a different commercial model (e.g. one MID per boarded merchant).

Send this with [OUTREACH.md](./OUTREACH.md).

---

## Questions (send as-is)

### A. Account model
1. Do you support a **platform / marketplace / payment facilitator** model (one contract, many sub-merchants)?  
2. If not, must **each merchant** open their own MID / merchant agreement with you?  
3. Can IMKAN hold a **master merchant** account and settle to sub-merchants’ bank accounts later?  
4. Are sub-merchant onboarding / KYB APIs available, or is onboarding branch-only?

### B. Technical integration
5. Integration type for custom platforms: **HPP redirect**, **iframe**, **server-to-server**, **SDK**, other?  
6. Is there a **public or private REST API**? Version / base URL for sandbox and live?  
7. Idempotency: do you accept a client idempotency key?  
8. Currencies supported for PS merchants (ILS, USD, JOD, other)?  
9. Amount format (minor units vs decimal string)?

### C. Webhooks & security
10. Do you send **server callbacks / webhooks**? Signature algorithm? Timestamp / replay window?  
11. Separate sandbox vs live webhook secrets?  
12. Confirm: **PAN/CVV never** posted to the platform server (hosted fields / redirect only)?

### D. Lifecycle
13. Full refund API? Partial refund? Time limits?  
14. Void / cancel before capture?  
15. Recurring / tokenized payments?  
16. Dispute / chargeback notifications?  
17. Settlement file or settlement API? Cadence?

### E. Compliance & ops
18. PCI scope for the integrator (SAQ type expected)?  
19. PMA / local licensing constraints for a multi-merchant platform?  
20. Sandbox certification checklist before go-live?  
21. SLA / status page / support escalation for production incidents?

---

## Answer matrix (fill when replies arrive)

| # | BOP | Arab Bank | Jawwal Pay | PalPay | Notes |
|---|---|---|---|---|---|
| A1 Platform/PF | | | | | |
| A2 Per-merchant MID | | | | | |
| A3 Master + sub-settle | | | | | |
| A4 Sub-KYB API | | | | | |
| B5 Integration type | | | | | |
| B6 REST/HPP docs | | | | | |
| B7 Idempotency | | | | | |
| B8 Currencies | | | | | |
| B9 Amount format | | | | | |
| C10 Webhooks | | | | | |
| C11 Env secrets | | | | | |
| C12 No PAN to us | | | | | |
| D13 Refunds | | | | | |
| D14 Void | | | | | |
| D15 Recurring | | | | | |
| D16 Disputes | | | | | |
| D17 Settlement | | | | | |
| E18 PCI | | | | | |
| E19 PMA / platform | | | | | |
| E20 Sandbox cert | | | | | |
| E21 Support SLA | | | | | |

**Decision rule for IMKAN:**

- If **A1 = no** and **A2 = yes**: still integrable — one `provider_accounts` row per merchant org; higher ops cost.  
- If **A1 = yes**: prefer that provider for platform scale.  
- If **B5/B6 unknown** after reply: keep status DISCOVERED — do not code.  
- If **C12 = no** (PAN would hit our API): **reject** for V4 (DEC-011 / PCI).
