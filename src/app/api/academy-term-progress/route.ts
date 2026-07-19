import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { academyPathTerms } from "@/data/academyPath";
import { academyPathTermsEn } from "@/data/academyPathEn";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { getCanonicalSession } from "@/lib/auth-session";
import { cleanText } from "@/lib/student-cartax";
import { withDb, withTx } from "@/lib/db";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import {
  awardAcademyReward,
  readLearningCommand,
  storeLearningCommand,
} from "@/lib/academy-authority";
import { ACADEMY_XP } from "@/lib/academy-reward-policy";
import { refreshAcademyProgressProjection } from "@/lib/academy-progress-projection";

type Queryable = {
  query: (
    query: string,
    values?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

function getTerm(locale: string, termNumber: number) {
  const list = locale === "en" ? academyPathTermsEn : academyPathTerms;
  return list.find((term) => term.number === termNumber);
}

function normalizeAnswers(value: unknown) {
  if (!value || typeof value !== "object") return {} as Record<string, string>;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, answer]) => [
      key,
      cleanText(answer, 500),
    ]),
  );
}

function normalizeAttemptLog(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, string[]>;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, attempts]) => [
      key,
      Array.isArray(attempts)
        ? attempts.map((item) => cleanText(item, 500)).slice(0, 20)
        : [],
    ]),
  );
}

async function hasPreviousTermPassed(
  client: Queryable,
  studentId: string,
  termNumber: number,
  locale: string,
) {
  if (termNumber <= 1) return true;
  const row = await client.query(
    `SELECT 1
       FROM academy_term_progress
      WHERE student_id = $1::uuid
        AND term_number = $2
        AND locale = $3
        AND status = 'passed'
      LIMIT 1`,
    [studentId, termNumber - 1, locale],
  );
  return Boolean(row.rows[0]);
}

export async function GET(req: NextRequest) {
  return withObservability(
    req,
    { route: "/api/academy-term-progress" },
    async () => {
      const limit = await rateLimit(req, {
        namespace: "academy-term-progress-read",
        limit: 120,
        windowMs: 60_000,
      });
      if (!limit.ok) return apiError("rate_limited", 429);

      const session = await getCanonicalSession(req, { strictRevocation: true });
      if (!session.studentId) return apiError("complete_account_required", 401);
      const locale = cleanText(
        new URL(req.url).searchParams.get("locale") || "fa",
        10,
      ) === "en" ? "en" : "fa";

      const result = await withDb(async (client) => {
        const rows = await client.query(
          `SELECT term_number, locale, score, percent, status, passed_at, updated_at
             FROM academy_term_progress
            WHERE student_id = $1::uuid AND locale = $2
            ORDER BY term_number ASC`,
          [session.studentId, locale],
        );
        return rows.rows;
      });
      if (!result.enabled) {
        return apiError("progress_service_not_configured", 503);
      }
      return apiOk(
        { terms: result.value || [] },
        200,
        { "Cache-Control": "no-store, max-age=0" },
      );
    },
  );
}

