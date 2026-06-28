import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const STUDENT_SESSION_COOKIE = "tecpey_student_session";
export const LEGACY_STUDENT_COOKIE = "tecpey_student_id";

type StudentSessionPayload = {
  sub: string;
  role: "student";
};

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

export async function signStudentSession(studentId: string) {
  const key = sessionSecret();
  if (!key) throw new Error("student_session_secret_missing");
  return new SignJWT({ role: "student" } satisfies Omit<StudentSessionPayload, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(studentId)
    .setIssuedAt()
    .setExpirationTime(process.env.TECPEY_SESSION_MAX_AGE || "30d")
    .sign(key);
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
  return verifyStudentSessionToken(req.cookies.get(STUDENT_SESSION_COOKIE)?.value);
}

export async function getStudentSessionFromServerCookies() {
  const cookieStore = await cookies();
  return verifyStudentSessionToken(cookieStore.get(STUDENT_SESSION_COOKIE)?.value);
}

function shouldUseSecureCookie() {
  if (process.env.TECPEY_COOKIE_SECURE === "true") return true;
  if (process.env.TECPEY_COOKIE_SECURE === "false") return false;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  if (siteUrl.startsWith("https://")) return true;
  if (siteUrl.startsWith("http://localhost") || siteUrl.startsWith("http://127.0.0.1")) return false;
  return false;
}

export function setStudentSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(STUDENT_SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: "lax",
    maxAge: Number(process.env.TECPEY_SESSION_MAX_AGE_SECONDS || 60 * 60 * 24 * 30),
  });
  response.cookies.delete(LEGACY_STUDENT_COOKIE);
}

export function clearStudentSessionCookie(response: NextResponse) {
  response.cookies.delete(STUDENT_SESSION_COOKIE);
  response.cookies.delete(LEGACY_STUDENT_COOKIE);
}
