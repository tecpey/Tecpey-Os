// Edge-compatible locale utilities — no "use server", no "next/headers".
// Safe to import from middleware, API routes, and server components alike.

import type { NextRequest } from "next/server";
import {
  type ActiveLocale,
  defaultLocale,
  isActiveLocale,
  isRtlLocale,
  rtlLocales,
} from "@/i18n/config";

export { isRtlLocale, rtlLocales };

// ── Cookie ────────────────────────────────────────────────────────────────────

export const LOCALE_COOKIE_NAME = "tecpey_locale";
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// ── Locale detection ──────────────────────────────────────────────────────────

/**
 * Determine the best active locale for an incoming request.
 *
 * Priority:
 *   1. URL path prefix  (/en → "en"; everything else → "fa" via default)
 *   2. tecpey_locale cookie  (explicit user choice)
 *   3. Accept-Language header  (browser preference)
 *   4. defaultLocale ("fa")
 *
 * Geo/IP is intentionally NOT used to force a locale. See getSuggestedLocale().
 */
export function getLocaleFromRequest(req: NextRequest): ActiveLocale {
  const { pathname } = req.nextUrl;

  // 1. URL path prefix — current routing convention: /en[/...] = English.
  if (pathname.startsWith("/en/") || pathname === "/en") return "en";

  // 2. Explicit user cookie.
  const cookieVal = req.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (isActiveLocale(cookieVal)) return cookieVal;

  // 3. Accept-Language header.
  const acceptLang = req.headers.get("accept-language");
  if (acceptLang) {
    const fromHeader = parseAcceptLanguage(acceptLang);
    if (fromHeader) return fromHeader;
  }

  return defaultLocale;
}

/**
 * Return a non-binding locale suggestion (for a "switch language?" banner).
 * Returns null if the user already has an explicit cookie set.
 *
 * This is NOT geo-IP forcing — the user's own choice always wins.
 *
 * TODO(geo-suggestion): add a privacy-safe geo-IP lookup here once wired up.
 *   Expected shape:
 *     const countryCode = req.headers.get("x-vercel-ip-country") ?? null;
 *     const geoLocale = countryToLocale(countryCode);
 *     if (geoLocale) return geoLocale;
 */
export function getSuggestedLocale(req: NextRequest): ActiveLocale | null {
  // If the user already made a choice, don't suggest a different one.
  const cookieVal = req.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (isActiveLocale(cookieVal)) return null;

  const acceptLang = req.headers.get("accept-language");
  if (acceptLang) return parseAcceptLanguage(acceptLang);

  return null;
}

/**
 * Read the tecpey_locale cookie from an incoming NextRequest (edge-safe).
 * Returns null if absent or not an active locale.
 */
export function getLocaleFromCookie(req: NextRequest): ActiveLocale | null {
  const val = req.cookies.get(LOCALE_COOKIE_NAME)?.value;
  return isActiveLocale(val) ? val : null;
}

/**
 * Write the locale cookie onto a NextResponse (or any object with a cookies.set method).
 * secure: true in production, sameSite: lax, maxAge: 1 year.
 */
export function setLocaleCookie(
  response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } },
  locale: ActiveLocale,
): void {
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

// ── RTL helpers ───────────────────────────────────────────────────────────────

/** Returns true when `locale` requires a right-to-left layout. */
export { isRtlLocale as isRtl };

/** Return "rtl" or "ltr" for use in HTML dir attribute. */
export function getDir(locale: string): "rtl" | "ltr" {
  return isRtlLocale(locale) ? "rtl" : "ltr";
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseAcceptLanguage(header: string): ActiveLocale | null {
  // Parse "fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7"
  // Extract language tags in preference order and return the first active locale.
  const tags = header.split(",").map((s) => {
    const [tag] = s.trim().split(";");
    return tag.trim().toLowerCase();
  });
  for (const tag of tags) {
    const lang = tag.split("-")[0]; // "fa-IR" → "fa"
    if (isActiveLocale(lang)) return lang;
  }
  return null;
}
