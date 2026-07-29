import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { getStudentSessionFromRequest } from "@/lib/academy-session";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { recordLearningEvent } from "@/lib/learning-os";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/notifications/read" }, async () => {
    if (!verifyCsrfOrigin(req))
      return apiError("forbidden", 403);
    const limit = await rateLimit(req, { namespace: "notifications-read-write", limit: 120, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    const session = await getStudentSessionFromRequest(req);
    if (!session?.studentId) return apiError("complete_account_required", 401);
    try {
      const boundedBodyRequest = await readBoundedJsonRequest(req, {
        maxBytes: 2_048,
        allowEmptyObject: true,
      });
      if (!boundedBodyRequest.ok) {
        return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
      }
      req = boundedBodyRequest.request;
      const body = await req.json().catch(() => ({}));
      const id = cleanText(body.id, 80);
      if (!id) return apiError("invalid_notification", 400);
      await withDb(async (client) => {
        await client.query(`UPDATE notification_center SET read_at = COALESCE(read_at, NOW()) WHERE id = $1::uuid AND (student_id = $2::uuid OR student_id IS NULL)`, [id, session.studentId]);
        await recordLearningEvent(client, { studentId: session.studentId, eventType: "notification_opened", payload: { id } });
        return true;
      });
      return apiOk({});
    } catch {
      return apiError("server_error", 500);
    }
  });
}
