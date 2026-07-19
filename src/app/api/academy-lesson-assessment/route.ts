import { NextRequest } from "next/server";
import { TERM1 } from "@/data/academy/term1Curriculum";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { withTx } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { apiError, apiOk, checkBodySize } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { gradeQuizSubmission, type QuizSubmission } from "@/lib/academy-quiz-grading";
import { issueAcademyReward, rebuildAcademyProgressProjection } from "@/lib/academy-progress-authority";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseLocale(value: unknown): "fa" | "en" {
  return value === "en" ? "en" : "fa";
}

function resolveLesson(locale: "fa" | "en", lessonId: string) {
  if (locale !== "fa") return null;
  return TERM1.modules.flatMap((module) => module.lessons).find((lesson) => lesson.id === lessonId) ?? null;
}

function normalizeSubmission(value: unknown): QuizSubmission | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 100) return null;
  return Object.fromEntries(entries.map(([key, answer]) => [String(key).slice(0, 180), answer]));
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-lesson-assessment" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    if (!checkBodySize(req.headers.get("content-length"), 64_000)) return apiError("payload_too_large", 413);

    const limit = await rateLimit(req, { namespace: "academy-lesson-assessment", limit: 30, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("complete_account_required", 401);

    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return apiError("invalid_json", 400);
    }

    const locale = parseLocale(body.locale);
    const lessonId = String(body.lessonId ?? "").trim().slice(0, 160);
    const submission = normalizeSubmission(body.answers);
    const lesson = resolveLesson(locale, lessonId);
    if (!lesson || !submission) return apiError("invalid_lesson_assessment", 400);

    const grading = gradeQuizSubmission(lesson.knowledgeChecks, submission);
    const passThreshold = 80;
    const passed = grading.percent >= passThreshold;

    const result = await withTx(async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('academy_lesson_assessment'), hashtext($1))`,
        [`${session.studentId}:${locale}:${lesson.id}`],
      );

      const saved = await client.query<{ attempt_count: number; best_score: number; passed_at: string | null }>(
        `INSERT INTO academy_lesson_assessments
           (student_id, locale, lesson_id, term_number, attempt_count, latest_score, best_score,
            passed_at, latest_answers, latest_results, created_at, updated_at)
         VALUES ($1::uuid, $2, $3, $4, 1, $5, $5,
           CASE WHEN $6 THEN NOW() ELSE NULL END, $7::jsonb, $8::jsonb, NOW(), NOW())
         ON CONFLICT (student_id, locale, lesson_id) DO UPDATE SET
           attempt_count = academy_lesson_assessments.attempt_count + 1,
           latest_score = EXCLUDED.latest_score,
           best_score = GREATEST(academy_lesson_assessments.best_score, EXCLUDED.best_score),
           passed_at = COALESCE(academy_lesson_assessments.passed_at, EXCLUDED.passed_at),
           latest_answers = EXCLUDED.latest_answers,
           latest_results = EXCLUDED.latest_results,
           updated_at = NOW()
         RETURNING attempt_count, best_score, passed_at`,
        [
          session.studentId,
          locale,
          lesson.id,
          lesson.termNumber,
          grading.percent,
          passed,
          JSON.stringify(submission),
          JSON.stringify(grading.results),
        ],
      );

      await client.query(
        `INSERT INTO academy_student_events (student_id, event_type, payload)
         VALUES ($1::uuid, 'lesson_assessment_submitted', $2::jsonb)`,
        [session.studentId, JSON.stringify({
          locale,
          lessonId: lesson.id,
          termNumber: lesson.termNumber,
          score: grading.percent,
          passed,
          correct: grading.correct,
          total: grading.total,
          ip: getClientIp(req),
        })],
      );

      if (passed) {
        await issueAcademyReward(client, {
          studentId: session.studentId as string,
          locale,
          rewardCode: "lesson_complete",
          sourceType: "lesson_assessment",
          sourceRef: lesson.id,
          payload: { score: grading.percent },
        });
        if (grading.percent === 100) {
          await issueAcademyReward(client, {
            studentId: session.studentId as string,
            locale,
            rewardCode: "lesson_perfect_bonus",
            sourceType: "lesson_assessment",
            sourceRef: lesson.id,
            payload: { score: grading.percent },
          });
        }
      }

      const projection = await rebuildAcademyProgressProjection(client, session.studentId as string, locale);
      return {
        score: grading.percent,
        correct: grading.correct,
        total: grading.total,
        passed,
        passThreshold,
        attemptCount: Number(saved.rows[0]?.attempt_count ?? 1),
        bestScore: Number(saved.rows[0]?.best_score ?? grading.percent),
        projection,
      };
    });

    if (!result.enabled) return apiError("academy_progress_service_not_configured", 503);
    scheduleMentorProfileUpdate(session.studentId, "lesson_assessment_submitted");
    return apiOk(result.value, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}
