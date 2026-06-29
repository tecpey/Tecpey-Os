import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { getStudentSessionFromRequest } from "@/lib/academy-session";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { buildNotificationBrain, createBrainNotification, fallbackNotificationBrain } from "@/lib/phase5-achievement-engine";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/notification-brain" }, async () => {
    const limit = await rateLimit(req, { namespace: "notification-brain-read", limit: 80, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    const session = await getStudentSessionFromRequest(req);
    const locale = cleanText(new URL(req.url).searchParams.get("locale") || "fa", 10) === "en" ? "en" : "fa";
    if (!session?.studentId) return apiOk({ authenticated: false, brain: fallbackNotificationBrain(locale) });
    try {
      const result = await withDb((client) => buildNotificationBrain(client, session.studentId, locale));
      if (!result.enabled) return apiOk({ authenticated: true, brain: fallbackNotificationBrain(locale) });
      return apiOk({ authenticated: true, brain: result.value });
    } catch {
      return apiOk({ authenticated: true, brain: fallbackNotificationBrain(locale) });
    }
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/notification-brain" }, async () => {
    if (!verifyCsrfOrigin(req))
      return apiError("forbidden", 403);
    const limit = await rateLimit(req, { namespace: "notification-brain-generate", limit: 20, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    const session = await getStudentSessionFromRequest(req);
    if (!session?.studentId) return apiError("academy_profile_required", 401);
    const locale = cleanText(new URL(req.url).searchParams.get("locale") || "fa", 10) === "en" ? "en" : "fa";
    try {
      const result = await withDb((client) => createBrainNotification(client, session.studentId, locale));
      if (!result.enabled) return apiOk({ brain: fallbackNotificationBrain(locale) });
      return apiOk({ brain: result.value });
    } catch {
      return apiError("server_error", 500);
    }
  });
}
