import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { createSmartNotification } from "@/lib/learning-os";
import {
  authorizeAdminRequest,
  writeAdminAuditEvent,
} from "@/lib/admin-control-plane";
import { withTx } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/campaign" }, async () => {
    if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "command-center-campaign",
      limit: 10,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const authorization = await authorizeAdminRequest(
      req,
      "campaign.schedule",
      { stepUpWithinSeconds: 300 },
    );
    if (!authorization.ok) return apiError(authorization.error, authorization.status);

    try {
      const boundedBodyRequest = await readBoundedJsonRequest(req, {
        maxBytes: 32_768,
        allowEmptyObject: true,
      });
      if (!boundedBodyRequest.ok) {
        return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
      }
      req = boundedBodyRequest.request;
      const body = await req.json().catch(() => ({}));
      const title = cleanText(body.title, 160);
      const message = cleanText(body.body, 500);
      if (!title || !message) return apiError("invalid_campaign", 400);

      const audience = cleanText(body.audience || "all", 40);
      if (!new Set(["inactive", "all"]).has(audience)) {
        return apiError("invalid_audience", 400);
      }
      const actionUrl = cleanText(body.actionUrl || "/academy/profile", 260);
      if (!actionUrl.startsWith("/") || actionUrl.startsWith("//")) {
        return apiError("invalid_action_url", 400);
      }

      const ip = getClientIp(req);
      const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500);
      const result = await withTx(async (client) => {
        // academy_students has no tenant column of its own (that boundary is its
        // own program — 43 tables point at it), so recipients are selected
        // through the active principal bindings for the operator's tenant.
        // Selecting globally and then stamping the operator's tenant would both
        // omit that tenant's own students behind the LIMIT and mint
        // undeliverable rows for students who are not in it — while reporting
        // them as sent.
        const students = await client.query(
          audience === "inactive"
            ? `SELECT s.id
                 FROM academy_students s
                 JOIN platform_principal_bindings b
                   ON b.principal_type = 'student'
                  AND b.principal_id = s.id::text
                  AND b.tenant_id = $1
                  AND b.workspace_id = $2
                  AND b.status = 'active'
                WHERE s.last_seen_at < NOW() - INTERVAL '3 days'
                ORDER BY s.last_seen_at ASC
                LIMIT 500`
            : `SELECT s.id
                 FROM academy_students s
                 JOIN platform_principal_bindings b
                   ON b.principal_type = 'student'
                  AND b.principal_id = s.id::text
                  AND b.tenant_id = $1
                  AND b.workspace_id = $2
                  AND b.status = 'active'
                ORDER BY s.last_seen_at DESC
                LIMIT 500`,
          [authorization.principal.tenantId, authorization.principal.workspaceId],
        );

        for (const row of students.rows) {
          await createSmartNotification(client, {
            studentId: row.id,
            scope: {
              tenantId: authorization.principal.tenantId,
              workspaceId: authorization.principal.workspaceId,
            },
            type: "system",
            title,
            body: message,
            actionUrl,
            priority: 3,
            channels: ["in_app", "push"],
            metadata: {
              audience,
              campaign: "command-center",
              actorAdminId: authorization.principal.adminId,
            },
          });
        }

        await writeAdminAuditEvent(client, {
          actorAdminId: authorization.principal.adminId,
          sessionId: authorization.principal.sessionId,
          effectiveRoles: authorization.principal.roles,
          action: "campaign.schedule",
          resourceType: "notification_campaign",
          resourceId: null,
          sourceIp: ip,
          userAgent,
          reason: cleanText(body.reason || "Command Center campaign", 240),
          afterState: {
            audience,
            count: students.rows.length,
            title,
            actionUrl,
          },
        });

        return students.rows.length;
      });

      if (!result.enabled) return apiError("campaign_service_not_configured", 503);
      return apiOk({ sent: result.value }, 200, {
        "Cache-Control": "no-store, max-age=0",
      });
    } catch {
      return apiError("server_error", 500);
    }
  });
}
