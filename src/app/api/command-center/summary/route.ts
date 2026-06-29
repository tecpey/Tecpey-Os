import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { adminNotConfiguredResponse, isAdminConfigured, setAdminSessionCookie } from "@/lib/admin-auth";
import { getCanonicalSession } from "@/lib/auth-session";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/summary" }, async () => {
    const limit = await rateLimit(req, { namespace: "command-center-summary", limit: 60, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    if (!isAdminConfigured()) return adminNotConfiguredResponse();
    const session = await getCanonicalSession(req);
    if (!session.isAdmin) return apiError("unauthorized", 401);
    try {
      const result = await withDb(async (client) => {
        const [students, events, notifications, certificates, challenges] = await Promise.all([
          client.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '7 days')::int AS active_week FROM academy_students`),
          client.query(`SELECT event_type, COUNT(*)::int AS count FROM learning_events WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY event_type ORDER BY count DESC LIMIT 8`),
          client.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE read_at IS NULL)::int AS unread FROM notification_center`),
          client.query(`SELECT COUNT(*)::int AS total FROM academy_certificates`).catch(() => ({ rows: [{ total: 0 }] })),
          client.query(`SELECT COUNT(*)::int AS total, COALESCE(ROUND(AVG(CASE WHEN is_correct THEN 100 ELSE 0 END)),0)::int AS success FROM mentor_challenge_attempts`),
        ]);
        return { students: students.rows[0], events: events.rows, notifications: notifications.rows[0], certificates: certificates.rows[0], challenges: challenges.rows[0] };
      });
      if (!result.enabled) return apiError("service_unavailable", 503);
      const resp = apiOk({ configured: true, summary: result.value });
      const adminToken = process.env.TECPEY_ADMIN_TOKEN;
      if (adminToken) setAdminSessionCookie(resp, adminToken);
      return resp;
    } catch { return apiError("server_error", 500); }
  });
}
