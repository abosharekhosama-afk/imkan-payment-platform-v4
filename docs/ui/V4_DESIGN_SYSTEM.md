# V4 Design System

**Location:** `apps/web/src/v4/design-system/`

## Tokens (`tokens.css`)

CSS variables for:

- Typography: Fraunces (display), Source Sans 3 (UI), IBM Plex Mono
- Surfaces, borders, text, accent (forest green — not purple-glow / cream-terracotta clichés)
- Status colors: active, pending, processing, succeeded, failed, cancelled, expired, past due, unpaid, sandbox, live, disabled
- Spacing scale (4/8), radii, shadow
- Dark theme via `[data-theme='dark']`

## Primitives (`components.tsx`)

Button, Field, StatusBadge, Alert, EmptyState, LoadingState, ErrorState, DataTable, Modal, ConfirmDialog, PageHeader (with breadcrumbs), ComingSoon

## Layout

- Persistent sidebar + sticky top bar (`layouts/AppShell.tsx`)
- Responsive collapse &lt; 960px
- Toast host (`hooks/useToast.tsx`)
- Error boundary (`components/ErrorBoundary.tsx`)

## Theme / i18n

- `theme/` — light/dark persistence
- `i18n/messages.ts` — EN/AR catalog (Appearance page switches `lang` + `dir`)
