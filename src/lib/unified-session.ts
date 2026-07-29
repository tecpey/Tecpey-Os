import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import { logger } from "./logger";
import {
  COOKIES,
  shouldUseSecureCookie,
  sessionMaxAge,
  sessionMaxAgeSeconds,
} from "./platform-config";
import { registerSession } from "./security/session-store";

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
  jti?: string;
};

export type UnifiedSessionRegistration = {
  deviceInfo?: string;
  ip?: string;
};

function unifiedSecret(): Uint8Array | null {
  const raw = process.env.TECPEY_SESSION_SECRET;
  if (raw && raw.length >= 24) return new TextEncoder().encode(raw);
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode(
      "tecpey-local-unified-session-dev-secret-please-set-env",
    );
  }
  logger.error(
    "[unified-session] TECPEY_SESSION_SECRET missing or too short — unified sessions disabled.",
  );
  return null;
}

export async function signUnifiedSession(
  data: UnifiedSessionData,
): Promise<string> {
  const key = unifiedSecret();
  if (!key) throw new Error("unified_session_secret_missing");
  const jti = crypto.randomUUID();
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
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(sessionMaxAge())
    .sign(key);
}

/** Extract JTI only after the caller has verified the same token when security matters. */
export function extractJtiFromToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    return typeof payload.jti === "string" ? payload.jti : null;
  } catch {
    return null;
  }
}

/** Extract expiry only after the caller has verified the same token when security matters. */
export function extractExpFromToken(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export async function verifyUnifiedSession(
  token: string | undefined,
): Promise<UnifiedSessionPayload | null> {
  if (!token) return null;
  const key = unifiedSecret();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    });
    if (payload.role !== "unified" || (payload.v as unknown) !== 1) return null;
    return {
      role: "unified",
      v: 1,
      accountId: typeof payload.accountId === "string" ? payload.accountId : null,
      studentId: typeof payload.studentId === "string" ? payload.studentId : null,
      email: typeof payload.email === "string" ? payload.email : null,
      displayName:
        typeof payload.displayName === "string" ? payload.displayName : null,
      username: typeof payload.username === "string" ? payload.username : null,
      jti: typeof payload.jti === "string" ? payload.jti : undefined,
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

/** @deprecated Route handlers must await setUnifiedSessionCookieAsync. */
export function setUnifiedSessionCookie(
  _response: NextResponse,
  _data: UnifiedSessionData,
): never {
  throw new Error("setUnifiedSessionCookie_async_required");
}

/**
 * Issue a replacement access cookie only after the new JTI has durable session
 * evidence. This prevents claim/profile updates from minting a cookie that the
 * canonical revocation authority immediately treats as missing or unverifiable.
 */
export async function setUnifiedSessionCookieAsync(
  response: NextResponse,
  data: UnifiedSessionData,
  registration: UnifiedSessionRegistration = {},
): Promise<void> {
  const userId = data.accountId ?? data.studentId;
  if (!userId) throw new Error("session_owner_missing");

  const token = await signUnifiedSession(data);
  const jti = extractJtiFromToken(token);
  const exp = extractExpFromToken(token);
  if (!jti || !exp) throw new Error("session_issue_failed");

  const registered = await registerSession({
    jti,
    userId,
    deviceInfo: (registration.deviceInfo ?? "session-claim-refresh").slice(0, 500),
    ip: (registration.ip ?? "unknown").slice(0, 80),
    expiresAt: new Date(exp * 1000),
  });
  if (!registered) throw new Error("session_registry_unavailable");

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
