import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { clearAdminControlSessionCookie } from "@/lib/admin-passkey-service";
import {
  loadAdminPrincipal,
  writeAdminAuditEvent,
} from "@/lib/admin-control-plane";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { withObservability } from "@/lib/observe";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/auth/logout" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "admin-logout",
      limit: 20,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const principal = await loadAdminPrincipal(req);
    let serverRevoked = false;
    let auditRecorded = false;

    if (principal && principal !== "unavailable") {
      const ip = getClientIp(req);
      const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500);
      try {
        const result = await withTx(async (client) => {
          const revoked = await client.query(
            `UPDATE admin_sessions
             SET revoked_at = NOW(), revoked_by = $1::uuid, revoked_reason = 'logout'
             WHERE id = $2::uuid AND revoked_at IS NULL`,
            [principal.adminId, principal.sessionId],
          );

          await writeAdminAuditEvent(client, {
            actorAdminId: principal.adminId,
            sessionId: principal.sessionId,
            effectiveRoles: principal.roles,
            action: "admin.logout",
            resourceType: "admin_session",
            resourceId: principal.sessionId,
            sourceIp: ip,
            userAgent,
            afterState: {
              revoked: (revoked.rowCount ?? 0) === 1,
            },
          });
          return (revoked.rowCount ?? 0) === 1;
        });
        serverRevoked = result.enabled && result.value;
        auditRecorded = result.enabled;
      } catch {
        serverRevoked = false;
        auditRecorded = false;
      }
    }

    // Local logout must never be blocked by an unavailable database. Clearing
    // the HttpOnly cookie removes this browser's bearer credential immediately;
    // the response reports whether server-side revocation and audit also landed.
    const response = apiOk({
      loggedOut: true,
      localSessionCleared: true,
      serverRevoked,
      auditRecorded,
    }, 200, {
      "Cache-Control": "no-store, max-age=0",
    });
    clearAdminControlSessionCookie(response);
    return response;
  });
}
