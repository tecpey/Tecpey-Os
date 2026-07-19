import { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { withTx } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { apiError, apiOk, checkBodySize } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";
import {
  ensureLegacyProgressSnapshot,
  gradeLessonAssessment,
  hashLessonAssessmentRequest,
  issueAcademyReward,
  rebuildAcademyProgressProjection,
  type AcademyLocale,
} from "@/lib/academy-progress-authority";
import { XP_TABLE } from "@/lib/academy-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,120}$/;

function parseLocale(value: unknown): AcademyLocale {
  return value === "en" ? "en" : "fa";
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-lesson-assessment" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    if (!checkBodySize(req.headers.get("content-length"), 64_000)) return apiError("payload_too_large", 413);

    const limit = await rateLimit(req, {
      namespace: "academy-lesson-assessment-submit",
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("complete_account_required", 401);

    let body: Record<string, unknown>;
    try {
      const raw = await req.text();
      if (raw.length > 64_000) return apiError("payload_too_large", 413);
      body = JSON.parse(raw || "{}") as Record<string, unknown>;
    } catch {
      return apiError("invalid_json", 400);
    }

    const locale = parseLocale(body.locale);
    const lessonId = String(body.lessonId ?? "").trim().slice(0, 160);
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    const answers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
      ? body.answers as Record<string, unknown>
      : null;
    if (!lessonId || !answers || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      return apiError("invalid_lesson_assessment", 400);
    }

    const evaluation = gradeLessonAssessment({ locale, lessonId, answers });
    if (!evaluation) return apiError("lesson_assessment_not_found", 404);
    const requestHash = hashLessonAssessmentRequest({
      locale,
      lessonId,
      answers: evaluation.answers,
    });

    const result = await withTx(async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('academy_lesson_assessment'), hashtext($1))`,
        [`${session.studentId}:${locale}:${lessonId}`],
      );
      const legacy = await ensureLegacyProgressSnapshot(client, session.studentId as string, locale);
      const legacyCompletion = legacy.baseline.completedLessons[lessonId];

      const existing = await client.query<{
        request_hash: string;
        score: number;
        passed: boolean;
        correct_count: number;
        question_count: number;
      }>(
        `SELECT request_hash, score, passed, correct_count, question_count
         FROM academy_lesson_assessment_attempts
         WHERE student_id = $1::uuid AND locale = $2 AND lesson_id = $3 AND idempotency_key = $4
         LIMIT 1`,
        [session.studentId, locale, lessonId, idempotencyKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_hash !== requestHash) return { conflict: true as const };
        const projection = await rebuildAcademyProgressProjection(client, session.studentId as string, locale);
        return {
          conflict: false as const,
          replayed: true,
          score: Number(existing.rows[0].score),
          passed: Boolean(existing.rows[0].passed),
          correctCount: Number(existing.rows[0].correct_count),
          questionCount: Number(existing.rows[0].question_count),
          rewardDelta: 0,
          projection,
        };
      }

      await client.query(
        `INSERT INTO academy_lesson_assessment_attempts
           (student_id, locale, lesson_id, term_number, idempotency_key, request_hash,
            answers, score, passed, correct_count, question_count, created_at)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, NOW())`,
        [
          session.studentId,
          locale,
          lessonId,
          evaluation.lesson.termNumber,
          idempotencyKey,
          requestHash,
          JSON.stringify(evaluation.answers),
          evaluation.score,
          evaluation.passed,
          evaluation.correctCount,
          evaluation.questionCount,
        ],
      );

      let rewardDelta = 0;
      if (evaluation.passed) {
        if (!legacyCompletion && await issueAcademyReward(client, {
          studentId: session.studentId as string,
          locale,
          rewardType: "lesson_complete",
          sourceType: "lesson_assessment",
          sourceKey: lessonId,
          amount: XP_TABLE.LESSON_COMPLETE,
          payload: { lessonId, termNumber: evaluation.lesson.termNumber, score: evaluation.score },
        })) rewardDelta += XP_TABLE.LESSON_COMPLETE;

        if (evaluation.score === 100 && (legacyCompletion?.score ?? 0) < 100 && await issueAcademyReward(client, {
          studentId: session.studentId as string,
          locale,
          rewardType: "lesson_perfect_bonus",
          sourceType: "lesson_assessment",
          sourceKey: lessonId,
          amount: XP_TABLE.LESSON_PERFECT_BONUS,
          payload: { lessonId, termNumber: evaluation.lesson.termNumber, score: evaluation.score },
        })) rewardDelta += XP_TABLE.LESSON_PERFECT_BONUS;

        await issueAcademyReward(client, {
          studentId: session.studentId as string,
          locale,
          rewardType: "badge",
          sourceType: "achievement",
          sourceKey: "first-lesson",
          amount: 0,
          payload: { badgeCode: "first-lesson", lessonId },
        });
      }

      await client.query(
        `INSERT INTO academy_student_events (student_id, event_type, payload, ip)
         VALUES ($1::uuid, 'lesson_assessment_submitted', $2::jsonb, $3)`,
        [session.studentId, JSON.stringify({
          locale,
          lessonId,
          termNumber: evaluation.lesson.termNumber,
          score: evaluation.score,
          passed: evaluation.passed,
          correctCount: evaluation.correctCount,
          questionCount: evaluation.questionCount,
          idempotencyKey,
        }), getClientIp(req)],
      );

      const projection = await rebuildAcademyProgressProjection(client, session.studentId as string, locale);
      return {
        conflict: false as const,
        replayed: false,
        score: evaluation.score,
        passed: evaluation.passed,
        correctCount: evaluation.correctCount,
        questionCount: evaluation.questionCount,
        rewardDelta,
        projection,
      };
    });

    if (!result.enabled) return apiError("progress_service_not_configured", 503);
    if (result.value.conflict) return apiError("idempotency_conflict", 409);

    scheduleMentorProfileUpdate(session.studentId, "lesson_assessment_submitted");
    return apiOk({
      lessonId,
      score: result.value.score,
      passed: result.value.passed,
      correctCount: result.value.correctCount,
      questionCount: result.value.questionCount,
      rewardDelta: result.value.rewardDelta,
      replayed: result.value.replayed,
      state: result.value.projection.state,
      revision: result.value.projection.revision,
      updatedAt: result.value.projection.updatedAt,
    }, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}
