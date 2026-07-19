/**
 * Centralized platform configuration.
 * Single source of truth for cookie names, JWT settings, and platform metadata.
 * Import from here instead of scattering process.env reads across lib files.
 */

// ── Cookie names ──────────────────────────────────────────────────────────────

export const COOKIES = {
  /** Unified JWT session — the only cookie issued since Phase 23. */
  SESSION: "tecpey_session",
  /** Legacy academy auth cookie — read-only fallback, no longer issued. */
  ACADEMY_AUTH: "tecpey_academy_auth",
  /** Legacy student session cookie — read-only fallback, no longer issued. */
  STUDENT_SESSION: "tecpey_student_session",
  /** Deprecated legacy student ID cookie — cleared on logout. */
  STUDENT_ID: "tecpey_student_id",
  /** Market/platform user session — legacy, read-only fallback. */
  USER_SESSION: "user_session",
} as const;

export type CookieName = (typeof COOKIES)[keyof typeof COOKIES];

// ── Cookie security ───────────────────────────────────────────────────────────

export function shouldUseSecureCookie(): boolean {
  if (process.env.TECPEY_COOKIE_SECURE === "true") return true;
  if (process.env.TECPEY_COOKIE_SECURE === "false") return false;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  if (siteUrl.startsWith("https://")) return true;
  if (
    siteUrl.startsWith("http://localhost") ||
    siteUrl.startsWith("http://127.0.0.1")
  ) {
    return false;
  }
  return false;
}

// ── Access-session expiry ─────────────────────────────────────────────────────

/** Hard upper bound for a copied access JWT, independent of cookie retention. */
export const ACCESS_SESSION_MAX_AGE_SECONDS = 4 * 60 * 60;

/**
 * Configurable access-session lifetime, capped at four hours. The refresh-token
 * family is the long-lived authority; an access JWT may never inherit a 30-day
 * browser-session lifetime.
 */
export function accessSessionMaxAgeSeconds(): number {
  const parsed = Number(
    process.env.TECPEY_ACCESS_SESSION_MAX_AGE_SECONDS ||
      ACCESS_SESSION_MAX_AGE_SECONDS,
  );
  if (!Number.isSafeInteger(parsed) || parsed < 5 * 60) {
    return ACCESS_SESSION_MAX_AGE_SECONDS;
  }
  return Math.min(parsed, ACCESS_SESSION_MAX_AGE_SECONDS);
}

/** @deprecated Access JWTs must use accessSessionMaxAgeSeconds(). */
export function sessionMaxAge(): string {
  return `${accessSessionMaxAgeSeconds()}s`;
}

/** @deprecated Access cookies must use accessSessionMaxAgeSeconds(). */
export function sessionMaxAgeSeconds(): number {
  return accessSessionMaxAgeSeconds();
}

// ── Platform metadata ─────────────────────────────────────────────────────────

export const PLATFORM = {
  NAME: "TecPey",
  SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || "https://tecpey.ir",
  API_BACKEND_URL: process.env.NEXT_PUBLIC_API_BACKEND_URL || "",
  /** Internal ID of the default tenant (single-tenant mode, Phase 24). */
  DEFAULT_TENANT_ID: "tecpey",
  /** Internal ID of the default workspace inside the default tenant. */
  DEFAULT_WORKSPACE_ID: "main",
} as const;
