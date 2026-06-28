// Canonical session helper — edge-compatible (no "use server", no "next/headers").
// Reads all active auth cookies and returns one normalized CanonicalSession.
//
// TODO(cookie-migration): Three cookies coexist during this migration period:
//   - tecpey_academy_auth   (academy login JWT, role=academy_user)
//   - tecpey_student_session (student profile JWT, role=student)
//   - user_session           (market/platform user JWT)
// Once all legacy cookies are retired, collapse into a single unified JWT.

import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { logger } from "./logger";
import { UNIFIED_SESSION_COOKIE, verifyUnifiedSession } from "./unified-session";

// ── Cookie names ─────────────────────────────────────────────────────────────

export const COOKIE_ACADEMY_AUTH = "tecpey_academy_auth";
export const COOKIE_STUDENT_SESSION = "tecpey_student_session";
export const COOKIE_USER_SESSION = "user_session";

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

async function verifyAcademyAuth(
  token: string | undefined,
): Promise<AcademyAuthResult | null> {
  if (!token) return null;
  const key = academyAuthKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (
      payload.role !== "academy_user" ||
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string"
    )
      return null;
    return {
      accountId: payload.sub,
      email: payload.email,
      displayName:
        typeof payload.displayName === "string" ? payload.displayName : "",
      username:
        typeof payload.username === "string" ? payload.username : "",
    };
  } catch {
    return null;
  }
}

async function verifyStudentSession(
  token: string | undefined,
): Promise<{ studentId: string } | null> {
  if (!token) return null;
  const key = sessionKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.role !== "student" || typeof payload.sub !== "string")
      return null;
    return { studentId: payload.sub };
  } catch {
    return null;
  }
}

async function verifyUserSession(
  token: string | undefined,
): Promise<{ userId: string } | null> {
  if (!token) return null;
  const key = sessionKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    // Guard against cross-cookie token reuse — academy/student JWTs share the
    // same signing key but carry a distinct role claim.
    if (payload.role === "student" || payload.role === "academy_user")
      return null;
    if (typeof payload.sub !== "string") return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

function checkAdminAccess(req: NextRequest): boolean {
  const token = process.env.TECPEY_ADMIN_TOKEN;
  if (!token || token.length < 24) return false;
  if (req.headers.get("x-tecpey-admin-token") === token) return true;
  return req.cookies.get("tecpey_admin_session")?.value === token;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getCanonicalSession(
  req: NextRequest,
): Promise<CanonicalSession> {
  // Prefer unified cookie — set by Phase 22+ login flows.
  const unified = await verifyUnifiedSession(req.cookies.get(UNIFIED_SESSION_COOKIE)?.value);
  if (unified) {
    return {
      userId: null,
      studentId: unified.studentId,
      academyAccountId: unified.accountId,
      role: unified.studentId ? "student" : "academy_user",
      email: unified.email,
      displayName: unified.displayName,
      username: unified.username,
      isAcademyUser: Boolean(unified.accountId),
      isAdmin: checkAdminAccess(req),
    };
  }

  // Fall back to legacy per-cookie reads (Phase 21 and earlier sessions).
  const [academyAuth, studentSession, userSession] = await Promise.all([
    verifyAcademyAuth(req.cookies.get(COOKIE_ACADEMY_AUTH)?.value),
    verifyStudentSession(req.cookies.get(COOKIE_STUDENT_SESSION)?.value),
    verifyUserSession(req.cookies.get(COOKIE_USER_SESSION)?.value),
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
    isAdmin: checkAdminAccess(req),
  };
}

/** True when either an academy auth or a student session cookie is present. */
export function isAnyAcademySession(session: CanonicalSession): boolean {
  return session.isAcademyUser || Boolean(session.studentId);
}
