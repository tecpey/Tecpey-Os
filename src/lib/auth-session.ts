// Canonical session helper — edge-compatible (no "use server", no "next/headers").
// Reads all active auth cookies and returns one normalized CanonicalSession.
//
// Phase 23: Legacy cookies (tecpey_academy_auth, tecpey_student_session, user_session)
// are no longer issued on new logins. They are still read here as a fallback so that
// existing browser sessions continue to work until their 30-day JWT expires.
// Phase 24: Cookie names centralized in platform-config.ts.

import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { logger } from "./logger";
import { COOKIES } from "./platform-config";
import { UNIFIED_SESSION_COOKIE, verifyUnifiedSession } from "./unified-session";
import { isJtiRevoked } from "./security/jti-store";
import { hasAdminAccess } from "./admin-auth";

// ── jti revocation cache ──────────────────────────────────────────────────────
// 30-second in-memory cache per jti to avoid a Redis round-trip on every request.
// Revoked tokens remain cached as "revoked" for the TTL; allowed tokens as "allowed".
// Cache is intentionally small — only the last N jtis seen on this instance.

const JTI_CACHE_TTL_MS = 30_000;
const JTI_CACHE_MAX = 2_000;
type JtiCacheEntry = { revoked: boolean; ts: number };
const jtiCache = new Map<string, JtiCacheEntry>();

function pruneJtiCache(): void {
  if (jtiCache.size <= JTI_CACHE_MAX) return;
  const cutoff = Date.now() - JTI_CACHE_TTL_MS;
  for (const [k, v] of jtiCache) {
    if (v.ts < cutoff) jtiCache.delete(k);
    if (jtiCache.size <= JTI_CACHE_MAX) break;
  }
}

async function checkJtiRevoked(jti: string): Promise<boolean> {
  const cached = jtiCache.get(jti);
  if (cached && Date.now() - cached.ts < JTI_CACHE_TTL_MS) {
    return cached.revoked;
  }
  const revoked = await isJtiRevoked(jti);
  pruneJtiCache();
  jtiCache.set(jti, { revoked, ts: Date.now() });
  return revoked;
}

// ── Normalized session type ───────────────────────────────────────────────────

export type CanonicalSession = {
  /** Market/platform user ID from user_session JWT (sub claim). */
  userId: string | null;
  /** Academy student profile ID from tecpey_student_session JWT. */
  studentId: string | null;
  /** Internal academy account ID from tecpey_academy_auth JWT (format "academy:email"). */
  academyAccountId: string | null;
  /** Highest-privilege role present across all valid cookies. */
  role: "academy_user" | "student" | "user" | "guest";
  /** Email address — sourced from academy auth JWT only, NOT from user_session. */
  email: string | null;
  /** Display name from academy auth JWT. */
  displayName: string | null;
  /** Username from academy auth JWT. */
  username: string | null;
  /** True when tecpey_academy_auth JWT is valid and carries role=academy_user. */
  isAcademyUser: boolean;
  /** True when a valid admin token header or admin session cookie is present. */
  isAdmin: boolean;
};

// ── Key resolution ────────────────────────────────────────────────────────────

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

// ── Individual cookie verifiers ───────────────────────────────────────────────

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
    // Guard against cross-cookie token reuse — academy/student JWTs share the
    // same signing key but carry a distinct role claim.
    if (payload.role === "student" || payload.role === "academy_user") return null;
    if (typeof payload.sub !== "string") return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getCanonicalSession(req: NextRequest): Promise<CanonicalSession> {
  // Prefer unified cookie — set by Phase 22+ login flows.
  const unified = await verifyUnifiedSession(req.cookies.get(UNIFIED_SESSION_COOKIE)?.value);
  if (unified) {
    // Phase 35: jti revocation check (30-second in-memory cache)
    if (unified.jti) {
      try {
        const revoked = await checkJtiRevoked(unified.jti);
        if (revoked) {
          logger.info("[auth-session] jti revoked — rejecting session", { jti: unified.jti });
          return {
            userId: null, studentId: null, academyAccountId: null,
            role: "guest", email: null, displayName: null, username: null,
            isAcademyUser: false, isAdmin: false,
          };
        }
      } catch (err) {
        // Redis unavailable — allow (graceful degrade)
        logger.warn("[auth-session] jti check failed — allowing", { err: String(err) });
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

  // Fall back to legacy per-cookie reads for sessions created before Phase 22.
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
