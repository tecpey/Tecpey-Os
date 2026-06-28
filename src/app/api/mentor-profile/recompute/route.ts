import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { rateLimit } from "@/lib/rate-limit";
import { applyMentorProfileUpdate } from "@/lib/mentor-signals";
import { apiOk, apiError, apiRateLimited } from "@/lib/api-validation";

export const dynamic = "force-dynamic";

// POST /api/mentor-profile/recompute
// Recomputes the mentor profile for the currently authenticated student from live signals.
// Students can only recompute their own profile — enforced by using session.studentId.
// Rate-limited to 6 requests/min to prevent abuse (full DB scan per call).
export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return apiError("forbidden", 403);
  const limit = await rateLimit(req, { namespace: "mentor-profile-recompute", limit: 6, windowMs: 60_000 });
  if (!limit.ok) {
    return apiRateLimited(limit.retryAfterSeconds);
  }

  const session = await getCanonicalSession(req);
  if (!session.studentId) {
    return apiError("academy_profile_required", 401);
  }

  // studentId comes exclusively from the verified session — callers cannot target other students.
  const studentId = session.studentId;

  const updated = await applyMentorProfileUpdate(studentId);

  if (!updated) {
    return apiError("storage_unavailable", 503);
  }

  return apiOk({ profile: { level: updated.level, riskProfile: updated.riskProfile, primaryGoal: updated.primaryGoal, weakAreas: updated.weakAreas, strongAreas: updated.strongAreas, confidenceScore: updated.confidenceScore, disciplineScore: updated.disciplineScore, learningStyle: updated.learningStyle } });
}
