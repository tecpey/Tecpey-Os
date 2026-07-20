import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { getStudentSessionFromRequest } from "@/lib/academy-session";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { recordLearningEvent, type LearningEventType } from "@/lib/learning-os";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

const clientAllowedEvents = new Set<LearningEventType>(["notification_opened", "lesson_viewed", "mentor_opened"]);
const blockedServerEvents = new Set(["lesson_completed", "quiz_attempt_recorded", "mentor_challenge_answered", "simulator_decision_saved", "certificate_issued", "badge_earned", "community_rank_changed"]);

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/learning-events" }, async () => {
    if (!verifyCsrfOrigin(req))
      return apiError("forbidden", 403);
    const limit = await rateLimit(req, { namespace: "learning-events-write", limit: 90, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    const session = await getStudentSessionFromRequest(req);
    if (!session?.studentId) return apiError("complete_account_required", 401);
    try {
      const boundedBodyRequest = await readBoundedJsonRequest(req, {
        maxBytes: 48_000,
        allowEmptyObject: true,
      });
      if (!boundedBodyRequest.ok) {
        return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
      }
      req = boundedBodyRequest.request;
      const raw = await req.text();
      if (raw.length > 12_000) return apiError("payload_too_large", 413);
      const body = JSON.parse(raw || "{}");
      const eventType = cleanText(body.eventType, 80) as LearningEventType;
      if (blockedServerEvents.has(eventType)) return apiError("server_event_only", 403);
      if (!clientAllowedEvents.has(eventType)) return apiError("invalid_event", 400);
      const result = await withDb((client) => recordLearningEvent(client, {
        studentId: session.studentId,
        eventType,
        source: cleanText(body.source || "web", 40),
        locale: cleanText(body.locale || "fa", 10) === "en" ? "en" : "fa",
        payload: typeof body.payload === "object" && body.payload ? body.payload : {},
      }));
      if (!result.enabled) return apiError("learning_os_not_configured", 503);
      return apiOk({ eventId: result.value });
    } catch {
      return apiError("server_error", 500);
    }
  });
}
