import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiError, apiOk, checkBodySize } from "@/lib/api-validation";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { recordLearningEvent } from "@/lib/learning-os";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import type { ArenaClosedTradeV2, ArenaExecutionStateV2 } from "@/lib/trading-arena-execution-v2";
import { validateArenaExecutionStateV2 } from "@/lib/trading-arena-execution-state-validation";
import {
  arenaReflectionEvidenceFromTrade,
  createArenaReflectionRequestHash,
  mapArenaReflectionRow,
  parseArenaReflectionIdempotencyKey,
  parseArenaReflectionInput,
  type ArenaReflectionRecord,
  type ArenaReflectionRow,
} from "@/lib/trading-arena-reflections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/trading-arena/reflections";
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REFLECTION_SELECT = `
  id::text, student_id::text, attempt_id::text, closed_trade_id,
  revision::text, decision_review, learned_lesson, emotional_review,
  mistake_tags, next_action_commitment, evidence_asset,
  evidence_realized_pnl::text, evidence_realized_pnl_rate::text,
  evidence_closure_reason, evidence_closed_at, evidence_mentor_flags,
  created_at, updated_at
`;

type AttemptEvidenceRow = {
  id: string;
  attempt_number: number;
  execution_state: unknown;
};

type ReflectionCommandRow = {
  request_hash: string;
  result_response: unknown;
};

type ReflectionResult = {
  attemptId: string;
  reflection: ArenaReflectionRecord;
};

function fail(error: string, status: number, details?: unknown) {
  return apiError(error, status, details, NO_STORE);
}

function attemptId(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value.toLowerCase() : null;
}

function responseObject(value: unknown): ReflectionResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<ReflectionResult>;
  return typeof raw.attemptId === "string" && raw.reflection && typeof raw.reflection === "object"
    ? raw as ReflectionResult
    : null;
}

