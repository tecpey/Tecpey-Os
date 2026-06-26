import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest, NextResponse } from "next/server";
import { getStudentSessionFromRequest } from "@/lib/academy-session";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { recordLearningEvent, type LearningEventType } from "@/lib/learning-os";
import { withDb } from "@/lib/db";

const clientAllowedEvents = new Set<LearningEventType>(["notification_opened", "lesson_viewed", "mentor_opened"]);
const blockedServerEvents = new Set(["lesson_completed", "quiz_attempt_recorded", "mentor_challenge_answered", "simulator_decision_saved", "certificate_issued", "badge_earned", "community_rank_changed"]);

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const limit = await rateLimit(req, { namespace: "learning-events-write", limit: 90, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const session = await getStudentSessionFromRequest(req);
  if (!session?.studentId) return NextResponse.json({ ok: false, error: "complete_account_required" }, { status: 401 });
  try {
    const raw = await req.text();
    if (raw.length > 12_000) return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
    const body = JSON.parse(raw || "{}");
    const eventType = cleanText(body.eventType, 80) as LearningEventType;
    if (blockedServerEvents.has(eventType)) return NextResponse.json({ ok: false, error: "server_event_only" }, { status: 403 });
    if (!clientAllowedEvents.has(eventType)) return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
    const result = await withDb((client) => recordLearningEvent(client, {
      studentId: session.studentId,
      eventType,
      source: cleanText(body.source || "web", 40),
      locale: cleanText(body.locale || "fa", 10) === "en" ? "en" : "fa",
      payload: typeof body.payload === "object" && body.payload ? body.payload : {},
    }));
    if (!result.enabled) return NextResponse.json({ ok: false, error: "learning_os_not_configured" }, { status: 503 });
    return NextResponse.json({ ok: true, eventId: result.value });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
