# Security Hardening Checklist

- [x] Passwords hashed with scrypt; plaintext passwords are never stored.
- [x] Session tokens are stored as hashes, not bearer secrets.
- [x] Login throttling and temporary account lockout.
- [x] TOTP MFA login challenge.
- [x] API keys hashed at rest and expiry/revocation support retained.
- [x] Tenant scoping on authenticated database queries.
- [x] Helmet and CORS configuration.
- [x] Rate limiting.
- [x] Graceful shutdown and dependency closure.
- [x] Production error responses avoid internal exception details.
- [x] Provider webhook signature verification and deduplication.
- [x] Idempotency keys on payment mutations.
- [x] Outbox/inbox tables for reliable integration delivery.

Before live-money launch: move secrets to a managed secrets store, add WAF/SIEM, rotate encryption keys, enable database TLS, enforce TLS 1.2+, configure backups/restore drills, add dependency/SCA scanning, penetration testing, PCI DSS assessment, and operational alerting.
