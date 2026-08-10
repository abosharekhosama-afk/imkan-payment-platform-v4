# Legacy V3 Freeze Note

**Status:** Feature-frozen (DEC-014)

- Legacy MySQL + `/v1` routes remain available for compatibility.
- Phase 5 (and subsequent V4 phases) must not expand legacy payment/provider surfaces.
- New provider work belongs exclusively on PostgreSQL + `/api/v1` (Provider Router + adapters).
- Hygiene-only changes to legacy docs/flags are allowed; no new legacy capabilities.

## Phase 6.5 console cutover

- Active merchant UI is the **V4 console** (`apps/web/src/v4/**` via `src/main.tsx`).
- Pre–6.5 monolith preserved at `apps/web/src/legacy/main.legacy.tsx` — **not imported**, not deleted.
- Active V4 UI must not call Legacy `/v1` (enforced by `tests/phase6_5-v4-legacy-guard.test.ts`).
- Legacy backend `/v1` + MySQL remain frozen; do not expand.
