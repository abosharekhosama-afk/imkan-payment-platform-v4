# V4 Legacy UI Cutover

## Preserved (frozen)

| Path | Notes |
|---|---|
| `apps/web/src/legacy/main.legacy.tsx` | Byte-preserved copy of pre–6.5 monolith (+ freeze banner) |
| `apps/web/src/legacy/FROZEN.md` | Isolation rules |
| `apps/web/src/style.css` | Legacy stylesheet (unused by V4 entry) |

**Not deleted.** Not imported by `src/main.tsx` or `src/v4/**`.

## Active console

| Before | After |
|---|---|
| Tab monolith calling `/v1/*` | Modular V4 shell calling `/api/v1` only |
| `/checkout/public/:token` | `/checkout/:token` → `/api/v1/checkout/:token` |
| Legacy login toggle | V4 login only |
| Refund/balance/settlement tabs live on MySQL | Coming-soon placeholders |

## Guard

`tests/phase6_5-v4-legacy-guard.test.ts` fails if active V4 sources call Legacy MySQL `/v1` paths or frozen checkout URLs.
