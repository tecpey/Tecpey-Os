import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  OFFICIAL_JOURNAL_CHALLENGE_ID,
  OFFICIAL_JOURNAL_CHALLENGE_VERSION,
  officialJournalChallengeIso,
} from "@/lib/community-journal-challenge-authority";
import {
  evaluateJournalDisciplineScore,
  JOURNAL_DISCIPLINE_SCORE_LOOKBACK_CYCLES,
  type JournalDisciplineScoreCycleInput,
  type JournalDisciplineScoreProjection,
} from "@/lib/community-journal-discipline-score-policy";
import {
  COMMUNITY_REPUTATION_EVIDENCE_VERSION,
  COMMUNITY_REPUTATION_SOURCE_TYPE,
  communityReputationCoverageBasisPoints,
  communityReputationSourceDigest,
  type CommunityReputationEvidenceRow,
} from "@/lib/community-reputation-evidence-authority";
import { withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { AvailableTenantPrincipalContext } from "@/lib/security/tenant-principal-context";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;
const MAX_RECORD_COUNT = 1_000_000;

export type JournalDisciplineScore = JournalDisciplineScoreProjection & {
  evaluatedEvidenceDigest: string;
};

export type JournalDisciplineScoreLoadResult =
  | { available: true; score: JournalDisciplineScore }
  | { available: false; score: null };

const EVIDENCE_SELECT = `
  evidence.id::text,
  evidence.tenant_id,
  evidence.workspace_id,
  evidence.principal_type,
  evidence.principal_id,
  evidence.student_id::text,
  evidence.evidence_version,
  evidence.source_type,
  evidence.source_enrollment_id::text,
  evidence.challenge_id,
  evidence.challenge_version,
  evidence.cycle_key,
  evidence.cycle_starts_at,
  evidence.cycle_ends_at,
  evidence.outcome,
  evidence.finalized_at,
  evidence.eligible_closed_trade_count,
  evidence.valid_reflection_count,
  evidence.coverage_basis_points,
  evidence.completion_criteria_met,
  evidence.finalization_source,
  evidence.finalization_run_id::text,
  evidence.source_digest,
  evidence.recorded_at
`;

function assertReadContext(context: AvailableTenantPrincipalContext): void {
  if (
    context.principalType !== "student" ||
    !context.principalId ||
    !context.scopes.includes("community:reputation:read")
  ) {
    throw new Error("journal_discipline_context_invalid");
  }
}

function safeInteger(value: number | string, maximum: number, code: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
    throw new Error(code);
  }
  return parsed;
}

function validateEvidenceRow(
  row: CommunityReputationEvidenceRow,
  context: AvailableTenantPrincipalContext,
): JournalDisciplineScoreCycleInput {
  if (
    !UUID_RE.test(row.id) ||
    row.id !== row.source_enrollment_id ||
    row.tenant_id !== context.tenantId ||
    row.workspace_id !== context.workspaceId ||
    row.principal_type !== "student" ||
    row.principal_id !== context.principalId ||
    row.student_id !== context.principalId ||
    !UUID_RE.test(row.student_id) ||
    row.evidence_version !== COMMUNITY_REPUTATION_EVIDENCE_VERSION ||
    row.source_type !== COMMUNITY_REPUTATION_SOURCE_TYPE ||
    row.challenge_id !== OFFICIAL_JOURNAL_CHALLENGE_ID ||
    row.challenge_version !== OFFICIAL_JOURNAL_CHALLENGE_VERSION ||
    !/^[0-9]{4}-W[0-9]{2}$/.test(row.cycle_key) ||
    (row.outcome !== "completed" && row.outcome !== "not_completed") ||
    (row.finalization_source !== "interactive" &&
      row.finalization_source !== "worker") ||
    !SHA256_RE.test(row.source_digest)
  ) {
    throw new Error("journal_discipline_evidence_identity_invalid");
  }

  const cycleStartsAt = officialJournalChallengeIso(row.cycle_starts_at);
  const cycleEndsAt = officialJournalChallengeIso(row.cycle_ends_at);
  const finalizedAt = officialJournalChallengeIso(row.finalized_at);
  const recordedAt = officialJournalChallengeIso(row.recorded_at);
  if (
    cycleEndsAt <= cycleStartsAt ||
    finalizedAt < cycleStartsAt ||
    recordedAt < finalizedAt
  ) {
    throw new Error("journal_discipline_evidence_time_invalid");
  }

  const eligibleClosedTrades = safeInteger(
    row.eligible_closed_trade_count,
    MAX_RECORD_COUNT,
    "journal_discipline_evidence_counts_invalid",
  );
  const validReflections = safeInteger(
    row.valid_reflection_count,
    MAX_RECORD_COUNT,
    "journal_discipline_evidence_counts_invalid",
  );
  const coverageBasisPoints = safeInteger(
    row.coverage_basis_points,
    10_000,
    "journal_discipline_evidence_coverage_invalid",
  );
  const completionCriteriaMet =
    eligibleClosedTrades >= 3 &&
    validReflections * 5 >= eligibleClosedTrades * 4;
  if (
    validReflections > eligibleClosedTrades ||
    coverageBasisPoints !== communityReputationCoverageBasisPoints(
      eligibleClosedTrades,
      validReflections,
    ) ||
    row.completion_criteria_met !== completionCriteriaMet ||
    (row.outcome === "completed") !== completionCriteriaMet ||
    (row.finalization_source === "interactive" &&
      row.finalization_run_id !== null) ||
    (row.finalization_source === "worker" &&
      (!row.finalization_run_id || !UUID_RE.test(row.finalization_run_id)))
  ) {
    throw new Error("journal_discipline_evidence_authority_invalid");
  }

  const expectedDigest = communityReputationSourceDigest({
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    principalType: "student",
    principalId: row.principal_id,
    studentId: row.student_id,
    sourceEnrollmentId: row.source_enrollment_id,
    challengeId: OFFICIAL_JOURNAL_CHALLENGE_ID,
    challengeVersion: OFFICIAL_JOURNAL_CHALLENGE_VERSION,
    cycleKey: row.cycle_key,
    cycleStartsAt,
    cycleEndsAt,
    outcome: row.outcome,
    finalizedAt,
    eligibleClosedTrades,
    validReflections,
    coverageBasisPoints,
    completionCriteriaMet,
    finalizationSource: row.finalization_source,
    finalizationRunId: row.finalization_run_id,
  });
  if (expectedDigest !== row.source_digest) {
    throw new Error("journal_discipline_evidence_digest_invalid");
  }

  return {
    sourceEnrollmentId: row.source_enrollment_id,
    cycleKey: row.cycle_key,
    cycleStartsAt,
    cycleEndsAt,
    outcome: row.outcome,
    completionCriteriaMet,
    coverageBasisPoints,
    sourceDigest: row.source_digest,
  };
}

