import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { getStudentSessionFromRequest } from "@/lib/academy-session";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return apiError("forbidden", 403);
  const limit = await rateLimit(req, { namespace: "device-token-register", limit: 20, windowMs: 60_000 });
  if (!limit.ok) return apiError("rate_limited", 429);
  const session = await getStudentSessionFromRequest(req);
  if (!session?.studentId) return apiError("complete_account_required", 401);
  try {
    const body = await req.json().catch(() => ({}));
    const platform = cleanText(body.platform, 20);
    const token = cleanText(body.token, 1000);
    if (!['web','android','ios'].includes(platform) || token.length < 10) return apiError("invalid_token", 400);
    const result = await withDb(async (client) => {
      await client.query(`INSERT INTO device_tokens (student_id, platform, channel, token, locale) VALUES ($1::uuid,$2,'push',$3,$4) ON CONFLICT (student_id, platform, token) DO UPDATE SET enabled = TRUE, last_seen_at = NOW(), locale = EXCLUDED.locale`, [session.studentId, platform, token, cleanText(body.locale || "fa", 10)]);
      return true;
    });
    if (!result.enabled) return apiError("device_service_not_configured", 503);
    return apiOk({});
  } catch { return apiError("server_error", 500); }
}
