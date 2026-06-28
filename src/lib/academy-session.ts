import { jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import { COOKIES } from "./platform-config";
import { UNIFIED_SESSION_COOKIE, verifyUnifiedSession } from "./unified-session";

export const STUDENT_SESSION_COOKIE = COOKIES.STUDENT_SESSION;
export const LEGACY_STUDENT_COOKIE = COOKIES.STUDENT_ID;

function sessionSecret() {
  const secret = process.env.TECPEY_SESSION_SECRET || process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret && secret.length >= 24) return new TextEncoder().encode(secret);
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode("tecpey-local-student-session-dev-secret-please-set-env");
  }
  return null;
}

export function isSessionConfigured() {
  return Boolean(sessionSecret());
}

export async function verifyStudentSessionToken(token?: string | null) {
  if (!token) return null;
  const key = sessionSecret();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.role !== "student" || typeof payload.sub !== "string") return null;
    return { studentId: payload.sub };
  } catch {
    return null;
  }
}

export async function getStudentSessionFromRequest(req: NextRequest) {
  const legacy = await verifyStudentSessionToken(req.cookies.get(STUDENT_SESSION_COOKIE)?.value);
  if (legacy) return legacy;
  // Phase 23: legacy cookie retired — fall back to unified cookie for new sessions
  const unified = await verifyUnifiedSession(req.cookies.get(UNIFIED_SESSION_COOKIE)?.value);
  if (unified?.studentId) return { studentId: unified.studentId };
  return null;
}

// Clears legacy student cookies from the browser on logout.
// Legacy cookies are no longer issued since Phase 23 but may still be present
// in browsers that logged in before the retirement.
export function clearStudentSessionCookie(response: NextResponse) {
  response.cookies.delete(STUDENT_SESSION_COOKIE);
  response.cookies.delete(LEGACY_STUDENT_COOKIE);
}
