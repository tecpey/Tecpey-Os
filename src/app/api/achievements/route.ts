import { NextRequest } from "next/server";
import { getStudentSessionFromRequest } from "@/lib/academy-session";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { fallbackAchievementSnapshot, getAchievementSnapshot } from "@/lib/phase5-achievement-engine";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { recordDegradedRead } from "@/lib/degraded-read";

const ROUTE = "/api/achievements";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: ROUTE }, async () => {
    const limit = await rateLimit(req, { namespace: "academy-achievements-read", limit: 90, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    const session = await getStudentSessionFromRequest(req);
    const locale = cleanText(new URL(req.url).searchParams.get("locale") || "fa", 10) === "en" ? "en" : "fa";
    if (!session?.studentId) return apiOk({ authenticated: false, achievements: fallbackAchievementSnapshot(locale) });
    try {
      const result = await withDb((client) => getAchievementSnapshot(client, session.studentId));
      if (!result.enabled) {
        recordDegradedRead(ROUTE, "storage_unavailable");
        return apiOk({ authenticated: true, degraded: true, achievements: fallbackAchievementSnapshot(locale) });
      }
      return apiOk({ authenticated: true, degraded: false, achievements: result.value || [] });
    } catch (error) {
      recordDegradedRead(ROUTE, "read_failed", error);
      return apiOk({ authenticated: true, degraded: true, achievements: fallbackAchievementSnapshot(locale) });
    }
  });
}
