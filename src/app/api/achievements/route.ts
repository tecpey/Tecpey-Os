import { NextRequest, NextResponse } from "next/server";
import { getStudentSessionFromRequest } from "@/lib/academy-session";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { fallbackAchievementSnapshot, getAchievementSnapshot } from "@/lib/phase5-achievement-engine";
import { withDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const limit = await rateLimit(req, { namespace: "academy-achievements-read", limit: 90, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const session = await getStudentSessionFromRequest(req);
  const locale = cleanText(new URL(req.url).searchParams.get("locale") || "fa", 10) === "en" ? "en" : "fa";
  if (!session?.studentId) return NextResponse.json({ ok: true, authenticated: false, achievements: fallbackAchievementSnapshot(locale) });
  try {
    const result = await withDb((client) => getAchievementSnapshot(client, session.studentId));
    if (!result.enabled) return NextResponse.json({ ok: true, authenticated: true, achievements: fallbackAchievementSnapshot(locale) });
    return NextResponse.json({ ok: true, authenticated: true, achievements: result.value || [] });
  } catch {
    return NextResponse.json({ ok: true, authenticated: true, achievements: fallbackAchievementSnapshot(locale) });
  }
}
