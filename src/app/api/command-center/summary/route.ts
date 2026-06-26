import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { adminNotConfiguredResponse, adminUnauthorizedResponse, hasAdminAccess, isAdminConfigured, setAdminSessionCookie } from "@/lib/admin-auth";
import { withDb } from "@/lib/db";
// TODO(cookie-migration): replace hasAdminAccess(req) with
//   (await getCanonicalSession(req)).isAdmin once canonical session is used sitewide.

export async function GET(req: NextRequest) {
  const limit = await rateLimit(req, { namespace: "command-center-summary", limit: 60, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  if (!isAdminConfigured()) return adminNotConfiguredResponse();
  if (!hasAdminAccess(req)) return adminUnauthorizedResponse();
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
    if (!result.enabled) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
    const resp = NextResponse.json({ ok: true, configured: true, summary: result.value });
    const adminToken = process.env.TECPEY_ADMIN_TOKEN;
    if (adminToken) setAdminSessionCookie(resp, adminToken);
    return resp;
  } catch { return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 }); }
}
