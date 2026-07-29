import { NextRequest } from "next/server";
import { loadAdminPrincipal } from "./admin-control-plane";
import { apiError } from "./api-validation";

/**
 * Canonical administrator authorization.
 *
 * Normal production access is granted only through an individually attributable,
 * server-registered control-plane session. The temporary shared bootstrap
 * credential is intentionally accepted only by the one-time bootstrap endpoints.
 */
export async function hasAdminAccess(req: NextRequest): Promise<boolean> {
  const principal = await loadAdminPrincipal(req);
  return principal !== "unavailable" && Boolean(principal);
}

export function adminNotConfiguredResponse() {
  return apiError("admin_service_unavailable", 503);
}

export function adminUnauthorizedResponse() {
  return apiError("admin_session_required", 401);
}
