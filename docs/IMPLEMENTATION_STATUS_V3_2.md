# Payment Platform V3.2 — Implementation Status

## Delivered in this release

- **Real processor boundary:** PayTabs hosted payment-page adapter is retained and selected with `PAYMENT_PROVIDER=paytabs`. Card PAN/CVV do not enter the API. The processor handles hosted capture and 3DS redirect.
- **Production authentication:** password hashing with Node `scrypt`, session tokens stored only as SHA-256 hashes, login lockout, security events, logout and `/v1/auth/me`. API-key authentication remains available for server-to-server integrations.
- **MFA:** RFC 6238/TOTP enrollment and login challenge flow. MFA secrets are encrypted using the existing token vault.
- **RBAC:** permissions are evaluated for sensitive administration/payment operations; tenant scoping remains enforced in queries.
- **KYC/KYB provider boundary:** remote business and identity verification adapters can be enabled through `KYC_PROVIDER_URL/KEY`; internal workflow remains available for development.
- **Fraud/risk provider boundary:** local rules remain the fallback; an external risk decision provider can be enabled through `RISK_PROVIDER_URL/KEY`.
- **Settlement/payout provider boundary:** remote settlement import and payout creation adapters can be enabled through `SETTLEMENT_PROVIDER_*` and `PAYOUT_PROVIDER_*`. Sandbox simulation is still preserved.
- **Reconciliation:** existing reconciliation engine remains available; production rail imports now have a provider boundary so external settlement data can be normalized before matching.
- **Books integration:** Zoho Books OAuth 2.0 connector, invoice lookup and customer-payment creation are retained. Shared event contracts and an outbox/inbox persistence model are added for the team's future Books platform.
- **Shared event contracts:** `packages/contracts` now defines versioned payment/refund/settlement/payout platform events.
- **Regional configuration:** Saudi Arabia, UAE, Bahrain, Kuwait, Qatar, Oman and Palestine presets are available as configurable tenant policies. These are product defaults, not legal advice; tax/e-invoicing rules must be validated with local advisers and providers before production.
- **Security hardening:** Helmet, CORS allow-list, rate limiting, graceful shutdown, production-safe 5xx messages, security event logging, login throttling and token hashing are included.

## Credential/licensing gates (intentionally not faked)

A codebase cannot become a licensed payment institution or obtain live acquiring credentials by itself. The following remain configuration/onboarding tasks: acquiring/processor contracts, merchant underwriting, KYC/KYB vendor account, risk vendor account, payout/banking rail, Zoho Books OAuth app, PCI DSS scope/attestation, WAF/SIEM/secrets manager, backups/DR, and country-specific tax/e-invoicing certification.

## Test modes

- `PAYMENT_PROVIDER=sandbox`: deterministic fake processor for development and automated tests.
- `PAYMENT_PROVIDER=paytabs`: hosted real-provider boundary; requires real merchant profile/server key/callback URL.
- External KYC/risk/settlement/payout adapters are disabled until their URLs and secrets are supplied.

## Recommended next certification steps

1. Configure PayTabs test credentials and certify success/failure/3DS/refund/webhook flows.
2. Connect the KYC/KYB and risk providers selected for each market.
3. Import real settlement files and certify payout beneficiary controls.
4. Run contract tests between Payments and the teammate's Books service.
5. Complete PCI/security review and country-specific tax/e-invoicing review.
