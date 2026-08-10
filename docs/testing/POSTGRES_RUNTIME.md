# PostgreSQL Runtime — Dev/Test vs Target

| Item | Value |
|---|---|
| **Production / compose target** | `postgres:16-alpine` (PostgreSQL **16**) — `docker-compose.yml` |
| **Dev/Test embedded package** | `embedded-postgres@16.14.0-beta.17` (pinned, no caret) |
| **Embedded major version** | **16** (aligned with target major) |
| **Role of embedded-postgres** | Development/Test runtime only |
| **Not used for** | Production architecture, production data, production readiness claims |

## Compatibility policy

- Prefer embedded package tags whose **major** matches the compose target (`16.x`).
- Do **not** use SQLite, MySQL, or in-memory mocks as a substitute PostgreSQL engine for V4 verification.
- Success of embedded verification ≠ Production Ready.
- If embedded binaries cannot provide a compatible real PostgreSQL major, mark runtime verification **BLOCKED** (do not change the engine).

## How to verify

```bash
npm run test:foundation:pg
```

Results are recorded in `docs/testing/POSTGRES_RUNTIME_VERIFICATION.md`.
