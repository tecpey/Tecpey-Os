import { NextRequest, NextResponse } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { rateLimit } from "@/lib/rate-limit";
import { withDb } from "@/lib/db";
import { generateMentorInsights } from "@/lib/mentor-memory";
import { applyMentorProfileUpdate } from "@/lib/mentor-signals";
import { apiOk, apiError } from "@/lib/api-validation";

export const dynamic = "force-dynamic";

// GET /api/mentor-insights
// Returns the last 5 insight snapshots + current mentor profile for the authenticated student.
//
// ?generate=1  — recompute signals, update mentor_profiles, generate a fresh insight snapshot.
// ?generate=0  — (default) return existing data only; no writes.
export async function GET(req: NextRequest) {
  const limit = await rateLimit(req, { namespace: "mentor-insights", limit: 30, windowMs: 60_000 });
  if (!limit.ok) return apiError("rate_limited", 429);

  const session = await getCanonicalSession(req);
  if (!session.studentId) return apiError("academy_profile_required", 401);
  const studentId = session.studentId;

  const shouldGenerate = new URL(req.url).searchParams.get("generate") === "1";

  let updatedProfile = null;
  if (shouldGenerate) {
    // Recompute all signals and flush to mentor_profiles.
    updatedProfile = await applyMentorProfileUpdate(studentId);
    // Then generate a fresh text insight snapshot from the updated memories.
    await generateMentorInsights(studentId);
  }

  const result = await withDb(async (client) => {
    const [insightRows, profileRow] = await Promise.all([
      client.query(
        `SELECT id, insight_type, content, generated_at
         FROM mentor_insights
         WHERE student_id = $1::uuid
         ORDER BY generated_at DESC
         LIMIT 5`,
        [studentId],
      ),
      client.query(
        `SELECT level, risk_profile, primary_goal, weak_areas, strong_areas,
                confidence_score, discipline_score, learning_style, updated_at
         FROM mentor_profiles
         WHERE student_id = $1::uuid`,
        [studentId],
      ),
    ]);

    const insights = insightRows.rows.map((r) => ({
      id: r.id,
      insightType: r.insight_type,
      content: r.content,
      generatedAt: new Date(r.generated_at).toISOString(),
    }));

    const profile = profileRow.rows[0]
      ? {
          level: profileRow.rows[0].level,
          riskProfile: profileRow.rows[0].risk_profile,
          primaryGoal: profileRow.rows[0].primary_goal,
          weakAreas: profileRow.rows[0].weak_areas ?? [],
          strongAreas: profileRow.rows[0].strong_areas ?? [],
          confidenceScore: Number(profileRow.rows[0].confidence_score),
          disciplineScore: Number(profileRow.rows[0].discipline_score ?? 0),
          learningStyle: String(profileRow.rows[0].learning_style ?? "mixed"),
          updatedAt: new Date(profileRow.rows[0].updated_at).toISOString(),
        }
      : null;

    return { insights, profile };
  });

  if (!result.enabled) {
    return apiOk({ insights: [], profile: updatedProfile, storage: "unavailable" });
  }

  return NextResponse.json({
    ok: true,
    insights: result.value?.insights ?? [],
    profile: result.value?.profile ?? updatedProfile,
  });
}
