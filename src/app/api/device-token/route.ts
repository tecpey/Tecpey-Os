import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest, NextResponse } from "next/server";
import { getStudentSessionFromRequest } from "@/lib/academy-session";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { withDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const limit = await rateLimit(req, { namespace: "device-token-register", limit: 20, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const session = await getStudentSessionFromRequest(req);
  if (!session?.studentId) return NextResponse.json({ ok: false, error: "complete_account_required" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const platform = cleanText(body.platform, 20);
    const token = cleanText(body.token, 1000);
    if (!['web','android','ios'].includes(platform) || token.length < 10) return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
    const result = await withDb(async (client) => {
      await client.query(`INSERT INTO device_tokens (student_id, platform, channel, token, locale) VALUES ($1::uuid,$2,'push',$3,$4) ON CONFLICT (student_id, platform, token) DO UPDATE SET enabled = TRUE, last_seen_at = NOW(), locale = EXCLUDED.locale`, [session.studentId, platform, token, cleanText(body.locale || "fa", 10)]);
      return true;
    });
    if (!result.enabled) return NextResponse.json({ ok: false, error: "device_service_not_configured" }, { status: 503 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 }); }
}
