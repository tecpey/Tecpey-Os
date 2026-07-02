import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";
import { shouldUseSecureCookie } from "./platform-config";
import { apiError } from "./api-validation";

const ADMIN_HEADER = "x-tecpey-admin-token";
export const ADMIN_SESSION_COOKIE = "tecpey_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 60 * 15;

export function isAdminConfigured() {
  const token = process.env.TECPEY_ADMIN_TOKEN;
  return Boolean(token && token.length >= 24);
}

function getAdminToken(): string | null {
  const token = process.env.TECPEY_ADMIN_TOKEN;
  return token && token.length >= 24 ? token : null;
}

function getAdminSigningKey(): Uint8Array | null {
  const token = getAdminToken();
  return token ? new TextEncoder().encode(token) : null;
}

export async function hasAdminAccess(req: NextRequest): Promise<boolean> {
  const token = getAdminToken();
  if (!token) return false;

  // Accept either the explicit header (first-time token submission) or the
  // signed httpOnly session cookie set by a previous successful authentication.
  if (req.headers.get(ADMIN_HEADER) === token) return true;
  return verifyAdminSessionCookie(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}

async function createAdminSessionToken(): Promise<string | null> {
  const key = getAdminSigningKey();
  if (!key) return null;

  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("tecpey-admin")
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_TTL_SECONDS}s`)
    .sign(key);
}

async function verifyAdminSessionCookie(token: string | undefined): Promise<boolean> {
  const key = getAdminSigningKey();
  if (!key || !token) return false;

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      subject: "tecpey-admin",
    });
    return payload.role === "admin";
  } catch {
    return false;
  }
}

/**
 * Sets a signed httpOnly admin session cookie without storing the raw admin token.
 */
export async function setAdminSessionCookie(response: NextResponse) {
  const sessionToken = await createAdminSessionToken();
  if (!sessionToken) return;

  response.cookies.set(ADMIN_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.delete(ADMIN_SESSION_COOKIE);
}

export function adminNotConfiguredResponse() {
  return apiError("admin_locked", 503);
}

export function adminUnauthorizedResponse() {
  return apiError("unauthorized", 401);
}
