import { NextRequest } from "next/server";
import {
  authorizeAdminRequest,
  writeAdminAuditEvent,
} from "@/lib/admin-control-plane";
import { apiOk, apiError } from "@/lib/api-validation";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { withObservability } from "@/lib/observe";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { getAuthMetrics, resetAuthMetrics } from "@/lib/security/auth-metrics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/admin/security-metrics" }, async () => {
    const limit = await rateLimit(req, {
      namespace: "admin-security-metrics",
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const authorization = await authorizeAdminRequest(req, "system.health.read");
    if (!authorization.ok) return apiError(authorization.error, authorization.status);

    const counters = await getAuthMetrics();
    return apiOk({ counters, retrievedAt: new Date().toISOString() }, 200, {
      "Cache-Control": "no-store, max-age=0",
    });
  });
}

export async function DELETE(req: NextRequest) {
  return withObservability(req, { route: "/api/admin/security-metrics DELETE" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "admin-security-metrics-reset",
      limit: 5,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const authorization = await authorizeAdminRequest(
      req,
      "security.incident.manage",
      { stepUpWithinSeconds: 300 },
    );
    if (!authorization.ok) return apiError(authorization.error, authorization.status);

    const ip = getClientIp(req);
    const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500);

    const intent = await withTx(async (client) => {
      await writeAdminAuditEvent(client, {
        actorAdminId: authorization.principal.adminId,
        sessionId: authorization.principal.sessionId,
        effectiveRoles: authorization.principal.roles,
        action: "security.auth_metrics.reset.requested",
        resourceType: "auth_metrics",
        resourceId: "global",
        sourceIp: ip,
        userAgent,
        reason: "explicit administrator reset",
      });
      return true;
    });
    if (!intent.enabled) return apiError("admin_service_unavailable", 503);

    try {
      await resetAuthMetrics();
    } catch {
      const failedAudit = await withTx(async (client) => {
        await writeAdminAuditEvent(client, {
          actorAdminId: authorization.principal.adminId,
          sessionId: authorization.principal.sessionId,
          effectiveRoles: authorization.principal.roles,
          action: "security.auth_metrics.reset",
          resourceType: "auth_metrics",
          resourceId: "global",
          sourceIp: ip,
          userAgent,
          outcome: "failed",
          errorCode: "redis_reset_failed",
        });
        return true;
      });
      if (!failedAudit.enabled) return apiError("admin_service_unavailable", 503);
      return apiError("security_metrics_reset_failed", 503);
    }

    const completed = await withTx(async (client) => {
      await writeAdminAuditEvent(client, {
        actorAdminId: authorization.principal.adminId,
        sessionId: authorization.principal.sessionId,
        effectiveRoles: authorization.principal.roles,
        action: "security.auth_metrics.reset",
        resourceType: "auth_metrics",
        resourceId: "global",
        sourceIp: ip,
        userAgent,
      });
      return true;
    });
    if (!completed.enabled) return apiError("admin_service_unavailable", 503);

    return apiOk({ reset: true }, 200, {
      "Cache-Control": "no-store, max-age=0",
    });
  });
}
