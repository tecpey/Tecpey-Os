/**
 * Shared API validation helpers.
 *
 * Philosophy (Phase 20):
 *  - All public API routes must validate input at the boundary.
 *  - All error responses must use { ok: false, error: string, details?: unknown }.
 *  - All success responses must use { ok: true, ...payload }.
 *  - API responses are private and non-cacheable unless a route explicitly
 *    supplies a complete reviewed Cache-Control policy.
 *
 * Phase 21 will introduce Zod schemas tied to these validators.
 */

import { NextResponse } from "next/server";

// ── Standard response builders ────────────────────────────────────────────────

export const API_PRIVATE_RESPONSE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
});

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const normalized = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === normalized);
}

function responseHeaders(headers?: Record<string, string>): Record<string, string> {
  const explicit = headers ?? {};

  // An explicit Cache-Control value is a complete reviewed cache decision. Do
  // not combine a public policy with inherited `Pragma: no-cache`/`Expires: 0`,
  // which would make the override contradictory and browser-dependent.
  if (hasHeader(explicit, "cache-control")) return { ...explicit };

  return {
    ...API_PRIVATE_RESPONSE_HEADERS,
    ...explicit,
  };
}

export function apiOk<T extends Record<string, unknown>>(
  payload: T,
  status = 200,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    { ok: true, ...payload },
    { status, headers: responseHeaders(headers) },
  );
}

export function apiError(
  error: string,
  status: number,
  details?: unknown,
  headers?: Record<string, string>,
): NextResponse {
  const body: Record<string, unknown> = { ok: false, error };
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, {
    status,
    headers: responseHeaders(headers),
  });
}

// ── Common field validators ───────────────────────────────────────────────────

export const Validate = {
  email(value: unknown): string | null {
    const s = String(value ?? "").trim().toLowerCase().slice(0, 254);
    return /^\S+@\S+\.\S+$/.test(s) ? s : null;
  },

  password(value: unknown): string | null {
    const s = String(value ?? "");
    return s.length >= 10 && s.length <= 1024 ? s : null;
  },

  /** Safe displayable string: strips control chars, limits length. */
  text(value: unknown, min = 1, max = 255): string | null {
    const s = String(value ?? "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .trim()
      .slice(0, max);
    return s.length >= min ? s : null;
  },

  /** UUID v4 format check. */
  uuid(value: unknown): string | null {
    const s = String(value ?? "").toLowerCase().trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s)
      ? s
      : null;
  },

  /** Integer within inclusive range. */
  int(value: unknown, min: number, max: number): number | null {
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  },

  /** One of an allowed string literal set. */
  oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
    return allowed.includes(value as T) ? (value as T) : null;
  },
};

// ── Body size guard ───────────────────────────────────────────────────────────

/**
 * Header-level early rejection only. Routes that accept untrusted request bodies
 * must also bound parsed input fields or migrate to the governed streaming body
 * reader; a missing Content-Length header is not proof that the body is small.
 */
export function checkBodySize(contentLength: string | null, maxBytes = 32_768): boolean {
  if (!contentLength) return true;
  const parsed = Number(contentLength);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= maxBytes;
}

/** Standard 429 response with Retry-After header. */
export function apiRateLimited(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { ok: false, error: "rate_limited" },
    {
      status: 429,
      headers: responseHeaders({ "Retry-After": String(retryAfterSeconds) }),
    },
  );
}