async function loadOwnedAttempt(
  client: PoolClient,
  studentId: string,
  id: string,
  lock: boolean,
): Promise<{ attemptNumber: number; state: ArenaExecutionStateV2 } | null> {
  const result = await client.query<AttemptEvidenceRow>(
    `SELECT id::text, attempt_number, execution_state
     FROM academy_trading_arena_attempts
     WHERE id = $1::uuid AND student_id = $2::uuid
     LIMIT 1
     ${lock ? "FOR UPDATE" : "FOR SHARE"}`,
    [id, studentId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    attemptNumber: Number(row.attempt_number),
    state: validateArenaExecutionStateV2(row.execution_state),
  };
}

function findClosedTrade(state: ArenaExecutionStateV2, id: string): ArenaClosedTradeV2 | null {
  return state.closedTrades.find((trade) => trade.id === id) ?? null;
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function reflectionEvidenceMatchesTrade(
  reflection: ArenaReflectionRecord,
  trade: ArenaClosedTradeV2,
): boolean {
  return reflection.evidence.asset === trade.asset &&
    reflection.evidence.realizedPnl === trade.realizedPnl &&
    reflection.evidence.realizedPnlRate === trade.realizedPnlRate &&
    reflection.evidence.closureReason === trade.closureReason &&
    reflection.evidence.closedAt === new Date(trade.closedAt).toISOString() &&
    sameStringArray(reflection.evidence.mentorFlags, trade.mentorFlags);
}

async function listReflections(
  client: PoolClient,
  studentId: string,
  id: string,
): Promise<ArenaReflectionRecord[]> {
  const result = await client.query<ArenaReflectionRow>(
    `SELECT ${REFLECTION_SELECT}
     FROM academy_trading_arena_reflections
     WHERE student_id = $1::uuid AND attempt_id = $2::uuid
     ORDER BY evidence_closed_at DESC, updated_at DESC`,
    [studentId, id],
  );
  return result.rows.map(mapArenaReflectionRow);
}

async function currentReflection(
  client: PoolClient,
  studentId: string,
  id: string,
  closedTradeId: string,
): Promise<ArenaReflectionRecord | null> {
  const result = await client.query<ArenaReflectionRow>(
    `SELECT ${REFLECTION_SELECT}
     FROM academy_trading_arena_reflections
     WHERE student_id = $1::uuid AND attempt_id = $2::uuid AND closed_trade_id = $3
     LIMIT 1
     FOR UPDATE`,
    [studentId, id, closedTradeId],
  );
  return result.rows[0] ? mapArenaReflectionRow(result.rows[0]) : null;
}

export async function GET(request: NextRequest) {
  return withObservability(request, { route: ROUTE }, async () => {
    const limited = await rateLimit(request, {
      namespace: "arena-reflections-read",
      limit: 120,
      windowMs: 60_000,
    });
    if (!limited.ok) return fail("rate_limited", 429);

    const session = await getCanonicalSession(request);
    if (!session.studentId) return fail("academy_profile_required", 401);

    const id = attemptId(request.nextUrl.searchParams.get("attemptId"));
    if (!id) return fail("invalid_attempt_id", 400);

    try {
      const result = await withTx(async (client) => {
        const attempt = await loadOwnedAttempt(client, session.studentId as string, id, false);
        if (!attempt) return { error: "arena_attempt_not_found" as const };
        const reflections = await listReflections(client, session.studentId as string, id);
        const tradeById = new Map(attempt.state.closedTrades.map((trade) => [trade.id, trade]));
        for (const reflection of reflections) {
          const trade = tradeById.get(reflection.closedTradeId);
          if (!trade || !reflectionEvidenceMatchesTrade(reflection, trade)) {
            throw new Error("arena_reflection_evidence_corrupt");
          }
        }
        return {
          error: null,
          attemptId: id,
          attemptNumber: attempt.attemptNumber,
          reflections,
        };
      });

      if (!result.enabled) return fail("arena_reflections_unavailable", 503);
      if (result.value.error) return fail(result.value.error, 404);
      return apiOk(result.value, 200, NO_STORE);
    } catch {
      return fail("arena_reflections_unavailable", 503);
    }
  });
}

export async function POST(request: NextRequest) {
  return withObservability(request, { route: ROUTE }, async () => {
    if (!verifyCsrfOrigin(request)) return fail("forbidden", 403);
    if (!checkBodySize(request.headers.get("content-length"), 20_000)) {
      return fail("payload_too_large", 413);
    }

    const limited = await rateLimit(request, {
      namespace: "arena-reflections-write",
      limit: 40,
      windowMs: 60_000,
    });
    if (!limited.ok) return fail("rate_limited", 429);

    const session = await getCanonicalSession(request, { strictRevocation: true });
    if (!session.studentId) return fail("academy_profile_required", 401);

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail("invalid_json", 400);
    }

    const input = parseArenaReflectionInput(raw);
    const key = parseArenaReflectionIdempotencyKey(request.headers.get("idempotency-key"));
    if (!input) return fail("invalid_arena_reflection", 400);
    if (!key) return fail("idempotency_key_required", 400);

    const hash = createArenaReflectionRequestHash(input);
    const studentId = session.studentId as string;

    try {
      const result = await withTx(async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          `arena-reflection-command:${studentId}:${input.attemptId}:${key}`,
        ]);
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          `arena-reflection-trade:${studentId}:${input.attemptId}:${input.closedTradeId}`,
        ]);

        const attempt = await loadOwnedAttempt(client, studentId, input.attemptId, true);
        if (!attempt) return { error: "arena_attempt_not_found" as const };
        const trade = findClosedTrade(attempt.state, input.closedTradeId);
        if (!trade) return { error: "arena_closed_trade_not_found" as const };

        const command = await client.query<ReflectionCommandRow>(
          `SELECT request_hash, result_response
           FROM academy_trading_arena_reflection_commands
           WHERE student_id = $1::uuid AND attempt_id = $2::uuid AND idempotency_key = $3
           LIMIT 1`,
          [studentId, input.attemptId, key],
        );
        if (command.rows[0]) {
          if (command.rows[0].request_hash !== hash) {
            return { error: "idempotency_key_reused" as const };
          }
          const replay = responseObject(command.rows[0].result_response);
          if (!replay) throw new Error("arena_reflection_command_corrupt");
          return { error: null, replay: true, response: replay };
        }

        const existing = await currentReflection(
          client,
          studentId,
          input.attemptId,
          input.closedTradeId,
        );
        if (existing && !reflectionEvidenceMatchesTrade(existing, trade)) {
          throw new Error("arena_reflection_evidence_corrupt");
        }
        if (
          (input.expectedRevision === 0 && existing) ||
          (input.expectedRevision > 0 && (!existing || existing.revision !== input.expectedRevision))
        ) {
          return {
            error: "revision_conflict" as const,
            response: { attemptId: input.attemptId, reflection: existing },
          };
        }

        let saved: ArenaReflectionRow | undefined;
        if (input.expectedRevision === 0) {
          const evidence = arenaReflectionEvidenceFromTrade(trade);
          const inserted = await client.query<ArenaReflectionRow>(
            `INSERT INTO academy_trading_arena_reflections
               (id, student_id, attempt_id, closed_trade_id, revision,
                decision_review, learned_lesson, emotional_review, mistake_tags,
                next_action_commitment, evidence_asset, evidence_realized_pnl,
                evidence_realized_pnl_rate, evidence_closure_reason,
                evidence_closed_at, evidence_mentor_flags)
             VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 1,
                     $5, $6, $7, $8::jsonb, $9, $10, $11::numeric,
                     $12::numeric, $13, $14::timestamptz, $15::jsonb)
             RETURNING ${REFLECTION_SELECT}`,
            [
              randomUUID(),
              studentId,
              input.attemptId,
              input.closedTradeId,
              input.decisionReview,
              input.learnedLesson,
              input.emotionalReview,
              JSON.stringify(input.mistakeTags),
              input.nextActionCommitment,
              evidence.asset,
              evidence.realizedPnl,
              evidence.realizedPnlRate,
              evidence.closureReason,
              evidence.closedAt,
              JSON.stringify(evidence.mentorFlags),
            ],
          );
          saved = inserted.rows[0];
        } else {
          const updated = await client.query<ArenaReflectionRow>(
            `UPDATE academy_trading_arena_reflections
             SET decision_review = $5,
                 learned_lesson = $6,
                 emotional_review = $7,
                 mistake_tags = $8::jsonb,
                 next_action_commitment = $9,
                 revision = revision + 1,
                 updated_at = NOW()
             WHERE student_id = $1::uuid AND attempt_id = $2::uuid
               AND closed_trade_id = $3 AND revision = $4
             RETURNING ${REFLECTION_SELECT}`,
            [
              studentId,
              input.attemptId,
              input.closedTradeId,
              input.expectedRevision,
              input.decisionReview,
              input.learnedLesson,
              input.emotionalReview,
              JSON.stringify(input.mistakeTags),
              input.nextActionCommitment,
            ],
          );
          saved = updated.rows[0];
        }

        if (!saved) {
          const latest = await currentReflection(
            client,
            studentId,
            input.attemptId,
            input.closedTradeId,
          );
          return {
            error: "revision_conflict" as const,
            response: { attemptId: input.attemptId, reflection: latest },
          };
        }

        const reflection = mapArenaReflectionRow(saved);
        if (!reflectionEvidenceMatchesTrade(reflection, trade)) {
          throw new Error("arena_reflection_evidence_corrupt");
        }
        const response: ReflectionResult = { attemptId: input.attemptId, reflection };

        await client.query(
          `INSERT INTO academy_trading_arena_reflection_commands
             (id, student_id, attempt_id, closed_trade_id, idempotency_key,
              expected_revision, request_hash, result_revision, result_response)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9::jsonb)`,
          [
            randomUUID(),
            studentId,
            input.attemptId,
            input.closedTradeId,
            key,
            input.expectedRevision,
            hash,
            reflection.revision,
            JSON.stringify(response),
          ],
        );

        const eventPayload = {
          attemptId: input.attemptId,
          attemptNumber: attempt.attemptNumber,
          closedTradeId: input.closedTradeId,
          reflectionRevision: reflection.revision,
          mistakeTags: reflection.mistakeTags,
          asset: reflection.evidence.asset,
          realizedPnl: reflection.evidence.realizedPnl,
          closureReason: reflection.evidence.closureReason,
        };
        await client.query(
          `INSERT INTO academy_student_events (student_id, event_type, payload)
           VALUES ($1::uuid, 'arena_post_trade_reflection_saved', $2::jsonb)`,
          [studentId, JSON.stringify(eventPayload)],
        );
        await recordLearningEvent(client, {
          studentId,
          eventType: "simulator_decision_saved",
          source: "trading-arena-reflection",
          payload: { kind: "post_trade_reflection", ...eventPayload },
        });

        return { error: null, replay: false, response };
      });

      if (!result.enabled) return fail("arena_reflections_unavailable", 503);
      if (result.value.error === "revision_conflict") {
        return fail("revision_conflict", 409, result.value.response);
      }
      if (result.value.error === "idempotency_key_reused") {
        return fail("idempotency_key_reused", 409);
      }
      if (result.value.error === "arena_attempt_not_found") {
        return fail("arena_attempt_not_found", 404);
      }
      if (result.value.error === "arena_closed_trade_not_found") {
        return fail("arena_closed_trade_not_found", 404);
      }
      if (result.value.error) return fail(result.value.error, 400);

      if (!result.value.replay) {
        scheduleMentorProfileUpdate(studentId, "reflection_updated");
      }
      return apiOk(
        { ...result.value.response, idempotentReplay: result.value.replay },
        200,
        NO_STORE,
      );
    } catch {
      return fail("arena_reflections_unavailable", 503);
    }
  });
}
