import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  calculateOfficialJournalChallengeEvidence,
  deriveOfficialJournalChallengeCycle,
  OFFICIAL_JOURNAL_CHALLENGE_ID,
  OFFICIAL_JOURNAL_CHALLENGE_MIN_TRADES,
  OFFICIAL_JOURNAL_CHALLENGE_REQUIRED_RATE,
  OFFICIAL_JOURNAL_CHALLENGE_VERSION,
  officialJournalChallengeHash,
  officialJournalChallengeIso,
  validateOfficialJournalChallengeEnrollmentRow,
  type OfficialJournalChallengeCycle,
  type OfficialJournalChallengeEnrollmentRow,
} from "@/lib/community-journal-challenge-authority";
import type { AvailableTenantPrincipalContext } from "@/lib/security/tenant-principal-context";

const MAX_BATCH = 250;
const ENROLLMENT_SELECT = `
  enrollment.id::text,
  enrollment.tenant_id,
  enrollment.workspace_id,
  enrollment.principal_type,
  enrollment.principal_id,
  enrollment.student_id::text,
  enrollment.challenge_id,
  enrollment.challenge_version,
  enrollment.cycle_key,
  enrollment.cycle_starts_at,
  enrollment.cycle_ends_at,
  enrollment.status,
  enrollment.revision::text,
  enrollment.started_at,
  enrollment.evaluated_at,
  enrollment.completed_at,
  enrollment.finalized_at,
  enrollment.finalization_source,
  enrollment.finalization_run_id::text,
  enrollment.eligible_closed_trade_count,
  enrollment.valid_reflection_count,
  enrollment.coverage_rate::text
`;

export type OfficialJournalChallengeFinalizedResult = {
  challengeId: typeof OFFICIAL_JOURNAL_CHALLENGE_ID;
  challengeVersion: typeof OFFICIAL_JOURNAL_CHALLENGE_VERSION;
  cycle: OfficialJournalChallengeCycle;
  status: "completed" | "not_completed";
  finalizedAt: string;
  progress: {
    eligibleClosedTrades: number;
    validReflections: number;
    coverageRate: number;
    minimumTrades: number;
    requiredRate: number;
    eligibleToComplete: boolean;
  };
  rewards: {
    xp: 0;
    badge: null;
    financialReward: null;
    status: "disabled";
  };
};

export type OfficialJournalChallengeFinalizationFailure = {
  enrollmentFingerprint: string;
  reason:
    | "principal_binding_inactive"
    | "cycle_authority_invalid"
    | "evidence_invalid"
    | "finalization_conflict"
    | "finalization_failed";
};

export type OfficialJournalChallengeFinalizationSummary = {
  available: true;
  runId: string;
  selected: number;
  finalizedCompleted: number;
  finalizedNotCompleted: number;
  failures: OfficialJournalChallengeFinalizationFailure[];
};

export type OfficialJournalChallengeFinalizationResult =
  | OfficialJournalChallengeFinalizationSummary
  | { available: false; runId: string };

function fingerprintEnrollment(row: OfficialJournalChallengeEnrollmentRow): string {
  return createHash("sha256")
    .update([
      row.tenant_id ?? "",
      row.workspace_id ?? "",
      row.principal_id ?? "",
      row.id,
    ].join("\0"))
    .digest("hex")
    .slice(0, 24);
}

function cycleForRow(row: OfficialJournalChallengeEnrollmentRow): OfficialJournalChallengeCycle {
  const start = new Date(row.cycle_starts_at);
  if (!Number.isFinite(start.getTime())) {
    throw new Error("community_challenge_cycle_invalid");
  }
  const derived = deriveOfficialJournalChallengeCycle(start);
  validateOfficialJournalChallengeEnrollmentRow(row, derived);
  return derived;
}

function classifiedFailure(error: unknown): OfficialJournalChallengeFinalizationFailure["reason"] {
  const message = String(error);
  if (message.includes("principal_binding_inactive")) return "principal_binding_inactive";
  if (message.includes("cycle") || message.includes("enrollment_authority")) {
    return "cycle_authority_invalid";
  }
  if (
    message.includes("evidence") ||
    message.includes("reflection") ||
    message.includes("trade_") ||
    message.includes("attempt_") ||
    message.includes("progress_")
  ) {
    return "evidence_invalid";
  }
  if (message.includes("finalization_conflict")) return "finalization_conflict";
  return "finalization_failed";
}

async function assertActiveBinding(
  client: PoolClient,
  row: OfficialJournalChallengeEnrollmentRow,
): Promise<void> {
  const result = await client.query<{ ok: boolean }>(
    `SELECT TRUE AS ok
       FROM platform_principal_bindings
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND principal_type = 'student'
        AND principal_id = $3
        AND status = 'active'
      LIMIT 1`,
    [row.tenant_id, row.workspace_id, row.principal_id],
  );
  if (!result.rows[0]?.ok) throw new Error("community_challenge_principal_binding_inactive");
}

