import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest, NextResponse } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { rateLimit } from "@/lib/rate-limit";
import { applyMentorProfileUpdate } from "@/lib/mentor-signals";

export const dynamic = "force-dynamic";

// POST /api/mentor-profile/recompute
// Recomputes the mentor profile for the currently authenticated student from live signals.
// Students can only recompute their own profile — enforced by using session.studentId.
// Rate-limited to 6 requests/min to prevent abuse (full DB scan per call).
export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const limit = await rateLimit(req, { namespace: "mentor-profile-recompute", limit: 6, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const session = await getCanonicalSession(req);
  if (!session.studentId) {
    return NextResponse.json({ ok: false, error: "academy_profile_required" }, { status: 401 });
  }

  // studentId comes exclusively from the verified session — callers cannot target other students.
  const studentId = session.studentId;

  const updated = await applyMentorProfileUpdate(studentId);

  if (!updated) {
    return NextResponse.json({ ok: false, error: "storage_unavailable" }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    profile: {
      level: updated.level,
      riskProfile: updated.riskProfile,
      primaryGoal: updated.primaryGoal,
      weakAreas: updated.weakAreas,
      strongAreas: updated.strongAreas,
      confidenceScore: updated.confidenceScore,
      disciplineScore: updated.disciplineScore,
      learningStyle: updated.learningStyle,
    },
  });
}
