import { NextRequest, NextResponse } from "next/server";
import { getStudentSessionFromRequest } from "@/lib/academy-session";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { withDb } from "@/lib/db";

function fallbackNotifications(locale: string) {
  const isFa = locale !== "en";
  return [
    { id: "welcome-learning", type: "learning", title: isFa ? "مسیر آکادمی منتظر توست" : "Your academy path is waiting", body: isFa ? "از همان جایی که متوقف شدی ادامه بده و مسیرت را کامل کن." : "Continue from where you left off.", action_url: "/academy/profile", priority: 2, read_at: null },
    { id: "mentor-challenge", type: "mentor", title: isFa ? "منتور یک چالش جدید دارد" : "Your mentor has a new challenge", body: isFa ? "یک سوال چالشی متناسب با سطح تو آماده است." : "A personalized challenge is ready for your level.", action_url: "/academy/daily-challenge", priority: 3, read_at: null },
  ];
}

export async function GET(req: NextRequest) {
  const limit = await rateLimit(req, { namespace: "notifications-read", limit: 120, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const session = await getStudentSessionFromRequest(req);
  const locale = cleanText(new URL(req.url).searchParams.get("locale") || "fa", 10) === "en" ? "en" : "fa";
  if (!session?.studentId) return NextResponse.json({ ok: true, notifications: fallbackNotifications(locale), unread: 2 });
  try {
    const result = await withDb(async (client) => {
      const rows = await client.query(
        `SELECT id, type, title, body, action_url, priority, channels, read_at, created_at, metadata
         FROM notification_center
         WHERE (student_id = $1::uuid OR student_id IS NULL) AND scheduled_for <= NOW()
         ORDER BY read_at NULLS FIRST, priority DESC, created_at DESC
         LIMIT 40`,
        [session.studentId],
      );
      const unread = rows.rows.filter((item) => !item.read_at).length;
      return { notifications: rows.rows, unread };
    });
    if (!result.enabled) return NextResponse.json({ ok: true, notifications: fallbackNotifications(locale), unread: 2 });
    return NextResponse.json({ ok: true, ...result.value });
  } catch {
    return NextResponse.json({ ok: true, notifications: fallbackNotifications(locale), unread: 2 });
  }
}

export async function POST() {
  return NextResponse.json({ ok: false, error: "notification_creation_protected" }, { status: 405 });
}
