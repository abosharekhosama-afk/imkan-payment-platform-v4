# Production Readiness Notes

This release keeps the sandbox adapter for automated tests but introduces a real-provider boundary and a real accounting integration boundary.

## Implemented in this release

- Provider selection: `sandbox`, `remote`, or `paytabs`.
- PayTabs hosted payment-page adapter with server callback and signature verification.
- Hosted-checkout redirect handling in the web application.
- Real `/health/ready` database/Redis readiness check.
- Zoho Books OAuth 2.0 connection with encrypted access/refresh tokens.
- Zoho Books invoice lookup and customer-payment API integration.
- Payments ↔ Books contract for the teammate's Books application.
- Provider callback persistence and idempotency.
- Production mode blocks sandbox-generated payouts/settlements/reconciliation instead of silently pretending they succeeded.
- Bank accounts are no longer marked verified without a real verification rail.
- TOTP MFA setup and verification (RFC 6238 compatible) with encrypted secrets.

## Regional processor strategy

PayTabs has regional endpoints for KSA, UAE, Oman, Jordan, Kuwait, Qatar and other listed markets. The correct endpoint must be selected for the merchant's acquiring profile. Tap and MyFatoorah are additional GCC options, but their availability/countries differ. Palestine requires a separately contracted local/regional acquiring route; the platform therefore exposes the same provider interface rather than pretending a GCC provider can settle Palestinian businesses.

## Still required before real-money launch

- Merchant acquiring agreements and regulatory licensing for every target country.
- PCI DSS scope assessment and processor-hosted/tokenized payment capture only.
- Production refund/dispute/payout adapters for the selected processor/bank rails.
- KYC/KYB vendor integration and sanctions/AML policy execution.
- Bank-account verification and payout beneficiary controls.
- Production email/SMS delivery and notification templates.
- Secrets management, WAF, SIEM, backups, key rotation and disaster recovery.
- Full webhook replay/idempotency tests and provider certification.
- Tax/e-invoicing requirements per jurisdiction (e.g. KSA VAT/e-invoicing and Palestine requirements as applicable).
