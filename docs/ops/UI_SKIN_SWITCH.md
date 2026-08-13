# UI skin switch (classic ↔ modern)

The merchant console supports two visual skins. **Nothing is deleted** — the original green “V4 fintech” look lives in `apps/web/src/v4/ui-classic/`.

## Skins

| Skin | Env value | Description |
|------|-----------|-------------|
| **modern** (default) | `VITE_UI_SKIN=modern` or unset | IMKAN navy + teal/gold, split login, updated shell |
| **classic** | `VITE_UI_SKIN=classic` | Original green sidebar, centered login, Fraunces font |

Switching is **build-time** (Vite bakes the env at `npm run build`). Redeploy the static web service after changing the variable.

## Quick switch

### Local development

```bash
# Modern (default)
npm run dev -w apps/web

# Classic
VITE_UI_SKIN=classic npm run dev -w apps/web
```

On Windows PowerShell:

```powershell
$env:VITE_UI_SKIN="classic"; npm run dev -w apps/web
```

### Render (imkan-payments-web)

1. Dashboard → **imkan-payments-web** → **Environment**
2. Add or edit:
   - `VITE_UI_SKIN` = `classic` or `modern`
3. **Manual Deploy** → Clear build cache & deploy (or push a commit)

Or in `render.yaml`:

```yaml
- key: VITE_UI_SKIN
  value: modern   # or classic
```

## What changes per skin

| Layer | Modern path | Classic archive |
|-------|-------------|-----------------|
| CSS tokens + layout | `design-system/tokens.css`, `global.css` | `ui-classic/design-system/` |
| App shell | `layouts/AppShell.tsx` | `ui-classic/layouts/AppShell.tsx` |
| Login / Signup | `pages/modern/` | `ui-classic/pages/` |
| Shared pages (dashboard, etc.) | Same React; styling from active CSS | Same |

Resolution is centralized in:

- `apps/web/src/v4/ui/skin.ts` — reads `VITE_UI_SKIN`
- `apps/web/src/v4/ui/load-styles.ts` — loads the correct `global.css`
- `apps/web/src/v4/layouts/index.ts` — picks `AppShell`
- `apps/web/src/v4/ui/auth-pages.tsx` — picks Login / Signup

## Restore classic permanently

1. Set `VITE_UI_SKIN=classic` and redeploy.
2. Or copy files from `ui-classic/` back into `design-system/` / `layouts/` (not recommended — use env switch instead).

## Customize modern only

Edit:

- `apps/web/src/v4/design-system/tokens.css` — colors, fonts, spacing
- `apps/web/src/v4/design-system/global.css` — layout classes (`.v4-*`)
- `apps/web/src/v4/pages/modern/` — auth screens
- `apps/web/src/v4/layouts/AppShell.tsx` — sidebar / topbar

Keep class names (`v4-btn`, `v4-card`, …) so existing pages keep working.

## Customize classic only

Edit files under `apps/web/src/v4/ui-classic/` — they are not used when `VITE_UI_SKIN=modern`.

## Troubleshooting

- **Wrong skin after deploy:** Confirm `VITE_UI_SKIN` on the **web** service (not API), then rebuild.
- **Flash of wrong styles:** Styles load from `main.tsx` via `ui/load-styles.ts`; ensure you did not re-import `design-system/global.css` elsewhere.
- **Mixed look:** Usually means a direct import of modern CSS while `classic` shell is active — remove duplicate CSS imports.
