import { NextRequest, NextResponse } from "next/server";
import { shouldUseSecureCookie } from "./platform-config";
import { apiError } from "./api-validation";

const ADMIN_HEADER = "x-tecpey-admin-token";
export const ADMIN_SESSION_COOKIE = "tecpey_admin_session";

export function isAdminConfigured() {
  const token = process.env.TECPEY_ADMIN_TOKEN;
  return Boolean(token && token.length >= 24);
}

export function hasAdminAccess(req: NextRequest) {
  const token = process.env.TECPEY_ADMIN_TOKEN;
  if (!token || token.length < 24) return false;
  // Accept either the explicit header (first-time token submission) or the
  // httpOnly session cookie set by a previous successful authentication.
  if (req.headers.get(ADMIN_HEADER) === token) return true;
  return req.cookies.get(ADMIN_SESSION_COOKIE)?.value === token;
}

/**
 * Sets an httpOnly admin session cookie so the raw token is no longer
 * stored in JavaScript-readable sessionStorage on the client.
 */
export function setAdminSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 15, // 15-minute session
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
