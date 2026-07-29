import { jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import { COOKIES } from "./platform-config";
import { UNIFIED_SESSION_COOKIE, verifyUnifiedSession } from "./unified-session";

export const ACADEMY_AUTH_COOKIE = COOKIES.ACADEMY_AUTH;

export type AcademyAuthSession = {
  accountId: string;
  email: string;
  displayName?: string;
  username?: string;
};

function authSecret() {
  const secret = process.env.TECPEY_ACADEMY_AUTH_SECRET || process.env.TECPEY_SESSION_SECRET || process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret && secret.length >= 24) return new TextEncoder().encode(secret);
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode("tecpey-local-academy-auth-dev-secret-please-set-env");
  }
  return null;
}

export function isAcademyAuthConfigured() {
  return Boolean(authSecret());
}

export function normalizeAcademyEmail(value: unknown) {
  return String(value || "").trim().toLowerCase().slice(0, 180);
}

export function normalizeAcademyUsername(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 32);
}

export function academyAccountIdFromEmail(email: string) {
  const safe = normalizeAcademyEmail(email);
  return `academy:${safe}`;
}

export async function verifyAcademyAuthToken(token?: string | null): Promise<AcademyAuthSession | null> {
  if (!token) return null;
  const key = authSecret();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.role !== "academy_user" || typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return {
      accountId: payload.sub,
      email: payload.email,
      displayName: typeof payload.displayName === "string" ? payload.displayName : undefined,
      username: typeof payload.username === "string" ? payload.username : undefined,
    };
  } catch {
    return null;
  }
}

export async function getAcademyAuthFromRequest(req: NextRequest) {
  const legacy = await verifyAcademyAuthToken(req.cookies.get(ACADEMY_AUTH_COOKIE)?.value);
  if (legacy) return legacy;
  // Phase 23: legacy cookie retired — fall back to unified cookie for new sessions
  const unified = await verifyUnifiedSession(req.cookies.get(UNIFIED_SESSION_COOKIE)?.value);
  if (unified?.accountId) {
    return {
      accountId: unified.accountId,
      email: unified.email ?? "",
      displayName: unified.displayName ?? undefined,
      username: unified.username ?? undefined,
    };
  }
  return null;
}

// Clears the legacy academy auth cookie from the browser on logout.
// The legacy cookie is no longer issued since Phase 23 but may still be present
// in browsers that logged in before the retirement.
export function clearAcademyAuthCookie(response: NextResponse) {
  response.cookies.delete(ACADEMY_AUTH_COOKIE);
}
