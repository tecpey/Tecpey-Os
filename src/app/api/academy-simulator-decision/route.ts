import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { academySimulations } from "@/data/academySimulationWorld";
import { getStudentSessionFromRequest } from "@/lib/academy-session";
import { getCanonicalSession } from "@/lib/auth-session";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { maybeAwardAchievement, recordLearningEvent } from "@/lib/learning-os";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { requireTenantProduct } from "@/lib/security/tenant-product-entitlement";
import type { SchemaQueryable } from "@/lib/database-schema-contract";

type SimulatorDecision = {
  scenario_id: string;
  choice_id: string;
  score: number;
  xp: number;
  feedback: string;
  entry_reason: string;
  emotion_state: string;
  risk_plan: string;
  created_at: unknown;
};

function findScenario(scenarioId: string) {
  return academySimulations.find((item) => item.id === scenarioId) || null;
}

async function summarize(client: SchemaQueryable, studentId: string) {
  const rows = await client.query(
    `SELECT scenario_id, choice_id, score, xp, feedback, entry_reason, emotion_state, risk_plan, created_at
     FROM academy_simulator_decisions
     WHERE student_id = $1::uuid
     ORDER BY created_at DESC`,
    [studentId],
  );
  const decisions: SimulatorDecision[] = rows.rows.map((item) => ({
    scenario_id: String(item.scenario_id ?? ""),
    choice_id: String(item.choice_id ?? ""),
    score: Number(item.score ?? 0),
    xp: Number(item.xp ?? 0),
    feedback: String(item.feedback ?? ""),
    entry_reason: String(item.entry_reason ?? ""),
    emotion_state: String(item.emotion_state ?? ""),
    risk_plan: String(item.risk_plan ?? ""),
    created_at: item.created_at,
  }));
  const completed = Object.fromEntries(decisions.map((item) => [item.scenario_id, { score: item.score, choice: item.choice_id, at: item.created_at }]));
  const totalXp = decisions.reduce((sum, item) => sum + item.xp, 0);
  const avgScore = decisions.length ? Math.round(decisions.reduce((sum, item) => sum + item.score, 0) / decisions.length) : 0;
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
    if (!await verifyCsrfOrigin(req))
      return apiError("forbidden", 403);
    const limit = await rateLimit(req, { namespace: "academy-simulator-write", limit: 40, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("complete_account_required", 401);
    const tenantContext = await resolveTenantPrincipalContext({
      session,
      request: req,
      requiredPrincipalType: "student",
      scopes: ["academy:learning-events:write"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    if (!tenantContext.available) return apiError("learning_events_unavailable", 503);
    const productGate = await requireTenantProduct(tenantContext.tenantId, "academy");
    if (productGate) return productGate;
    const studentId = tenantContext.principalId;

    try {
      const boundedBodyRequest = await readBoundedJsonRequest(req, {
        maxBytes: 20_000,
        allowEmptyObject: true,
      });
      if (!boundedBodyRequest.ok) {
        return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
      }
      req = boundedBodyRequest.request;
      const raw = await req.text();
      if (raw.length > 5000) return apiError("payload_too_large", 413);
      const body = JSON.parse(raw || "{}");
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
          [studentId, scenarioId, locale, choiceId, score, xp, feedback, entryReason, emotionState, riskPlan],
        );
        await client.query(
          `INSERT INTO academy_student_events (student_id, event_type, payload)
           VALUES ($1::uuid, 'simulator_decision_submitted', $2::jsonb)`,
          [studentId, JSON.stringify({ scenarioId, locale, choiceId, score, entryReason: Boolean(entryReason), emotionState, riskPlan: Boolean(riskPlan), ip: getClientIp(req) })],
        );
        await recordLearningEvent(client, {
          studentId,
          tenantId: tenantContext.tenantId,
          workspaceId: tenantContext.workspaceId,
          eventType: "simulator_decision_saved",
          payload: { scenarioId, locale, choiceId, score, hasJournal: Boolean(entryReason), emotionState, hasRiskPlan: Boolean(riskPlan), ip: getClientIp(req) },
        });
        if (entryReason && riskPlan) await maybeAwardAchievement(client, studentId, "simulator-journalist", { scenarioId, score }, { tenantId: tenantContext.tenantId, workspaceId: tenantContext.workspaceId });
        return summarize(client, studentId);
      });

      if (!result.enabled) return apiError("simulator_service_not_configured", 503);
      return apiOk({ score, xp, feedback, ...result.value });
    } catch {
      return apiError("server_error", 500);
    }
  });
}
