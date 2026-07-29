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
  if (
    siteUrl.startsWith("http://localhost") ||
    siteUrl.startsWith("http://127.0.0.1")
  ) {
    return false;
  }
  return false;
}

// ── Session expiry ────────────────────────────────────────────────────────────

/**
 * Access credentials must not outlive the browser cookie that carries them.
 * Four hours is the hard ceiling; deployments may configure a shorter lifetime.
 */
export const ACCESS_SESSION_MAX_AGE_SECONDS = 4 * 60 * 60;
const ACCESS_SESSION_MIN_AGE_SECONDS = 5 * 60;

function parseDurationSeconds(value: string | undefined): number | null {
  const raw = value?.trim();
  if (!raw) return null;
  const match = /^(\d+)(s|m|h|d)$/.exec(raw);
  if (!match) return null;
  const amount = Number(match[1]);
  const multiplier =
    match[2] === "s"
      ? 1
      : match[2] === "m"
        ? 60
        : match[2] === "h"
          ? 60 * 60
          : 24 * 60 * 60;
  return Number.isSafeInteger(amount) ? amount * multiplier : null;
}

function configuredSessionMaxAgeSeconds(): number | null {
  const explicitSeconds = process.env.TECPEY_SESSION_MAX_AGE_SECONDS?.trim();
  if (explicitSeconds) {
    const parsed = Number(explicitSeconds);
    return Number.isFinite(parsed) ? Math.floor(parsed) : null;
  }
  return parseDurationSeconds(process.env.TECPEY_SESSION_MAX_AGE);
}

/** Session max age in seconds, bounded to 5 minutes–4 hours. */
export function sessionMaxAgeSeconds(): number {
  const configured = configuredSessionMaxAgeSeconds();
  if (configured === null) return ACCESS_SESSION_MAX_AGE_SECONDS;
  return Math.min(
    ACCESS_SESSION_MAX_AGE_SECONDS,
    Math.max(ACCESS_SESSION_MIN_AGE_SECONDS, configured),
  );
}

/** JWT duration derived from the exact cookie lifetime authority. */
export function sessionMaxAge(): string {
  return `${sessionMaxAgeSeconds()}s`;
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
