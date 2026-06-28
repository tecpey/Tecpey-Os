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

/**
 * Returns true if cookies should carry the Secure flag.
 * Reads TECPEY_COOKIE_SECURE env var or infers from NEXT_PUBLIC_SITE_URL.
 */
export function shouldUseSecureCookie(): boolean {
  if (process.env.TECPEY_COOKIE_SECURE === "true") return true;
  if (process.env.TECPEY_COOKIE_SECURE === "false") return false;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  if (siteUrl.startsWith("https://")) return true;
  if (siteUrl.startsWith("http://localhost") || siteUrl.startsWith("http://127.0.0.1")) return false;
  return false;
}

// ── Session expiry ────────────────────────────────────────────────────────────

/** Session max age as a JWT duration string (e.g. "30d"). */
export function sessionMaxAge(): string {
  return process.env.TECPEY_SESSION_MAX_AGE || "30d";
}

/** Session max age in seconds for the Set-Cookie maxAge attribute. */
export function sessionMaxAgeSeconds(): number {
  return Number(process.env.TECPEY_SESSION_MAX_AGE_SECONDS || 60 * 60 * 24 * 30);
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
