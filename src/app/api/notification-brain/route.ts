import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest, NextResponse } from "next/server";
import { getStudentSessionFromRequest } from "@/lib/academy-session";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { buildNotificationBrain, createBrainNotification, fallbackNotificationBrain } from "@/lib/phase5-achievement-engine";
import { withDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const limit = await rateLimit(req, { namespace: "notification-brain-read", limit: 80, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const session = await getStudentSessionFromRequest(req);
  const locale = cleanText(new URL(req.url).searchParams.get("locale") || "fa", 10) === "en" ? "en" : "fa";
  if (!session?.studentId) return NextResponse.json({ ok: true, authenticated: false, brain: fallbackNotificationBrain(locale) });
  try {
    const result = await withDb((client) => buildNotificationBrain(client, session.studentId, locale));
    if (!result.enabled) return NextResponse.json({ ok: true, authenticated: true, brain: fallbackNotificationBrain(locale) });
    return NextResponse.json({ ok: true, authenticated: true, brain: result.value });
  } catch {
    return NextResponse.json({ ok: true, authenticated: true, brain: fallbackNotificationBrain(locale) });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const limit = await rateLimit(req, { namespace: "notification-brain-generate", limit: 20, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const session = await getStudentSessionFromRequest(req);
  if (!session?.studentId) return NextResponse.json({ ok: false, error: "academy_profile_required" }, { status: 401 });
  const locale = cleanText(new URL(req.url).searchParams.get("locale") || "fa", 10) === "en" ? "en" : "fa";
  try {
    const result = await withDb((client) => createBrainNotification(client, session.studentId, locale));
    if (!result.enabled) return NextResponse.json({ ok: true, brain: fallbackNotificationBrain(locale) });
    return NextResponse.json({ ok: true, brain: result.value });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
