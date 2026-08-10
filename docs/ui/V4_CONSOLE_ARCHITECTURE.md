# V4 Console Architecture (Phase 6.5)

**Status:** Implemented  
**Active entry:** `apps/web/src/main.tsx` → `src/v4/app/App.tsx`  
**Frozen Legacy:** `apps/web/src/legacy/main.legacy.tsx` (not imported)

## Stack

| Package | Version (resolved) |
|---|---|
| React | 19.2.x |
| react-router-dom | 7.18.x |
| Vite | 7.3.x |
| TypeScript | 5.9.x |
| Vitest | 3.2.x |
| Playwright | 1.54.x+ |

## Source tree

```
apps/web/src/
  main.tsx                 # V4 entry only
  legacy/                  # FROZEN — do not import
  v4/
    app/App.tsx
    router/                # re-export of routes
    routes/index.tsx
    layouts/               # AppShell + nav
    components/            # ErrorBoundary, etc.
    design-system/         # tokens, global CSS, primitives
    styles/                # style entry
    theme/                 # light/dark
    i18n/                  # message catalog
    api/client.ts          # centralized /api/v1 client + legacy ban
    api/endpoints.ts       # verified endpoint map
    features/*/api.ts      # feature API modules
    auth/AuthProvider.tsx
    permissions/           # Can + helpers
    rbac/Can.tsx
    hooks/useToast.tsx
    pages/                 # console screens
    public-checkout/       # /checkout/:token
    utils/
```

## Request path

```
UI page → feature/endpoints module → apiV1() → HTTP /api/v1/* → V4 services
```

No scattered `fetch('/api/v1/...')` in pages (pages use `v4.*` / feature APIs).  
`apiV1()` refuses Legacy MySQL API roots and frozen checkout paths.

## Auth / RBAC

- Session token in `localStorage` key `v4_session_token`
- Bootstrap: `GET /api/v1/auth/me`
- Nav + actions gated via `hasPermission` / `<Can />` (UX only)
- Backend RBAC remains authoritative

## Public checkout

- UI: `/checkout/:token`
- API: `/api/v1/checkout/:token` (+ session + payment)
- Rail: Payment Core → Provider Router → Sandbox