async function finalizeOne(
  client: PoolClient,
  row: OfficialJournalChallengeEnrollmentRow,
  runId: string,
  finalizedAt: string,
): Promise<"completed" | "not_completed"> {
  await assertActiveBinding(client, row);
  const cycle = cycleForRow(row);
  if (row.status !== "active") throw new Error("community_challenge_finalization_conflict");
  if (new Date(cycle.endsAt).getTime() > new Date(finalizedAt).getTime()) {
    throw new Error("community_challenge_cycle_not_ended");
  }

  const validated = validateOfficialJournalChallengeEnrollmentRow(row, cycle);
  const progress = await calculateOfficialJournalChallengeEvidence(
    client,
    row.student_id ?? row.principal_id ?? "",
    validated.startedAt,
    cycle.endsAt,
  );
  const status = progress.eligibleToComplete ? "completed" : "not_completed";
  const updated = await client.query<OfficialJournalChallengeEnrollmentRow>(
    `UPDATE academy_community_challenge_enrollments AS enrollment
        SET status = $2,
            revision = revision + 1,
            evaluated_at = $3::timestamptz,
            completed_at = CASE WHEN $2 = 'completed' THEN $3::timestamptz ELSE NULL END,
            finalized_at = $3::timestamptz,
            finalization_source = 'worker',
            finalization_run_id = $4::uuid,
            eligible_closed_trade_count = $5,
            valid_reflection_count = $6
      WHERE enrollment.id = $1::uuid
        AND enrollment.status = 'active'
        AND enrollment.cycle_ends_at <= $3::timestamptz
      RETURNING ${ENROLLMENT_SELECT}`,
    [
      row.id,
      status,
      finalizedAt,
      runId,
      progress.eligibleClosedTrades,
      progress.validReflections,
    ],
  );
  const terminal = updated.rows[0];
  if (!terminal) throw new Error("community_challenge_finalization_conflict");
  validateOfficialJournalChallengeEnrollmentRow(terminal, cycle);

  const eventType = status === "completed"
    ? "finalized_completed"
    : "finalized_not_completed";
  const idempotencyKey = `challenge-finalize-${row.id}`;
  const evidence = {
    challengeId: OFFICIAL_JOURNAL_CHALLENGE_ID,
    challengeVersion: OFFICIAL_JOURNAL_CHALLENGE_VERSION,
    cycleKey: cycle.key,
    evidenceStartsAt: validated.startedAt,
    evidenceEndsAt: cycle.endsAt,
    finalizedAt,
    finalizationSource: "worker",
    finalizationRunId: runId,
    eligibleClosedTrades: progress.eligibleClosedTrades,
    validReflections: progress.validReflections,
    coverageRate: progress.coverageRate,
    minimumTrades: OFFICIAL_JOURNAL_CHALLENGE_MIN_TRADES,
    requiredRate: OFFICIAL_JOURNAL_CHALLENGE_REQUIRED_RATE,
    result: status,
    rewardsEnabled: false,
  };
  await client.query(
    `INSERT INTO academy_community_challenge_events
       (id, enrollment_id, event_type, idempotency_key, request_hash, evidence)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb)`,
    [
      randomUUID(),
      row.id,
      eventType,
      idempotencyKey,
      officialJournalChallengeHash(evidence),
      JSON.stringify(evidence),
    ],
  );
  return status;
}

