import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest, NextResponse } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { recordLearningEvent, type LearningEventType } from "@/lib/learning-os";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";

const clientAllowedEvents = new Set<LearningEventType>(["notification_opened", "lesson_viewed", "mentor_opened"]);
const blockedServerEvents = new Set(["lesson_completed", "quiz_attempt_recorded", "mentor_challenge_answered", "simulator_decision_saved", "certificate_issued", "badge_earned", "community_rank_changed"]);

function noStore<T>(response: NextResponse<T>): NextResponse<T> {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/learning-events" }, async () => {
    if (!await verifyCsrfOrigin(req))
      return noStore(apiError("forbidden", 403));
    const limit = await rateLimit(req, { namespace: "learning-events-write", limit: 90, windowMs: 60_000 });
    if (!limit.ok) return noStore(apiError("rate_limited", 429));
    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return noStore(apiError("complete_account_required", 401));
    const tenantContext = await resolveTenantPrincipalContext({
      session,
      request: req,
      requiredPrincipalType: "student",
      scopes: ["academy:learning-events:write"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    if (!tenantContext.available) return noStore(apiError("learning_events_unavailable", 503));
    try {
      const boundedBodyRequest = await readBoundedJsonRequest(req, {
        maxBytes: 48_000,
        allowEmptyObject: true,
      });
      if (!boundedBodyRequest.ok) {
        return noStore(apiError(boundedBodyRequest.error, boundedBodyRequest.status));
      }
      req = boundedBodyRequest.request;
      const raw = await req.text();
      if (raw.length > 12_000) return noStore(apiError("payload_too_large", 413));
      const body = JSON.parse(raw || "{}");
      const eventType = cleanText(body.eventType, 80) as LearningEventType;
      if (blockedServerEvents.has(eventType)) return noStore(apiError("server_event_only", 403));
      if (!clientAllowedEvents.has(eventType)) return noStore(apiError("invalid_event", 400));
      const result = await withDb((client) => recordLearningEvent(client, {
        studentId: tenantContext.principalId,
        tenantId: tenantContext.tenantId,
        workspaceId: tenantContext.workspaceId,
        eventType,
        source: cleanText(body.source || "web", 40),
        locale: cleanText(body.locale || "fa", 10) === "en" ? "en" : "fa",
        payload: typeof body.payload === "object" && body.payload ? body.payload : {},
      }));
      if (!result.enabled) return noStore(apiError("learning_os_not_configured", 503));
      return noStore(apiOk({ eventId: result.value }));
    } catch {
      return noStore(apiError("server_error", 500));
    }
  });
}
