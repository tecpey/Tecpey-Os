import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { authorizeAdminRequest } from "@/lib/admin-control-plane";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { COMMAND_CENTER_METRIC_SCOPES } from "@/lib/admin-command-center-scopes";

// Command Center summary (audit finding F-1).
//
// The admin operator now carries a tenant (migration 0069), so every metric
// that CAN be scoped is scoped to it, and each metric ships the scope it
// actually has. See src/lib/admin-command-center-scopes.ts for why the
// remaining aggregates are still platform-wide and what forces those labels to
// stay honest.

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/summary" }, async () => {
    const limit = await rateLimit(req, {
      namespace: "command-center-summary",
      limit: 60,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const authorization = await authorizeAdminRequest(req, "academy.read");
    if (!authorization.ok) return apiError(authorization.error, authorization.status);
    const { tenantId, workspaceId } = authorization.principal;

    try {
      const result = await withDb(async (client) => {
        // These run on one pooled client, which pg serializes anyway; issuing
        // them through Promise.all only produced a pg@9 deprecation warning
        // without buying concurrency.
        const students = await client.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '7 days')::int AS active_week FROM academy_students`);
        // learning_events carries tenant_id, so this one is genuinely scoped.
        const events = await client.query(
          `SELECT event_type, COUNT(*)::int AS count
             FROM learning_events
            WHERE tenant_id = $1
              AND created_at > NOW() - INTERVAL '7 days'
            GROUP BY event_type
            ORDER BY count DESC
            LIMIT 8`,
          [tenantId],
        );
        const notifications = await client.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE read_at IS NULL)::int AS unread FROM notification_center`);
        const certificates = await client
          .query(`SELECT COUNT(*)::int AS total FROM academy_certificates`)
          .catch(() => ({ rows: [{ total: 0 }] }));
        const challenges = await client.query(`SELECT COUNT(*)::int AS total, COALESCE(ROUND(AVG(CASE WHEN is_correct THEN 100 ELSE 0 END)),0)::int AS success FROM mentor_challenge_attempts`);
        return {
          students: students.rows[0],
          events: events.rows,
          notifications: notifications.rows[0],
          certificates: certificates.rows[0],
          challenges: challenges.rows[0],
        };
      });
      if (!result.enabled) return apiError("service_unavailable", 503);
      return apiOk(
        {
          configured: true,
          tenantId,
          workspaceId,
          scopes: COMMAND_CENTER_METRIC_SCOPES,
          summary: result.value,
        },
        200,
        { "Cache-Control": "no-store, max-age=0" },
      );
    } catch {
      return apiError("server_error", 500);
    }
  });
}
