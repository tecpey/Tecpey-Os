/**
 * Unified session — single JWT cookie replacing the legacy multi-cookie system.
 *
 * Cookie: tecpey_session (COOKIES.SESSION)
 * Secret: TECPEY_SESSION_SECRET
 * Role claim: "unified" — distinguishes from legacy "student" / "academy_user" tokens
 *
 * Phase 22: Introduced alongside legacy cookies.
 * Phase 23: Legacy cookies retired — only tecpey_session is issued on new logins.
 */

import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import { logger } from "./logger";
import { COOKIES, shouldUseSecureCookie, sessionMaxAge, sessionMaxAgeSeconds } from "./platform-config";

/** Cookie name for the unified session. Re-exported for backward compatibility. */
export const UNIFIED_SESSION_COOKIE = COOKIES.SESSION;

export type UnifiedSessionData = {
  accountId: string | null;
  studentId: string | null;
  email: string | null;
  displayName: string | null;
  username: string | null;
};

export type UnifiedSessionPayload = UnifiedSessionData & {
  role: "unified";
  v: 1;
};

function unifiedSecret(): Uint8Array | null {
  const raw =
    process.env.TECPEY_SESSION_SECRET ||
    process.env.TECPEY_ACADEMY_AUTH_SECRET ||
    process.env.JWT_SECRET;
  if (raw && raw.length >= 24) return new TextEncoder().encode(raw);
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode("tecpey-local-unified-session-dev-secret-please-set-env");
  }
  logger.error("[unified-session] TECPEY_SESSION_SECRET missing or too short — unified sessions disabled.");
  return null;
}

export async function signUnifiedSession(data: UnifiedSessionData): Promise<string> {
  const key = unifiedSecret();
  if (!key) throw new Error("unified_session_secret_missing");
  return new SignJWT({
    role: "unified" as const,
    v: 1 as const,
    accountId: data.accountId,
    studentId: data.studentId,
    email: data.email,
    displayName: data.displayName,
    username: data.username,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(data.studentId ?? data.accountId ?? "anon")
    .setIssuedAt()
    .setExpirationTime(sessionMaxAge())
    .sign(key);
}

export async function verifyUnifiedSession(
  token: string | undefined,
): Promise<UnifiedSessionPayload | null> {
  if (!token) return null;
  const key = unifiedSecret();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.role !== "unified" || (payload.v as unknown) !== 1) return null;
    return {
      role: "unified",
      v: 1,
      accountId: typeof payload.accountId === "string" ? payload.accountId : null,
      studentId: typeof payload.studentId === "string" ? payload.studentId : null,
      email: typeof payload.email === "string" ? payload.email : null,
      displayName: typeof payload.displayName === "string" ? payload.displayName : null,
      username: typeof payload.username === "string" ? payload.username : null,
    };
  } catch {
    return null;
  }
}

export async function getUnifiedSessionFromRequest(
  req: NextRequest,
): Promise<UnifiedSessionPayload | null> {
  return verifyUnifiedSession(req.cookies.get(UNIFIED_SESSION_COOKIE)?.value);
}

export function setUnifiedSessionCookie(response: NextResponse, data: UnifiedSessionData): void {
  signUnifiedSession(data).then((token) => {
    response.cookies.set(UNIFIED_SESSION_COOKIE, token, {
      path: "/",
      httpOnly: true,
      secure: shouldUseSecureCookie(),
      sameSite: "lax",
      maxAge: sessionMaxAgeSeconds(),
    });
  }).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[unified-session] failed to sign session cookie", { error: msg });
  });
}

/** Async version — prefer this over setUnifiedSessionCookie in route handlers. */
export async function setUnifiedSessionCookieAsync(
  response: NextResponse,
  data: UnifiedSessionData,
): Promise<void> {
  const token = await signUnifiedSession(data);
  response.cookies.set(UNIFIED_SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: "lax",
    maxAge: sessionMaxAgeSeconds(),
  });
}

export function clearUnifiedSessionCookie(response: NextResponse): void {
  response.cookies.delete(UNIFIED_SESSION_COOKIE);
}
