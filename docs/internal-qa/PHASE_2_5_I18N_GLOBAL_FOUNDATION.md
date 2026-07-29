# Phase 2.5 — Global i18n Foundation

**Date:** 2026-06-24
**Status:** Complete
**TypeScript:** 0 errors | ESLint: 0 errors (117 pre-existing warnings unchanged)

---

## Problem statement

The previous i18n configuration declared 8 locales (`fa`, `en`, `ar`, `ch`, `de`, `es`, `ru`, `tu`) but only `fa` and `en` had complete translation files. The other six files were empty `{}` objects. This meant:

- Any request that resolved to `ar`, `de`, `es`, `ru`, `ch`, or `tu` would silently render with no text.
- `ch` and `tu` are not valid ISO 639-1 codes — the correct codes are `zh` (Chinese) and `tr` (Turkish).
- The locale cookie (`NEXT_LOCALE`) had no `maxAge`, `sameSite`, or `secure` attributes.
- There was no safe fallback if a message file was missing or corrupt.
- There were no shared helpers for locale detection, RTL detection, or cookie management — each route and component solved these ad-hoc.

---

## Changes

### `src/i18n/config.ts` — rewritten

Introduced a two-tier locale model:

| Set | Codes | Meaning |
|---|---|---|
| `activeLocales` | `fa`, `en` | Complete translations; served to users |
| `futureLocales` | `ar`, `tr`, `de`, `es`, `ru`, `zh` | Declared but not yet translated |
| `rtlLocales` | `fa`, `ar` | Require `dir="rtl"` layout |

Exported type guards: `isActiveLocale()`, `isLocale()`, `isRtlLocale()`.

Fixed ISO codes: `ch` → `zh`, `tu` → `tr`.

**To promote a future locale to active:**
1. Complete `src/i18n/messages/<code>.json`
2. Move the code from `futureLocales` to `activeLocales` in `config.ts`
3. Add a route tree under `src/app/<code>/` if the locale needs dedicated pages

---

### `src/lib/locale.ts` — rewritten

Server-only locale helper (`'use server'`).

| Before | After |
|---|---|
| Cookie name: `NEXT_LOCALE` | Cookie name: `tecpey_locale` |
| No `maxAge` | `maxAge: 1 year` |
| No `sameSite` | `sameSite: lax` |
| No `secure` | `secure: true` in production |
| Could return any `Locale` including future stubs | Only returns `ActiveLocale` |

---

### `src/i18n/request.ts` — updated

Added two safety layers:

1. `isActiveLocale` guard — if an inactive locale somehow leaks through `getUserLocale`, it is clamped to `defaultLocale` before the import.
2. `try/catch` around the dynamic `import()` — if a message file is missing or unreadable, the app falls back to `fa.json` instead of crashing.

---

### `src/lib/i18n-locale.ts` — new file

Edge-compatible locale utilities (no `"use server"`, no `next/headers`). Safe to import from middleware, API routes, and server components.

| Export | Purpose |
|---|---|
| `LOCALE_COOKIE_NAME` | Canonical cookie name `"tecpey_locale"` |
| `getLocaleFromRequest(req)` | Full detection chain: URL prefix → cookie → Accept-Language → default |
| `getSuggestedLocale(req)` | Non-binding suggestion for "switch language?" banners; returns `null` if user has a cookie |
| `getLocaleFromCookie(req)` | Read cookie only (edge-safe) |
| `setLocaleCookie(response, locale)` | Write cookie with correct attributes |
| `getDir(locale)` | Returns `"rtl"` or `"ltr"` for HTML `dir` attribute |
| `isRtlLocale(locale)` | Type guard re-exported from config |

**Locale detection priority** (in `getLocaleFromRequest`):
1. URL path prefix (`/en[/...]` → `"en"`)
2. `tecpey_locale` cookie (explicit user choice)
3. `Accept-Language` header (browser preference)
4. `defaultLocale` (`"fa"`)

**Geo/IP suggestion** is intentionally NOT implemented as forced locale. A `TODO(geo-suggestion)` comment marks exactly where to add it once a privacy-safe IP lookup is available (e.g., `x-vercel-ip-country` header). User cookie always overrides any suggestion.

---

### `src/components/seo/HtmlLangDir.tsx` — updated

Now uses `isRtlLocale()` from `@/i18n/config` instead of a hardcoded binary check. No visual change — behavior is identical for the current fa/en setup, but the component is forward-compatible with `ar` (also RTL) without code changes.

---

### `src/i18n/messages/zh.json`, `src/i18n/messages/tr.json` — created

Empty placeholder files (`{}`) with correct ISO 639-1 codes. These replace the previously misnamed `ch.json` and `tu.json`. The old files remain on disk but are no longer referenced by any locale config.

---

## Locale detection flow (full picture)

```
Request arrives
       │
       ▼
URL prefix? /en[/...] ──────────────────────────────► "en"
       │ no
       ▼
tecpey_locale cookie valid active locale? ──────────► that locale
       │ no
       ▼
Accept-Language header matches active locale? ───────► that locale
       │ no
       ▼
defaultLocale ──────────────────────────────────────► "fa"
```

---

## Cookie spec

| Attribute | Value |
|---|---|
| Name | `tecpey_locale` |
| Values | `fa` \| `en` (active only) |
| `maxAge` | 31 536 000 s (1 year) |
| `sameSite` | `lax` |
| `secure` | `true` in production, `false` in dev |
| `path` | `/` |

---

## What was NOT changed

- Route structure (`/` = FA, `/en/` = EN) — unchanged.
- UI design — unchanged.
- `fa.json` and `en.json` message files — unchanged.
- All existing `next-intl` hooks and components — unchanged.
- Old `ch.json` and `tu.json` files — left on disk, not referenced.
- No new locales were activated.

---

## Next steps (Phase 3+ i18n)

1. **Activate Arabic (`ar`):** Complete `ar.json`, add `ar` to `activeLocales`, add `src/app/ar/` route tree.
2. **Geo suggestion banner:** Implement `TODO(geo-suggestion)` in `getSuggestedLocale()` using `x-vercel-ip-country` or Cloudflare `CF-IPCountry` headers.
3. **Retire old cookie:** `NEXT_LOCALE` is no longer written. After one cookie TTL cycle (1 year), users will be fully migrated to `tecpey_locale`.
4. **Language switcher wiring:** Call `setUserLocale(locale)` from the navbar language selector to write the `tecpey_locale` cookie.
5. **`HtmlLangDir` SSR:** Move `lang`/`dir` attributes to the server-rendered `<html>` tag in `layout.tsx` to eliminate the client-side flash on first paint.
