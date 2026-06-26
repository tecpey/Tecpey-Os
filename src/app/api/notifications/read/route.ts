import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest, NextResponse } from "next/server";
import { getStudentSessionFromRequest } from "@/lib/academy-session";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { recordLearningEvent } from "@/lib/learning-os";
import { withDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const limit = await rateLimit(req, { namespace: "notifications-read-write", limit: 120, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const session = await getStudentSessionFromRequest(req);
  if (!session?.studentId) return NextResponse.json({ ok: false, error: "complete_account_required" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const id = cleanText(body.id, 80);
    if (!id) return NextResponse.json({ ok: false, error: "invalid_notification" }, { status: 400 });
    await withDb(async (client) => {
      await client.query(`UPDATE notification_center SET read_at = COALESCE(read_at, NOW()) WHERE id = $1::uuid AND (student_id = $2::uuid OR student_id IS NULL)`, [id, session.studentId]);
      await recordLearningEvent(client, { studentId: session.studentId, eventType: "notification_opened", payload: { id } });
      return true;
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
