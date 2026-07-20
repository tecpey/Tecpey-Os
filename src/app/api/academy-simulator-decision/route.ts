import { readJsonBody } from "@/lib/security/request-body";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { academySimulations } from "@/data/academySimulationWorld";
import { getStudentSessionFromRequest } from "@/lib/academy-session";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { maybeAwardAchievement, recordLearningEvent } from "@/lib/learning-os";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";

type Queryable = { query: (query: string, values?: unknown[]) => Promise<{ rows: any[] }> };

function findScenario(scenarioId: string) {
  return academySimulations.find((item) => item.id === scenarioId) || null;
}

async function summarize(client: Queryable, studentId: string) {
  const rows = await client.query(
    `SELECT scenario_id, choice_id, score, xp, feedback, entry_reason, emotion_state, risk_plan, created_at
     FROM academy_simulator_decisions
     WHERE student_id = $1::uuid
     ORDER BY created_at DESC`,
    [studentId],
  );
  const decisions = rows.rows;
  const completed = Object.fromEntries(decisions.map((item) => [item.scenario_id, { score: Number(item.score || 0), choice: item.choice_id, at: item.created_at }]));
  const totalXp = decisions.reduce((sum, item) => sum + Number(item.xp || 0), 0);
  const avgScore = decisions.length ? Math.round(decisions.reduce((sum, item) => sum + Number(item.score || 0), 0) / decisions.length) : 0;
  return { decisions, completed, totalXp, avgScore, completedCount: decisions.length };
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-simulator-decision" }, async () => {
    const limit = await rateLimit(req, { namespace: "academy-simulator-read", limit: 120, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    const session = await getStudentSessionFromRequest(req);
    if (!session?.studentId) return apiOk({ completed: {}, totalXp: 0, avgScore: 0, completedCount: 0 });
    try {
      const result = await withDb((client) => summarize(client, session.studentId));
      if (!result.enabled) return apiOk({ completed: {}, totalXp: 0, avgScore: 0, completedCount: 0 });
      return apiOk({ ...result.value });
    } catch {
      return apiError("server_error", 500);
    }
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-simulator-decision" }, async () => {
    if (!verifyCsrfOrigin(req))
      return apiError("forbidden", 403);
    const limit = await rateLimit(req, { namespace: "academy-simulator-write", limit: 40, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    const session = await getStudentSessionFromRequest(req);
    if (!session?.studentId) return apiError("complete_account_required", 401);

    try {
      const bodyResult = await readJsonBody(req, {
        maxBytes: 5_000,
        allowEmptyObject: true,
      });
      if (!bodyResult.ok) return apiError(bodyResult.error, bodyResult.status);
      const body = bodyResult.value;
      const locale = cleanText(body.locale || "fa", 10) === "en" ? "en" : "fa";
      const scenarioId = cleanText(body.scenarioId, 120);
      const choiceId = cleanText(body.choiceId, 120);
      const entryReason = cleanText(body.entryReason, 420);
      const emotionState = cleanText(body.emotionState, 120);
      const riskPlan = cleanText(body.riskPlan, 420);
      const scenario = findScenario(scenarioId);
      const choice = scenario?.choices.find((item) => item.id === choiceId);
      if (!scenario || !choice) return apiError("scenario_not_found", 404);

      const score = Math.max(0, Math.min(100, Number(choice.score || 0)));
      const xp = Math.max(0, Math.min(500, Number(scenario.xp || 0)));
      const feedback = locale === "en" ? choice.feedbackEn : choice.feedbackFa;

      const result = await withDb(async (client) => {
        await client.query(
          `INSERT INTO academy_simulator_decisions (student_id, scenario_id, locale, choice_id, score, xp, feedback, entry_reason, emotion_state, risk_plan)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (student_id, scenario_id) DO UPDATE SET
             locale = EXCLUDED.locale,
             choice_id = EXCLUDED.choice_id,
             score = EXCLUDED.score,
             feedback = EXCLUDED.feedback,
             entry_reason = EXCLUDED.entry_reason,
             emotion_state = EXCLUDED.emotion_state,
             risk_plan = EXCLUDED.risk_plan,
             created_at = NOW()`,
          [session.studentId, scenarioId, locale, choiceId, score, xp, feedback, entryReason, emotionState, riskPlan],
        );
        await client.query(
          `INSERT INTO academy_student_events (student_id, event_type, payload)
           VALUES ($1::uuid, 'simulator_decision_submitted', $2::jsonb)`,
          [session.studentId, JSON.stringify({ scenarioId, locale, choiceId, score, entryReason: Boolean(entryReason), emotionState, riskPlan: Boolean(riskPlan), ip: getClientIp(req) })],
        );
        await recordLearningEvent(client, {
          studentId: session.studentId,
          eventType: "simulator_decision_saved",
          payload: { scenarioId, locale, choiceId, score, hasJournal: Boolean(entryReason), emotionState, hasRiskPlan: Boolean(riskPlan), ip: getClientIp(req) },
        });
        if (entryReason && riskPlan) await maybeAwardAchievement(client, session.studentId, "simulator-journalist", { scenarioId, score });
        return summarize(client, session.studentId);
      });

      if (!result.enabled) return apiError("simulator_service_not_configured", 503);
      return apiOk({ score, xp, feedback, ...result.value });
    } catch {
      return apiError("server_error", 500);
    }
  });
}