async function selectValidatedWindow(
  client: PoolClient,
  context: AvailableTenantPrincipalContext,
): Promise<JournalDisciplineScoreCycleInput[]> {
  const selected = await client.query<CommunityReputationEvidenceRow>(
    `SELECT ${EVIDENCE_SELECT}
       FROM academy_community_reputation_evidence AS evidence
       JOIN platform_principal_bindings AS binding
         ON binding.tenant_id = evidence.tenant_id
        AND binding.workspace_id = evidence.workspace_id
        AND binding.principal_type = evidence.principal_type
        AND binding.principal_id = evidence.principal_id
        AND binding.status = 'active'
      WHERE evidence.tenant_id = $1
        AND evidence.workspace_id = $2
        AND evidence.principal_type = 'student'
        AND evidence.principal_id = $3
        AND evidence.evidence_version = $4
        AND evidence.source_type = $5
      ORDER BY evidence.cycle_ends_at DESC,
               evidence.source_enrollment_id DESC
      LIMIT $6`,
    [
      context.tenantId,
      context.workspaceId,
      context.principalId,
      COMMUNITY_REPUTATION_EVIDENCE_VERSION,
      COMMUNITY_REPUTATION_SOURCE_TYPE,
      JOURNAL_DISCIPLINE_SCORE_LOOKBACK_CYCLES,
    ],
  );
  return selected.rows.map((row) => validateEvidenceRow(row, context));
}

export async function loadJournalDisciplineScore(
  context: AvailableTenantPrincipalContext,
): Promise<JournalDisciplineScoreLoadResult> {
  try {
    assertReadContext(context);
    const transaction = await withTx(async (client) => {
      await client.query("SET TRANSACTION READ ONLY");
      await client.query("SET LOCAL statement_timeout = '5000ms'");
      await client.query("SET LOCAL lock_timeout = '1000ms'");
      const cycles = await selectValidatedWindow(client, context);
      const evaluated = evaluateJournalDisciplineScore(cycles);
      return {
        ...evaluated.projection,
        evaluatedEvidenceDigest: createHash("sha256")
          .update(evaluated.digestCanonicalInput)
          .digest("hex"),
      } satisfies JournalDisciplineScore;
    });
    if (!transaction.enabled) return { available: false, score: null };
    return { available: true, score: transaction.value };
  } catch (error) {
    logger.error("[journal-discipline-score] load failed", {
      requestId: context.requestId,
      principalFingerprint: createHash("sha256")
        .update(`${context.tenantId}\0${context.principalId}`)
        .digest("hex"),
      error: String(error),
    });
    return { available: false, score: null };
  }
}
