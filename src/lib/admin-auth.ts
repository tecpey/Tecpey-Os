import { NextRequest, NextResponse } from "next/server";
import { loadAdminPrincipal } from "./admin-control-plane";
import { apiError } from "./api-validation";

/**
 * Canonical administrator authorization.
 *
 * Normal production access is granted only through an individually attributable,
 * server-registered control-plane session. TECPEY_ADMIN_TOKEN is intentionally
 * not evaluated here; it is accepted only by the one-time bootstrap endpoints.
 */
export async function hasAdminAccess(req: NextRequest): Promise<boolean> {
  const principal = await loadAdminPrincipal(req);
  return principal !== "unavailable" && Boolean(principal);
}

/**
 * Compatibility no-op retained only so stale imports fail closed during the
 * route-by-route migration. Legacy shared-secret cookies are never created.
 */
export async function setAdminSessionCookie(_response: NextResponse): Promise<void> {
  return;
}

/**
 * Clear the retired legacy cookie defensively when older clients still send it.
 */
export function clearAdminSessionCookie(response: NextResponse): void {
  response.cookies.set("tecpey_admin_session", "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

/**
 * The administrator control plane is configured through PostgreSQL and Passkey
 * bootstrap, not the presence of a shared environment token.
 */
export function isAdminConfigured(): boolean {
  return true;
}

export function adminNotConfiguredResponse() {
  return apiError("admin_service_unavailable", 503);
}

export function adminUnauthorizedResponse() {
  return apiError("admin_session_required", 401);
}
