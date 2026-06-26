import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { createSmartNotification } from "@/lib/learning-os";
import { adminNotConfiguredResponse, adminUnauthorizedResponse, hasAdminAccess, isAdminConfigured, setAdminSessionCookie } from "@/lib/admin-auth";
// TODO(cookie-migration): replace hasAdminAccess(req) with
//   (await getCanonicalSession(req)).isAdmin once canonical session is used sitewide.
import { withDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const limit = await rateLimit(req, { namespace: "command-center-campaign", limit: 10, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  if (!isAdminConfigured()) return adminNotConfiguredResponse();
  if (!hasAdminAccess(req)) return adminUnauthorizedResponse();
  try {
    const body = await req.json().catch(() => ({}));
    const title = cleanText(body.title, 160);
    const message = cleanText(body.body, 500);
    if (!title || !message) return NextResponse.json({ ok: false, error: "invalid_campaign" }, { status: 400 });
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
    if (!result.enabled) return NextResponse.json({ ok: false, error: "campaign_service_not_configured" }, { status: 503 });
    const resp = NextResponse.json({ ok: true, sent: result.value });
    const adminToken = process.env.TECPEY_ADMIN_TOKEN;
    if (adminToken) setAdminSessionCookie(resp, adminToken);
    return resp;
  } catch { return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 }); }
}
