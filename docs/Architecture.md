# TecPey — Architecture

## Overview

TecPey is a Next.js 15 App Router application with a clear separation between the public education/information platform (`tecpey.ir`) and the live trading exchange (`my.tecpey.ir`).

---

## Application Boundaries

```
┌─────────────────────────────────────────────────────────┐
│                     tecpey.ir                           │
│  Next.js 15 (App Router, RSC)                           │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Persian UI   │  │  English UI  │  │     API      │  │
│  │  (fa-IR RTL)  │  │  (en-US LTR) │  │   Routes     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                    (link / redirect)
                           │
┌─────────────────────────────────────────────────────────┐
│                  my.tecpey.ir                           │
│  Live Trading Exchange (separate application)           │
└─────────────────────────────────────────────────────────┘
```

---

## Directory Architecture

### App Router Layout Tree

```
src/app/
├── layout.tsx                # Root layout — RTL, fa-IR, IRANYekanX font
├── page.tsx                  # Persian landing page
├── not-found.tsx             # Persian 404
│
├── en/
│   ├── layout.tsx            # LTR wrapper (div[lang=en-US dir=ltr])
│   ├── page.tsx              # English landing
│   ├── not-found.tsx         # English 404
│   └── [all English routes]
│
├── academy/
│   ├── layout.tsx            # Academy shell layout
│   ├── page.tsx              # Academy hub
│   ├── term-[1-7]/page.tsx   # Individual term pages
│   ├── login/page.tsx        # Academy auth (login)
│   ├── signup/page.tsx       # Academy auth (signup)
│   ├── profile/page.tsx      # Student profile
│   ├── onboarding/page.tsx   # Profile creation flow
│   └── [feature pages]       # simulator, arena, mentor-coach, etc.
│
├── api/
│   ├── academy-auth/         # Login, register, logout, session
│   ├── academy/auth/         # Alternate auth routing
│   ├── community/            # Profile, hall of fame
│   ├── mentor-*/             # AI mentor endpoints
│   ├── notifications/        # Notification system
│   └── [other routes]
│
└── [public pages]            # about, faq, fees, markets, coins, etc.
```

---

## RTL / LTR Architecture

The root `layout.tsx` sets `<html lang="fa-IR" dir="rtl">`. This covers all Persian pages.

The `/en` subtree uses `src/app/en/layout.tsx` which wraps content in:
```tsx
<div lang="en-US" dir="ltr">{children}</div>
```

A `HtmlLangDir` client component runs on the client to update `document.documentElement.lang` and `dir` dynamically based on the URL path.

**Important:** Nested layouts in Next.js App Router cannot redefine `<html>` or `<body>` — only the root layout can. The English layout uses a `<div>` wrapper, not a full HTML document.

---

## Authentication Architecture

TecPey has two separate auth domains:

| Domain | Secret | Cookie | Purpose |
|--------|--------|--------|---------|
| Academy | `TECPEY_ACADEMY_AUTH_SECRET` | `tecpey_academy_session` | Student login |
| Session | `TECPEY_SESSION_SECRET` | `tecpey_session` | General session |
| Admin | `TECPEY_ADMIN_TOKEN` | `tecpey_admin_session` | Admin panel |

Each secret is independent — no fallback chains. Missing secrets in production fail closed (return `null`, block requests).

JWT tokens are created and verified using `jose`. All session cookies are `httpOnly`, `sameSite: lax`, and `secure` in production.

---

## API Security Layer

Every state-changing API route (`POST`, `PATCH`, `DELETE`) begins with:

```typescript
if (!verifyCsrfOrigin(req))
  return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
```

`verifyCsrfOrigin` checks the `Origin` header against `NEXT_PUBLIC_SITE_URL`. In production, if `NEXT_PUBLIC_SITE_URL` is not set, the function returns `false` (fail-closed).

---

## Design System

The enterprise design system lives in `src/app/globals.css` and provides:

| Token / Class | Purpose |
|--------------|---------|
| `--tp-primary`, `--tp-bg`, `--tp-text` | CSS custom properties |
| `.tp-card` | Unified card component |
| `.tp-btn-primary`, `.tp-btn-secondary` | Button system |
| `.tp-label` | Section label / eyebrow |
| `.tp-gradient-text` | Cyan gradient text |
| `.tp-badge`, `.tp-badge-*` | Badge variants |
| `.tp-alert-*` | Alert states (error, success, warn) |
| `.tp-empty` | Empty state component |
| `.tp-input` | Unified form input |
| `.skeleton` | Loading skeleton with wave animation |
| `.hover-lift`, `.hover-lift-sm` | Hover elevation |
| `.focus-ring` | Keyboard focus indicator |
| `.animate-slide-up`, `.animate-fade-in` | Page transitions |
| `.sticky-cta-bar` | Mobile CTA with safe-area inset |

---

## Data Layer

The database connection is managed in `src/lib/db.ts`. The module:

1. Reads `DATABASE_URL` from environment
2. Returns `null` (and logs an error in production) if missing or placeholder
3. Consumers must handle `null` gracefully

No ORM is used — SQL is constructed with parameterized queries via the PostgreSQL client.

---

## Deployment Architecture

```
Internet
    │
    ▼
Nginx (SSL termination, reverse proxy)
    │
    ├── / → Next.js (port 3000, PM2 or Docker)
    │
    └── Static assets → /public (served by Nginx directly)

PostgreSQL (local or managed, port 5432)
```

See [Deployment.md](./Deployment.md) for full setup instructions.
