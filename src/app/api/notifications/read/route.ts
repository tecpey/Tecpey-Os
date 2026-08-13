import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { recordLearningEvent } from "@/lib/learning-os";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/notifications/read" }, async () => {
    if (!verifyCsrfOrigin(req))
      return apiError("forbidden", 403);
    const limit = await rateLimit(req, { namespace: "notifications-read-write", limit: 120, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("complete_account_required", 401);
    const tenantContext = await resolveTenantPrincipalContext({
      session,
      requiredPrincipalType: "student",
      scopes: ["academy:learning-events:write"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    if (!tenantContext.available) return apiError("learning_events_unavailable", 503);
    try {
      const boundedBodyRequest = await readBoundedJsonRequest(req, {
        maxBytes: 2_048,
        allowEmptyObject: true,
      });
      if (!boundedBodyRequest.ok) {
        return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
      }
      req = boundedBodyRequest.request;
      const body = await req.json().catch(() => ({}));
      const id = cleanText(body.id, 80);
      if (!id) return apiError("invalid_notification", 400);
      await withDb(async (client) => {
        await client.query(`UPDATE notification_center SET read_at = COALESCE(read_at, NOW()) WHERE id = $1::uuid AND tenant_id = $3 AND (student_id = $2::uuid OR student_id IS NULL)`, [id, tenantContext.principalId, tenantContext.tenantId]);
        await recordLearningEvent(client, { studentId: tenantContext.principalId, tenantId: tenantContext.tenantId,
          workspaceId: tenantContext.workspaceId, eventType: "notification_opened", payload: { id } });
        return true;
      });
      return apiOk({});
    } catch {
      return apiError("server_error", 500);
    }
  });
}
