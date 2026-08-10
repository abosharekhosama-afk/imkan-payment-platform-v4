# Full Platform Implementation Status

This build extends the Phase 3 processor-ready foundation with executable sandbox implementations for the remaining business modules.

## Implemented in this build

- Merchant Console modules: Dashboard, Payments, Customers, Payment Links, Refunds, Balances, Settlements, Payouts, Reconciliation, Risk, Disputes, KYC/KYB, Subscriptions, Reports, API/Webhooks, Audit, Settings.
- Settlement creation and settlement items.
- Sandbox payout execution and payout attempts.
- Reconciliation runs and exceptions.
- Risk assessment engine with amount, reference and velocity rules.
- Dispute/evidence workflow.
- KYC/KYB case foundation and bank-account verification simulation.
- Products, Prices, Subscriptions and Invoice storage foundation.
- Report queries and CSV/JSON export records.
- Payment Pages with public tokens.
- RBAC permission and role tables plus merchant-console management endpoints.
- User/MFA foundation. MFA provisioning is explicitly demo-only until a real TOTP library/identity provider is connected.
- Webhook delivery worker with retries, signing and replay.
- Hosted checkout and payment-page flows remain sandbox-only.

## Explicitly not production-ready

- No live card PAN/CVV handling.
- No live acquirer/processor adapter with merchant credentials.
- No real bank payout rail.
- No real KYC vendor.
- No real fraud-data provider.
- No production identity/OIDC/TOTP implementation.
- No PCI certification, legal/compliance approval, or production secrets management.
- Sandbox settlement/reconciliation/payout results are internally simulated.

## Production adapter seam

The payment provider contract remains the seam for a real processor. Add a real adapter implementing `PaymentProvider`, then configure it through the provider factory. Do not move raw card data into this application.