export async function POST(req: NextRequest) {
  return withObservability(
    req,
    { route: "/api/academy-term-progress" },
    async () => {
      if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);
      const limit = await rateLimit(req, {
        namespace: "academy-term-progress-submit",
        limit: 30,
        windowMs: 60_000,
      });
      if (!limit.ok) return apiError("rate_limited", 429);

      const session = await getCanonicalSession(req, { strictRevocation: true });
      if (!session.studentId) return apiError("complete_account_required", 401);
      const studentId = session.studentId;

      try {
        const raw = await req.text();
        if (raw.length > 20_000) return apiError("payload_too_large", 413);
        const body = JSON.parse(raw || "{}") as Record<string, unknown>;
        const termNumber = Math.max(
          1,
          Math.min(7, Math.round(Number(body.termNumber) || 1)),
        );
        const locale = cleanText(body.locale || "fa", 10) === "en" ? "en" : "fa";
        const term = getTerm(locale, termNumber);
        if (!term) return apiError("term_not_found", 404);

        const submitted = normalizeAnswers(body.answers);
        const attemptLog = normalizeAttemptLog(body.attemptLog);
        const total = term.questions.length;
        const evaluation = term.questions.reduce(
          (acc, item, index) => {
            const key = String(index);
            const attempts = attemptLog[key]?.length
              ? attemptLog[key]
              : submitted[key]
                ? [submitted[key]]
                : [];
            const finalAnswer = submitted[key];
            const finalCorrect = finalAnswer === item.answer;
            const firstCorrect = attempts[0] === item.answer;
            const attemptCount = Math.max(1, attempts.length || 1);
            const weighted = finalCorrect
              ? Math.max(40, 100 - (attemptCount - 1) * 20)
              : 0;
            return {
              rawCorrect: acc.rawCorrect + (finalCorrect ? 1 : 0),
              firstTryCorrect: acc.firstTryCorrect + (firstCorrect ? 1 : 0),
              weightedTotal: acc.weightedTotal + weighted,
              wrongAttempts:
                acc.wrongAttempts
                + attempts.filter((answer) => answer !== item.answer).length,
            };
          },
          {
            rawCorrect: 0,
            firstTryCorrect: 0,
            weightedTotal: 0,
            wrongAttempts: 0,
          },
        );
        const score = evaluation.rawCorrect;
        const percent = total
          ? Math.round(evaluation.weightedTotal / total)
          : 0;
        const allFinalCorrect = total > 0 && score === total;
        const passed =
          allFinalCorrect
          && percent >= Number(process.env.ACADEMY_TERM_PASS_PERCENT || 80);
        const idempotencyKey = cleanText(
          req.headers.get("Idempotency-Key") ?? body.idempotencyKey,
          160,
        );
        if (!/^[A-Za-z0-9._:-]{16,160}$/.test(idempotencyKey)) {
          return apiError("idempotency_key_required", 400);
        }

        const commandType = `term_assessment:${locale}:${termNumber}`;
        const commandRequest = {
          termNumber,
          locale,
          answers: submitted,
          attemptLog,
        };

        const result = await withTx(async (client) => {
          await client.query(
            `SELECT pg_advisory_xact_lock(
              hashtext('academy_term_assessment'),
              hashtext($1)
            )`,
            [`${studentId}:${locale}:${termNumber}`],
          );
          await client.query(
            `SELECT pg_advisory_xact_lock(
              hashtext('academy_learning_idempotency'),
              hashtext($1)
            )`,
            [`${studentId}:${idempotencyKey}`],
          );

          const command = await readLearningCommand<Record<string, unknown>>(
            client,
            studentId,
            commandType,
            commandRequest,
            idempotencyKey,
          );
          if (command.idempotencyConflict) {
            return { idempotencyConflict: true as const };
          }
          if (command.response) {
            const projection = await refreshAcademyProgressProjection(
              client,
              studentId,
              locale,
            );
            return {
              ...command.response,
              state: projection.state,
              revision: projection.revision,
              replayed: true,
            };
          }

          const previousPassed = await hasPreviousTermPassed(
            client,
            studentId,
            termNumber,
            locale,
          );
          if (!previousPassed) return { blocked: true as const };

          await client.query(
            `INSERT INTO academy_term_progress
              (student_id, term_number, locale, score, percent, status, passed_at)
             VALUES
              ($1::uuid, $2, $3, $4, $5, $6,
               CASE WHEN $6 = 'passed' THEN NOW() ELSE NULL END)
             ON CONFLICT (student_id, term_number, locale) DO UPDATE SET
               score = GREATEST(academy_term_progress.score, EXCLUDED.score),
               percent = GREATEST(academy_term_progress.percent, EXCLUDED.percent),
               status = CASE
                 WHEN academy_term_progress.status = 'passed'
                   OR EXCLUDED.status = 'passed'
                 THEN 'passed'
                 ELSE 'attempted'
               END,
               passed_at = COALESCE(
                 academy_term_progress.passed_at,
                 EXCLUDED.passed_at
               ),
               updated_at = NOW()`,
            [
              studentId,
              termNumber,
              locale,
              score,
              percent,
              passed ? "passed" : "attempted",
            ],
          );

          await awardAcademyReward(client, {
            studentId,
            locale,
            rewardKey: "badge:first-quiz",
            rewardType: "badge",
            sourceType: "term_assessment",
            sourceId: `term-${termNumber}`,
            badgeCode: "first-quiz",
            metadata: { termNumber },
          });
          if (passed) {
            await awardAcademyReward(client, {
              studentId,
              locale,
              rewardKey: `term:${termNumber}:passed`,
              rewardType: "term_pass",
              sourceType: "term_assessment",
              sourceId: `term-${termNumber}`,
              xp: ACADEMY_XP.TERM_PASS,
              metadata: { score, percent },
            });
            if (termNumber === 7) {
              await awardAcademyReward(client, {
                studentId,
                locale,
                rewardKey: "badge:academy-graduate",
                rewardType: "badge",
                sourceType: "term_assessment",
                sourceId: "term-7",
                badgeCode: "academy-graduate",
                metadata: { score, percent },
              });
            }
          }

          await client.query(
            `INSERT INTO academy_student_events
              (student_id, event_type, payload, ip)
             VALUES ($1::uuid, 'term_quiz_submitted', $2::jsonb, $3)`,
            [
              studentId,
              JSON.stringify({
                termNumber,
                locale,
                score,
                percent,
                passed,
                firstTryCorrect: evaluation.firstTryCorrect,
                wrongAttempts: evaluation.wrongAttempts,
                authority: "server_term_assessment_v2",
              }),
              getClientIp(req),
            ],
          );

          const projection = await refreshAcademyProgressProjection(
            client,
            studentId,
            locale,
          );
          const response = {
            score,
            percent,
            passed,
            termNumber,
            state: projection.state,
            revision: projection.revision,
          };
          await storeLearningCommand(client, {
            studentId,
            commandType,
            requestHash: command.requestHash,
            idempotencyKey,
            result: response,
          });
          return { ...response, replayed: false };
        });

        if (!result.enabled) {
          return apiError("progress_service_not_configured", 503);
        }
        if (
          "idempotencyConflict" in result.value
          && result.value.idempotencyConflict
        ) {
          return apiError("idempotency_key_conflict", 409);
        }
        if ("blocked" in result.value && result.value.blocked) {
          return apiError(
            "previous_term_required",
            403,
            { score, percent, passed: false, termNumber },
          );
        }

        const responseBody = result.value as Record<string, unknown>;
        if (responseBody.replayed !== true) {
          scheduleMentorProfileUpdate(
            studentId,
            "authoritative_term_assessment",
          );
        }
        return apiOk(
          responseBody,
          200,
          { "Cache-Control": "no-store, max-age=0" },
        );
      } catch (error) {
        if (error instanceof SyntaxError) return apiError("invalid_json", 400);
        return apiError("server_error", 500);
      }
    },
  );
}
