import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { createSmartNotification } from "@/lib/learning-os";
import { adminNotConfiguredResponse, isAdminConfigured, setAdminSessionCookie } from "@/lib/admin-auth";
import { getCanonicalSession } from "@/lib/auth-session";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/campaign" }, async () => {
  if (!verifyCsrfOrigin(req))
    return apiError("forbidden", 403);
  const limit = await rateLimit(req, { namespace: "command-center-campaign", limit: 10, windowMs: 60_000 });
  if (!limit.ok) return apiError("rate_limited", 429);
  if (!isAdminConfigured()) return adminNotConfiguredResponse();
  const session = await getCanonicalSession(req);
  if (!session.isAdmin) return apiError("unauthorized", 401);
  try {
    const body = await req.json().catch(() => ({}));
    const title = cleanText(body.title, 160);
    const message = cleanText(body.body, 500);
    if (!title || !message) return apiError("invalid_campaign", 400);
    const result = await withDb(async (client) => {
      const audience = cleanText(body.audience || "all", 40);
      const students = await client.query(
        audience === "inactive"
          ? `SELECT id FROM academy_students WHERE last_seen_at < NOW() - INTERVAL '3 days' LIMIT 500`
          : `SELECT id FROM academy_students ORDER BY last_seen_at DESC LIMIT 500`,
      );
      for (const row of students.rows) await createSmartNotification(client, { studentId: row.id, type: "system", title, body: message, actionUrl: cleanText(body.actionUrl || "/academy/profile", 260), priority: 3, channels: ["in_app", "push"], metadata: { audience, campaign: "command-center" } });
      await client.query(`INSERT INTO admin_audit_log (actor, action, payload) VALUES ('command-center', 'campaign_sent', $1::jsonb)`, [JSON.stringify({ audience, count: students.rows.length, title })]);
      return students.rows.length;
    });
    if (!result.enabled) return apiError("campaign_service_not_configured", 503);
    const resp = apiOk({ sent: result.value });
    const adminToken = process.env.TECPEY_ADMIN_TOKEN;
    if (adminToken) setAdminSessionCookie(resp, adminToken);
    return resp;
  } catch { return apiError("server_error", 500); }
  }); // end withObservability
}
