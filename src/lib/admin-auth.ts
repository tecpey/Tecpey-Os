import { NextRequest, NextResponse } from "next/server";
import { loadAdminPrincipal } from "./admin-control-plane";
import { apiError } from "./api-validation";

export const ADMIN_SESSION_COOKIE = "tecpey_admin_session";

/**
 * Legacy compatibility indicator for routes that have not yet migrated their
 * setup checks. Normal administrator authorization never accepts the shared
 * bootstrap token or the legacy cookie.
 */
export function isAdminConfigured(): boolean {
  const secret = process.env.TECPEY_ADMIN_SESSION_SECRET;
  return process.env.NODE_ENV !== "production" || Boolean(secret && secret.length >= 32);
}

export async function hasAdminAccess(req: NextRequest): Promise<boolean> {
  const principal = await loadAdminPrincipal(req);
  return principal !== "unavailable" && principal !== null;
}

/**
 * Deprecated no-op kept temporarily so older routes compile while they are
 * migrated to explicit Admin Control Plane sessions and permissions.
 */
export async function setAdminSessionCookie(_response: NextResponse): Promise<void> {
  return;
}

export function clearAdminSessionCookie(response: NextResponse): void {
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export function adminNotConfiguredResponse() {
  return apiError("admin_locked", 503);
}

export function adminUnauthorizedResponse() {
  return apiError("unauthorized", 401);
}
