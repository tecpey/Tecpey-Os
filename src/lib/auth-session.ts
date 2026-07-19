// Canonical session helper — edge-compatible (no "use server", no "next/headers").
// Reads the unified session cookie first and normalizes legacy cookies only for
// non-sensitive compatibility reads. Security-sensitive callers require a
// registered unified session and a fresh fail-closed revocation decision.

import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { logger } from "./logger";
import { COOKIES } from "./platform-config";
import { UNIFIED_SESSION_COOKIE, verifyUnifiedSession } from "./unified-session";
import { isJtiRevoked, isJtiRevokedStrict } from "./security/jti-store";
import { hasAdminAccess } from "./admin-auth";

const JTI_CACHE_TTL_MS = 30_000;
const JTI_CACHE_MAX = 2_000;
type JtiCacheEntry = { revoked: boolean; ts: number };
const jtiCache = new Map<string, JtiCacheEntry>();

function pruneJtiCache(): void {
  if (jtiCache.size <= JTI_CACHE_MAX) return;
  const cutoff = Date.now() - JTI_CACHE_TTL_MS;
  for (const [key, value] of jtiCache) {
    if (value.ts < cutoff) jtiCache.delete(key);
    if (jtiCache.size <= JTI_CACHE_MAX) break;
  }
}

/**
 * Strict checks never trust a cached allow from a prior non-strict request.
 * A fresh strict backend decision is required; only a cached revoked=true result
 * may short-circuit because deny evidence is safe to reuse for the short TTL.
 */
async function checkJtiRevoked(jti: string, strict = false): Promise<boolean> {
  const cached = jtiCache.get(jti);
  const cacheFresh = Boolean(cached && Date.now() - cached.ts < JTI_CACHE_TTL_MS);

  if (strict) {
    if (cacheFresh && cached?.revoked) return true;
    const revoked = await isJtiRevokedStrict(jti);
    pruneJtiCache();
    if (revoked) jtiCache.set(jti, { revoked: true, ts: Date.now() });
    else jtiCache.delete(jti);
    return revoked;
  }

  if (cacheFresh && cached) return cached.revoked;
  const revoked = await isJtiRevoked(jti);
  pruneJtiCache();
  jtiCache.set(jti, { revoked, ts: Date.now() });
  return revoked;
}

export type CanonicalSession = {
  userId: string | null;
  studentId: string | null;
  academyAccountId: string | null;
  role: "academy_user" | "student" | "user" | "guest";
  email: string | null;
  displayName: string | null;
  username: string | null;
  isAcademyUser: boolean;
  isAdmin: boolean;
};

function guestSession(): CanonicalSession {
  return {
    userId: null,
    studentId: null,
    academyAccountId: null,
    role: "guest",
    email: null,
    displayName: null,
    username: null,
    isAcademyUser: false,
    isAdmin: false,
  };
}

function academyAuthKey(): Uint8Array | null {
  const raw = process.env.TECPEY_ACADEMY_AUTH_SECRET;
  if (raw && raw.length >= 24) return new TextEncoder().encode(raw);
  if (process.env.NODE_ENV === "production") {
    logger.error("[auth] TECPEY_ACADEMY_AUTH_SECRET missing or too short — academy auth disabled.");
    return null;
  }
  return new TextEncoder().encode("tecpey-local-academy-auth-dev-secret-please-set-env");
}

function sessionKey(): Uint8Array | null {
  const raw = process.env.TECPEY_SESSION_SECRET;
  if (raw && raw.length >= 24) return new TextEncoder().encode(raw);
  if (process.env.NODE_ENV === "production") {
    logger.error("[auth] TECPEY_SESSION_SECRET missing or too short — student session auth disabled.");
    return null;
  }
  return new TextEncoder().encode("tecpey-local-student-session-dev-secret-please-set-env");
}

type AcademyAuthResult = {
  accountId: string;
  email: string;
  displayName: string;
  username: string;
};

async function verifyAcademyAuth(token: string | undefined): Promise<AcademyAuthResult | null> {
  if (!token) return null;
  const key = academyAuthKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (
      payload.role !== "academy_user" ||
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string"
    ) return null;
    return {
      accountId: payload.sub,
      email: payload.email,
      displayName: typeof payload.displayName === "string" ? payload.displayName : "",
      username: typeof payload.username === "string" ? payload.username : "",
    };
  } catch {
    return null;
  }
}

async function verifyStudentSession(token: string | undefined): Promise<{ studentId: string } | null> {
  if (!token) return null;
  const key = sessionKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.role !== "student" || typeof payload.sub !== "string") return null;
    return { studentId: payload.sub };
  } catch {
    return null;
  }
}

async function verifyUserSession(token: string | undefined): Promise<{ userId: string } | null> {
  if (!token) return null;
  const key = sessionKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.role === "student" || payload.role === "academy_user") return null;
    if (typeof payload.sub !== "string") return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

export async function getCanonicalSession(
  req: NextRequest,
  options?: { strictRevocation?: boolean },
): Promise<CanonicalSession> {
  const strict = options?.strictRevocation === true;
  const unified = await verifyUnifiedSession(req.cookies.get(UNIFIED_SESSION_COOKIE)?.value);

  if (unified) {
    if (strict && !unified.jti) {
      logger.warn("[auth-session] strict session missing jti — rejecting");
      return guestSession();
    }

    if (unified.jti) {
      try {
        const revoked = await checkJtiRevoked(unified.jti, strict);
        if (revoked) {
          logger.info("[auth-session] jti revoked — rejecting session", {
            jti: unified.jti,
            strict,
          });
          return guestSession();
        }
      } catch (err) {
        if (strict) {
          logger.warn("[auth-session] strict revocation check failed — blocking", {
            err: String(err),
          });
          return guestSession();
        }
        logger.warn("[auth-session] non-strict revocation check failed — allowing", {
          err: String(err),
        });
      }
    }

    return {
      userId: null,
      studentId: unified.studentId,
      academyAccountId: unified.accountId,
      role: unified.studentId ? "student" : "academy_user",
      email: unified.email,
      displayName: unified.displayName,
      username: unified.username,
      isAcademyUser: Boolean(unified.accountId),
      isAdmin: await hasAdminAccess(req),
    };
  }

  // Security-sensitive operations do not accept legacy unregistered cookies.
  if (strict) return guestSession();

  const [academyAuth, studentSession, userSession] = await Promise.all([
    verifyAcademyAuth(req.cookies.get(COOKIES.ACADEMY_AUTH)?.value),
    verifyStudentSession(req.cookies.get(COOKIES.STUDENT_SESSION)?.value),
    verifyUserSession(req.cookies.get(COOKIES.USER_SESSION)?.value),
  ]);

  const role = academyAuth
    ? "academy_user"
    : studentSession
      ? "student"
      : userSession
        ? "user"
        : "guest";

  return {
    userId: userSession?.userId ?? null,
    studentId: studentSession?.studentId ?? null,
    academyAccountId: academyAuth?.accountId ?? null,
    role,
    email: academyAuth?.email ?? null,
    displayName: academyAuth?.displayName ?? null,
    username: academyAuth?.username ?? null,
    isAcademyUser: Boolean(academyAuth),
    isAdmin: await hasAdminAccess(req),
  };
}
