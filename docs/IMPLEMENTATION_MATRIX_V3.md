# Implementation Matrix V3

| Domain | API | DB | UI | Sandbox behavior | Production gap |
|---|---|---|---|---|---|
| Payments | Yes | Yes | Yes | Simulated processor | Real processor + PCI scope |
| Refunds | Yes | Yes | Yes | Simulated provider refund | Real provider |
| Checkout | Yes | Yes | Yes | Token string sandbox | Processor-hosted fields/3DS |
| Payment Links | Yes | Yes | Yes | Real internal flow | Production domain/branding |
| Balances | Yes | Yes | Yes | Ledger projection | Settlement timing/reserves |
| Settlements | Yes | Yes | Yes | Internal settlement run | Provider settlement import |
| Payouts | Yes | Yes | Yes | Sandbox payout | Bank rail |
| Reconciliation | Yes | Yes | Yes | Internal matching | Provider/bank feeds |
| Risk | Yes | Yes | Yes | Deterministic rules | External risk signals |
| Disputes | Yes | Yes | Yes | Internal workflow | Processor chargeback feed |
| KYC/KYB | Yes | Yes | Yes | Manual/demo verification | Real KYC vendor |
| Subscriptions | Yes | Yes | Yes | Period metadata | Invoice engine + dunning + retries |
| Reports | Yes | Yes | Yes | CSV/JSON | Async object storage/scheduled reports |
| RBAC | Foundation | Yes | Yes | Role/permission records | Identity provider + enforcement middleware |
| MFA | Foundation | Yes | Partial | Demo setup secret | Real TOTP/WebAuthn/IdP |
| Webhooks | Yes | Yes | Yes | Signed HTTP + retry | Secrets rotation, DLQ/ops hardening |
| Provider adapter | Interface + remote adapter | N/A | N/A | Sandbox/default | Real processor contract mapping |

The build is a substantially broader sandbox platform, but it is not a certified production payment processor.
