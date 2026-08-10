# KYB / Bank Verification Provider Architecture (Phase 3)

**Spec:** §6 (external verification services use adapters), §13 (provider rules), §2 (no invented provider APIs).

## Interfaces

`apps/api/src/merchant/verification-providers.ts`:

- `KybVerificationProvider` — `verifyCompany(...)`, `verifyPerson(...)`
- `BankVerificationProvider` — `verifyAccount(...)`

Both return a `ProviderCheckResult` `{checkType, result: PASS|FAIL|WARN|PENDING|NOT_AVAILABLE, provider, details?}` which is persisted append-only into `verification_results` / `payout_account_verification_results` with the provider name.

## Current implementation

`internal-manual` adapters return `NOT_AVAILABLE`. **No external KYB or bank verification provider is integrated**; no provider API, credential format or capability is invented. The authoritative decision path is platform manual review (`kyb.review` / `bank.review` + step-up).

## Integrating a real provider later

1. Open a Decision (provider choice, capabilities, sandbox/live credential model, webhook verification).
2. Implement the interface in a new adapter; register per configuration (sandbox/production isolation per spec §14).
3. Persist provider results via the existing result tables (append-only) — the state machines already accept provider-sourced results; final decisions may remain manual or become policy-driven (separate Decision).
4. Store only credential **metadata** in PostgreSQL (`provider_credentials_metadata` planned for the Providers phase); secrets live in environment/secret manager.
5. Add sandbox tests + provider documentation under `docs/providers/` before activation (spec §13: capabilities must be verified before activation).