export async function finalizeEndedOfficialJournalChallenges(
  requestedLimit = 100,
  suppliedRunId?: string,
): Promise<OfficialJournalChallengeFinalizationResult> {
  const runId = suppliedRunId ?? randomUUID();
  const limit = Math.max(1, Math.min(MAX_BATCH, Math.trunc(requestedLimit)));
  try {
    const transaction = await withTx(async (client) => {
      const clock = await client.query<{ now: Date }>("SELECT NOW() AS now");
      const finalizedAt = officialJournalChallengeIso(clock.rows[0].now);
      const selected = await client.query<OfficialJournalChallengeEnrollmentRow>(
        `SELECT ${ENROLLMENT_SELECT}
           FROM academy_community_challenge_enrollments AS enrollment
          WHERE enrollment.status = 'active'
            AND enrollment.challenge_id = $1
            AND enrollment.challenge_version = $2
            AND enrollment.cycle_ends_at <= $3::timestamptz
          ORDER BY enrollment.cycle_ends_at ASC, enrollment.id ASC
          LIMIT $4
          FOR UPDATE OF enrollment SKIP LOCKED`,
        [
          OFFICIAL_JOURNAL_CHALLENGE_ID,
          OFFICIAL_JOURNAL_CHALLENGE_VERSION,
          finalizedAt,
          limit,
        ],
      );

      let finalizedCompleted = 0;
      let finalizedNotCompleted = 0;
      const failures: OfficialJournalChallengeFinalizationFailure[] = [];
      for (const row of selected.rows) {
        await client.query("SAVEPOINT community_challenge_finalize_row");
        try {
          const result = await finalizeOne(client, row, runId, finalizedAt);
          if (result === "completed") finalizedCompleted += 1;
          else finalizedNotCompleted += 1;
          await client.query("RELEASE SAVEPOINT community_challenge_finalize_row");
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT community_challenge_finalize_row");
          await client.query("RELEASE SAVEPOINT community_challenge_finalize_row");
          failures.push({
            enrollmentFingerprint: fingerprintEnrollment(row),
            reason: classifiedFailure(error),
          });
          logger.error("[community-challenge-finalizer] enrollment failed", {
            runId,
            enrollmentFingerprint: fingerprintEnrollment(row),
            reason: classifiedFailure(error),
          });
        }
      }
      return {
        available: true,
        runId,
        selected: selected.rows.length,
        finalizedCompleted,
        finalizedNotCompleted,
        failures,
      } as const;
    });
    if (!transaction.enabled) return { available: false, runId };
    return transaction.value;
  } catch (error) {
    logger.error("[community-challenge-finalizer] batch failed", {
      runId,
      error: String(error),
    });
    return { available: false, runId };
  }
}

function assertReadContext(context: AvailableTenantPrincipalContext): void {
  if (
    context.principalType !== "student" ||
    !context.principalId ||
    !context.scopes.includes("community:challenge:read")
  ) {
    throw new Error("community_challenge_context_invalid");
  }
}

function finalizedProjection(
  row: OfficialJournalChallengeEnrollmentRow,
): OfficialJournalChallengeFinalizedResult {
  const cycle = cycleForRow(row);
  const validated = validateOfficialJournalChallengeEnrollmentRow(row, cycle);
  if (
    (row.status !== "completed" && row.status !== "not_completed") ||
    !validated.finalizedAt
  ) {
    throw new Error("community_challenge_finalized_projection_invalid");
  }
  return {
    challengeId: OFFICIAL_JOURNAL_CHALLENGE_ID,
    challengeVersion: OFFICIAL_JOURNAL_CHALLENGE_VERSION,
    cycle,
    status: row.status,
    finalizedAt: validated.finalizedAt,
    progress: {
      ...validated.progress,
      minimumTrades: OFFICIAL_JOURNAL_CHALLENGE_MIN_TRADES,
      requiredRate: OFFICIAL_JOURNAL_CHALLENGE_REQUIRED_RATE,
    },
    rewards: { xp: 0, badge: null, financialReward: null, status: "disabled" },
  };
}

export async function loadLatestFinalizedOfficialJournalChallenge(
  context: AvailableTenantPrincipalContext,
): Promise<
  | { available: true; result: OfficialJournalChallengeFinalizedResult | null }
  | { available: false; result: null }
> {
  try {
    assertReadContext(context);
    const transaction = await withTx(async (client) => {
      const query = await client.query<OfficialJournalChallengeEnrollmentRow>(
        `SELECT ${ENROLLMENT_SELECT}
           FROM academy_community_challenge_enrollments AS enrollment
           JOIN platform_principal_bindings AS binding
             ON binding.tenant_id = enrollment.tenant_id
            AND binding.workspace_id = enrollment.workspace_id
            AND binding.principal_type = enrollment.principal_type
            AND binding.principal_id = enrollment.principal_id
            AND binding.status = 'active'
          WHERE enrollment.tenant_id = $1
            AND enrollment.workspace_id = $2
            AND enrollment.principal_type = 'student'
            AND enrollment.principal_id = $3
            AND enrollment.challenge_id = $4
            AND enrollment.challenge_version = $5
            AND enrollment.status IN ('completed', 'not_completed')
            AND enrollment.finalized_at IS NOT NULL
            AND enrollment.cycle_ends_at <= NOW()
          ORDER BY enrollment.cycle_ends_at DESC, enrollment.finalized_at DESC
          LIMIT 1`,
        [
          context.tenantId,
          context.workspaceId,
          context.principalId,
          OFFICIAL_JOURNAL_CHALLENGE_ID,
          OFFICIAL_JOURNAL_CHALLENGE_VERSION,
        ],
      );
      return query.rows[0] ? finalizedProjection(query.rows[0]) : null;
    });
    if (!transaction.enabled) return { available: false, result: null };
    return { available: true, result: transaction.value };
  } catch (error) {
    logger.error("[community-challenge-finalizer] latest result load failed", {
      requestId: context.requestId,
      principalFingerprint: createHash("sha256")
        .update(`${context.tenantId}\0${context.principalId}`)
        .digest("hex"),
      error: String(error),
    });
    return { available: false, result: null };
  }
}
