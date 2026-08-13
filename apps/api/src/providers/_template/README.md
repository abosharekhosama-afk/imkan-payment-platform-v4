# Provider adapter template

Copy this folder to `apps/api/src/providers/<code>/` then:

1. Insert a `providers` row (`supports_live=FALSE` until DEC-009).
2. Implement `ProviderAdapter` — return `NOT_AVAILABLE` for unimplemented ops (never fake success).
3. Load secrets via `SecretResolver` + `provider_account_id` — never store secrets in PostgreSQL.
4. Hosted/HPP only — PAN/CVV must never hit IMKAN APIs.
5. Register in `registry.ts`.
6. Copy `docs/providers/PROVIDER_CHECKLIST.md` to `docs/providers/<code>/CHECKLIST.md`.

Files to implement: `adapter.ts`, `credentials.ts`, `config.ts`, `http-client.ts`, `mappers.ts`, `webhook.ts`, `index.ts`.
