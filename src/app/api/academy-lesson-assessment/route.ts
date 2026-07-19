import { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { withTx } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { apiError, apiOk, checkBodySize } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { cleanText } from "@/lib/student-cartax";
import { canonicalizeLessonAnswers, gradeCanonicalLesson, type QuizAnswerMap } from "@/lib/academy-assessment";
import { awardAcademyReward, readLearningCommand, storeLearningCommand } from "@/lib/academy-authority";
import { ACADEMY_XP } from "@/lib/academy-reward-policy";
import { refreshAcademyProgressProjection } from "@/lib/academy-progress-projection";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseLocale(value: unknown): "fa" | "en" {
  return value === "en" ? "en" : "fa";
}

function parseAnswers(value: unknown): QuizAnswerMap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 50) return null;
  const answers: QuizAnswerMap = {};
  for (const [questionId, raw] of entries) {
    const key = cleanText(questionId, 180);
    if (!key) return null;
    if (typeof raw === "string") answers[key] = cleanText(raw, 1_000);
    else if (Array.isArray(raw)) answers[key] = raw.map((item) => cleanText(item, 1_000)).filter(Boolean).slice(0, 30);
    else if (raw && typeof raw === "object") {
      answers[key] = Object.fromEntries(
        Object.entries(raw as Record<string, unknown>)
          .slice(0, 30)
          .map(([left, right]) => [cleanText(left, 500), cleanText(right, 1_000)])
          .filter(([left, right]) => Boolean(left && right)),
      );
    } else return null;
  }
  return answers;
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
    if (locale !== "fa") return apiError("lesson_locale_not_supported", 400);
    const lessonId = cleanText(body.lessonId, 180);
    const answers = parseAnswers(body.answers);
    const idempotencyKey = cleanText(req.headers.get("Idempotency-Key") ?? body.idempotencyKey, 120) || null;
    if (!lessonId || !answers || (idempotencyKey && idempotencyKey.length < 8)) {
      return apiError("invalid_lesson_assessment", 400);
    }

    const canonicalAnswers = canonicalizeLessonAnswers(lessonId, answers);
    const assessment = canonicalAnswers ? gradeCanonicalLesson(lessonId, canonicalAnswers) : null;
    if (!assessment || !canonicalAnswers) return apiError("lesson_not_found", 404);
    const commandType = `lesson_assessment:${assessment.lessonId}`;
    const commandRequest = { locale, lessonId: assessment.lessonId, answers: canonicalAnswers };

    const result = await withTx(async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('academy_lesson_assessment'), hashtext($1))`,
        [`${session.studentId}:${locale}:${assessment.lessonId}`],
      );

      if (idempotencyKey) {
        await client.query(
          `SELECT pg_advisory_xact_lock(hashtext('academy_learning_idempotency'), hashtext($1))`,
          [`${session.studentId}:${idempotencyKey}`],
        );
      }
      const command = await readLearningCommand<Record<string, unknown>>(
        client,
        session.studentId as string,
        commandType,
        commandRequest,
        idempotencyKey,
      );
      if (command.idempotencyConflict) return { idempotencyConflict: true as const };
      if (command.response) {
        const projection = await refreshAcademyProgressProjection(client, session.studentId as string, locale);
        return {
          ...command.response,
          state: projection.state,
          revision: projection.revision,
          replayed: true,
        };
      }

      if (assessment.termNumber > 1) {
        const previous = await client.query(
          `SELECT 1 FROM academy_term_progress
           WHERE student_id = $1::uuid AND locale = $2 AND term_number = $3 AND status = 'passed'
           LIMIT 1`,
          [session.studentId, locale, assessment.termNumber - 1],
        );
        if (!previous.rows[0]) return { blocked: true as const };
      }

      const prior = await client.query<{ passed_at: string | null; best_score: number }>(
        `SELECT passed_at, best_score
         FROM academy_lesson_assessments
         WHERE student_id = $1::uuid AND locale = $2 AND lesson_id = $3
         FOR UPDATE`,
        [session.studentId, locale, assessment.lessonId],
      );
      const firstPass = assessment.passed && !prior.rows[0]?.passed_at;

      await client.query(
        `INSERT INTO academy_lesson_assessments
           (student_id, locale, lesson_id, term_number, module_id, best_score, attempt_count, last_score, passed_at)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, 1, $6, CASE WHEN $7 THEN NOW() ELSE NULL END)
         ON CONFLICT (student_id, locale, lesson_id) DO UPDATE SET
           best_score = GREATEST(academy_lesson_assessments.best_score, EXCLUDED.best_score),
           attempt_count = academy_lesson_assessments.attempt_count + 1,
           last_score = EXCLUDED.last_score,
           passed_at = COALESCE(academy_lesson_assessments.passed_at, EXCLUDED.passed_at),
           updated_at = NOW()`,
        [
          session.studentId,
          locale,
          assessment.lessonId,
          assessment.termNumber,
          assessment.moduleId,
          assessment.score,
          assessment.passed,
        ],
      );

      let completionRewarded = false;
      let perfectBonusRewarded = false;
      if (assessment.passed) {
        completionRewarded = await awardAcademyReward(client, {
          studentId: session.studentId as string,
          locale,
          rewardKey: `lesson:${assessment.lessonId}:complete`,
          rewardType: "lesson_complete",
          sourceType: "lesson_assessment",
          sourceId: assessment.lessonId,
          xp: ACADEMY_XP.LESSON_COMPLETE,
          metadata: { score: assessment.score, termNumber: assessment.termNumber },
        });
        if (assessment.perfect) {
          perfectBonusRewarded = await awardAcademyReward(client, {
            studentId: session.studentId as string,
            locale,
            rewardKey: `lesson:${assessment.lessonId}:perfect`,
            rewardType: "lesson_perfect_bonus",
            sourceType: "lesson_assessment",
            sourceId: assessment.lessonId,
            xp: ACADEMY_XP.LESSON_PERFECT_BONUS,
            metadata: { score: assessment.score, termNumber: assessment.termNumber },
          });
        }
        await awardAcademyReward(client, {
          studentId: session.studentId as string,
          locale,
          rewardKey: "badge:first-lesson",
          rewardType: "badge",
          sourceType: "lesson_assessment",
          sourceId: assessment.lessonId,
          badgeCode: "first-lesson",
          metadata: { lessonId: assessment.lessonId },
        });
      }

      await client.query(
        `INSERT INTO academy_student_events (student_id, event_type, payload, ip)
         VALUES ($1::uuid, 'lesson_assessment_submitted', $2::jsonb, $3)`,
        [
          session.studentId,
          JSON.stringify({
            locale,
            lessonId: assessment.lessonId,
            termNumber: assessment.termNumber,
            score: assessment.score,
            passed: assessment.passed,
            firstPass,
            completionRewarded,
            perfectBonusRewarded,
            authority: "server_assessment_v1",
          }),
          getClientIp(req),
        ],
      );

      const projection = await refreshAcademyProgressProjection(client, session.studentId as string, locale);
      const response = {
        lessonId: assessment.lessonId,
        termNumber: assessment.termNumber,
        score: assessment.score,
        correctCount: assessment.correctCount,
        totalQuestions: assessment.totalQuestions,
        passed: assessment.passed,
        perfect: assessment.perfect,
        firstPass,
        state: projection.state,
        revision: projection.revision,
      };
      await storeLearningCommand(client, {
        studentId: session.studentId as string,
        commandType,
        requestHash: command.requestHash,
        idempotencyKey,
        result: response,
      });
      return { ...response, replayed: false };
    });

    if (!result.enabled) return apiError("lesson_assessment_service_not_configured", 503);
    if ("idempotencyConflict" in result.value && result.value.idempotencyConflict) {
      return apiError("idempotency_key_conflict", 409);
    }
    if ("blocked" in result.value && result.value.blocked) return apiError("previous_term_required", 403);
    const responseBody = result.value as Record<string, unknown>;
    if (responseBody.replayed !== true) {
      scheduleMentorProfileUpdate(session.studentId, "authoritative_lesson_assessment");
    }
    return apiOk(responseBody, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}
