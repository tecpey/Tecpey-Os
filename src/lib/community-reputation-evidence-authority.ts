import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  deriveOfficialJournalChallengeCycle,
  OFFICIAL_JOURNAL_CHALLENGE_ID,
  OFFICIAL_JOURNAL_CHALLENGE_VERSION,
  officialJournalChallengeHash,
  officialJournalChallengeIso,
  validateOfficialJournalChallengeEnrollmentRow,
  type OfficialJournalChallengeEnrollmentRow,
} from "@/lib/community-journal-challenge-authority";
import type { AvailableTenantPrincipalContext } from "@/lib/security/tenant-principal-context";

export const COMMUNITY_REPUTATION_EVIDENCE_VERSION =
  "community-reputation-evidence-v1" as const;
export const COMMUNITY_REPUTATION_SOURCE_TYPE =
  "official_journal_challenge_finalization" as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;
const MAX_COUNT = 1_000_000;

export type CommunityReputationEvidenceOutcome = "completed" | "not_completed";

export type CommunityReputationEvidenceRow = {
  id: string;
  tenant_id: string;
  workspace_id: string;
  principal_type: "student";
  principal_id: string;
  student_id: string;
  evidence_version: typeof COMMUNITY_REPUTATION_EVIDENCE_VERSION;
  source_type: typeof COMMUNITY_REPUTATION_SOURCE_TYPE;
  source_enrollment_id: string;
  challenge_id: typeof OFFICIAL_JOURNAL_CHALLENGE_ID;
  challenge_version: typeof OFFICIAL_JOURNAL_CHALLENGE_VERSION;
  cycle_key: string;
  cycle_starts_at: Date | string;
  cycle_ends_at: Date | string;
  outcome: CommunityReputationEvidenceOutcome;
  finalized_at: Date | string;
  eligible_closed_trade_count: number | string;
  valid_reflection_count: number | string;
  coverage_basis_points: number | string;
  completion_criteria_met: boolean;
  finalization_source: "interactive" | "worker";
  finalization_run_id: string | null;
  source_digest: string;
  recorded_at: Date | string;
};

export type CommunityReputationCycleEvidence = {
  evidenceVersion: typeof COMMUNITY_REPUTATION_EVIDENCE_VERSION;
  sourceType: typeof COMMUNITY_REPUTATION_SOURCE_TYPE;
  challengeId: typeof OFFICIAL_JOURNAL_CHALLENGE_ID;
  challengeVersion: typeof OFFICIAL_JOURNAL_CHALLENGE_VERSION;
  cycle: {
    key: string;
    startsAt: string;
    endsAt: string;
  };
  outcome: CommunityReputationEvidenceOutcome;
  finalizedAt: string;
  eligibleClosedTrades: number;
  validReflections: number;
  coverageBasisPoints: number;
  completionCriteriaMet: boolean;
  finalizationSource: "interactive" | "worker";
  sourceDigest: string;
};

export type CommunityReputationEvidenceSummary = {
  evidenceVersion: typeof COMMUNITY_REPUTATION_EVIDENCE_VERSION;
  policyStatus: "evidence_only";
  finalizedCycles: number;
  completedCycles: number;
  notCompletedCycles: number;
  eligibleClosedTrades: number;
  validReflections: number;
  aggregateCoverageBasisPoints: number;
  firstFinalizedAt: string | null;
  latestFinalizedAt: string | null;
  latest: CommunityReputationCycleEvidence | null;
  score: null;
  rank: null;
  rewardEligibility: false;
  mentorDecisionEligible: false;
  instructorDecisionEligible: false;
};

export type CommunityReputationEvidenceLoadResult =
  | { available: true; summary: CommunityReputationEvidenceSummary }
  | { available: false; summary: null };

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

function safeInteger(value: number | string, code: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_COUNT) {
    throw new Error(code);
  }
  return parsed;
}

export function communityReputationCoverageBasisPoints(
  eligibleClosedTrades: number,
  validReflections: number,
): number {
  if (
    !Number.isSafeInteger(eligibleClosedTrades) ||
    !Number.isSafeInteger(validReflections) ||
    eligibleClosedTrades < 0 ||
    eligibleClosedTrades > MAX_COUNT ||
    validReflections < 0 ||
    validReflections > eligibleClosedTrades
  ) {
    throw new Error("community_reputation_counts_invalid");
  }
  if (eligibleClosedTrades === 0) return 0;
  return Math.floor((validReflections * 10_000 + Math.floor(eligibleClosedTrades / 2)) / eligibleClosedTrades);
}

function terminalEnrollmentProjection(row: OfficialJournalChallengeEnrollmentRow) {
  if (
    !row.tenant_id ||
    !row.workspace_id ||
    row.principal_type !== "student" ||
    !row.principal_id ||
    !row.student_id ||
    !UUID_RE.test(row.id) ||
    !UUID_RE.test(row.student_id) ||
    row.principal_id !== row.student_id ||
    (row.status !== "completed" && row.status !== "not_completed")
  ) {
    throw new Error("community_reputation_source_identity_invalid");
  }
  const cycleStart = new Date(row.cycle_starts_at);
  if (!Number.isFinite(cycleStart.getTime())) {
    throw new Error("community_reputation_source_cycle_invalid");
  }
  const cycle = deriveOfficialJournalChallengeCycle(cycleStart);
  const validated = validateOfficialJournalChallengeEnrollmentRow(row, cycle);
  if (!validated.finalizedAt || !row.finalization_source) {
    throw new Error("community_reputation_source_not_finalized");
  }
  const eligibleClosedTrades = safeInteger(
    row.eligible_closed_trade_count,
    "community_reputation_source_counts_invalid",
  );
  const validReflections = safeInteger(
    row.valid_reflection_count,
    "community_reputation_source_counts_invalid",
  );
  const coverageBasisPoints = communityReputationCoverageBasisPoints(
    eligibleClosedTrades,
    validReflections,
  );
  const completionCriteriaMet = validated.progress.eligibleToComplete;
  if (
    (row.status === "completed") !== completionCriteriaMet ||
    (row.finalization_source === "interactive" && row.finalization_run_id !== null) ||
    (row.finalization_source === "worker" && !row.finalization_run_id)
  ) {
    throw new Error("community_reputation_source_finalization_invalid");
  }
  const finalizationRunId = row.finalization_run_id ?? null;
  if (finalizationRunId && !UUID_RE.test(finalizationRunId)) {
    throw new Error("community_reputation_source_run_invalid");
  }
  const digestInput = {
    evidenceVersion: COMMUNITY_REPUTATION_EVIDENCE_VERSION,
    sourceType: COMMUNITY_REPUTATION_SOURCE_TYPE,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    principalType: "student",
    principalId: row.principal_id,
    studentId: row.student_id,
    sourceEnrollmentId: row.id,
    challengeId: OFFICIAL_JOURNAL_CHALLENGE_ID,
    challengeVersion: OFFICIAL_JOURNAL_CHALLENGE_VERSION,
    cycleKey: cycle.key,
    cycleStartsAt: cycle.startsAt,
    cycleEndsAt: cycle.endsAt,
    outcome: row.status,
    finalizedAt: validated.finalizedAt,
    eligibleClosedTrades,
    validReflections,
    coverageBasisPoints,
    completionCriteriaMet,
    finalizationSource: row.finalization_source,
    finalizationRunId,
  };
  return {
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    principalId: row.principal_id,
    studentId: row.student_id,
    sourceEnrollmentId: row.id,
    cycle,
    outcome: row.status,
    finalizedAt: validated.finalizedAt,
    eligibleClosedTrades,
    validReflections,
    coverageBasisPoints,
    completionCriteriaMet,
    finalizationSource: row.finalization_source,
    finalizationRunId,
    sourceDigest: officialJournalChallengeHash(digestInput),
  } as const;
}

function validateEvidenceRow(
  row: CommunityReputationEvidenceRow,
  expected?: ReturnType<typeof terminalEnrollmentProjection>,
): CommunityReputationCycleEvidence {
  if (
    !UUID_RE.test(row.id) ||
    row.principal_type !== "student" ||
    row.principal_id !== row.student_id ||
    !UUID_RE.test(row.student_id) ||
    !UUID_RE.test(row.source_enrollment_id) ||
    row.evidence_version !== COMMUNITY_REPUTATION_EVIDENCE_VERSION ||
    row.source_type !== COMMUNITY_REPUTATION_SOURCE_TYPE ||
    row.challenge_id !== OFFICIAL_JOURNAL_CHALLENGE_ID ||
    row.challenge_version !== OFFICIAL_JOURNAL_CHALLENGE_VERSION ||
    !/^[0-9]{4}-W[0-9]{2}$/.test(row.cycle_key) ||
    (row.outcome !== "completed" && row.outcome !== "not_completed") ||
    (row.finalization_source !== "interactive" && row.finalization_source !== "worker") ||
    !SHA256_RE.test(row.source_digest)
  ) {
    throw new Error("community_reputation_evidence_row_invalid");
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
    throw new Error("community_reputation_evidence_time_invalid");
  }
  const eligibleClosedTrades = safeInteger(
    row.eligible_closed_trade_count,
    "community_reputation_evidence_counts_invalid",
  );
  const validReflections = safeInteger(
    row.valid_reflection_count,
    "community_reputation_evidence_counts_invalid",
  );
  const coverageBasisPoints = safeInteger(
    row.coverage_basis_points,
    "community_reputation_evidence_coverage_invalid",
  );
  if (
    coverageBasisPoints > 10_000 ||
    coverageBasisPoints !== communityReputationCoverageBasisPoints(
      eligibleClosedTrades,
      validReflections,
    ) ||
    row.completion_criteria_met !==
      (eligibleClosedTrades >= 3 && validReflections * 5 >= eligibleClosedTrades * 4) ||
    (row.outcome === "completed") !== row.completion_criteria_met ||
    (row.finalization_source === "interactive" && row.finalization_run_id !== null) ||
    (row.finalization_source === "worker" && !row.finalization_run_id) ||
    (row.finalization_run_id !== null && !UUID_RE.test(row.finalization_run_id))
  ) {
    throw new Error("community_reputation_evidence_authority_invalid");
  }
  if (expected) {
    const actual = {
      tenantId: row.tenant_id,
      workspaceId: row.workspace_id,
      principalId: row.principal_id,
      studentId: row.student_id,
      sourceEnrollmentId: row.source_enrollment_id,
      cycleKey: row.cycle_key,
      cycleStartsAt,
      cycleEndsAt,
      outcome: row.outcome,
      finalizedAt,
      eligibleClosedTrades,
      validReflections,
      coverageBasisPoints,
      completionCriteriaMet: row.completion_criteria_met,
      finalizationSource: row.finalization_source,
      finalizationRunId: row.finalization_run_id,
      sourceDigest: row.source_digest,
    };
    const wanted = {
      tenantId: expected.tenantId,
      workspaceId: expected.workspaceId,
      principalId: expected.principalId,
      studentId: expected.studentId,
      sourceEnrollmentId: expected.sourceEnrollmentId,
      cycleKey: expected.cycle.key,
      cycleStartsAt: expected.cycle.startsAt,
      cycleEndsAt: expected.cycle.endsAt,
      outcome: expected.outcome,
      finalizedAt: expected.finalizedAt,
      eligibleClosedTrades: expected.eligibleClosedTrades,
      validReflections: expected.validReflections,
      coverageBasisPoints: expected.coverageBasisPoints,
      completionCriteriaMet: expected.completionCriteriaMet,
      finalizationSource: expected.finalizationSource,
      finalizationRunId: expected.finalizationRunId,
      sourceDigest: expected.sourceDigest,
    };
    if (officialJournalChallengeHash(actual) !== officialJournalChallengeHash(wanted)) {
      throw new Error("community_reputation_evidence_conflict");
    }
  }
  return {
    evidenceVersion: COMMUNITY_REPUTATION_EVIDENCE_VERSION,
    sourceType: COMMUNITY_REPUTATION_SOURCE_TYPE,
    challengeId: OFFICIAL_JOURNAL_CHALLENGE_ID,
    challengeVersion: OFFICIAL_JOURNAL_CHALLENGE_VERSION,
    cycle: {
      key: row.cycle_key,
      startsAt: cycleStartsAt,
      endsAt: cycleEndsAt,
    },
    outcome: row.outcome,
    finalizedAt,
    eligibleClosedTrades,
    validReflections,
    coverageBasisPoints,
    completionCriteriaMet: row.completion_criteria_met,
    finalizationSource: row.finalization_source,
    sourceDigest: row.source_digest,
  };
}

export async function materializeCommunityReputationEvidenceTx(
  client: PoolClient,
  enrollment: OfficialJournalChallengeEnrollmentRow,
): Promise<CommunityReputationCycleEvidence> {
  const expected = terminalEnrollmentProjection(enrollment);
  await client.query(
    `INSERT INTO academy_community_reputation_evidence
       (id, tenant_id, workspace_id, principal_type, principal_id, student_id,
        evidence_version, source_type, source_enrollment_id,
        challenge_id, challenge_version, cycle_key, cycle_starts_at, cycle_ends_at,
        outcome, finalized_at, eligible_closed_trade_count, valid_reflection_count,
        coverage_basis_points, completion_criteria_met, finalization_source,
        finalization_run_id, source_digest)
     VALUES
       ($1::uuid, $2, $3, 'student', $4, $5::uuid,
        $6, $7, $8::uuid,
        $9, $10, $11, $12::timestamptz, $13::timestamptz,
        $14, $15::timestamptz, $16, $17,
        $18, $19, $20, $21::uuid, $22)
     ON CONFLICT (source_enrollment_id) DO NOTHING`,
    [
      randomUUID(),
      expected.tenantId,
      expected.workspaceId,
      expected.principalId,
      expected.studentId,
      COMMUNITY_REPUTATION_EVIDENCE_VERSION,
      COMMUNITY_REPUTATION_SOURCE_TYPE,
      expected.sourceEnrollmentId,
      OFFICIAL_JOURNAL_CHALLENGE_ID,
      OFFICIAL_JOURNAL_CHALLENGE_VERSION,
      expected.cycle.key,
      expected.cycle.startsAt,
      expected.cycle.endsAt,
      expected.outcome,
      expected.finalizedAt,
      expected.eligibleClosedTrades,
      expected.validReflections,
      expected.coverageBasisPoints,
      expected.completionCriteriaMet,
      expected.finalizationSource,
      expected.finalizationRunId,
      expected.sourceDigest,
    ],
  );
  const selected = await client.query<CommunityReputationEvidenceRow>(
    `SELECT ${EVIDENCE_SELECT}
       FROM academy_community_reputation_evidence AS evidence
      WHERE evidence.source_enrollment_id = $1::uuid
      LIMIT 1`,
    [expected.sourceEnrollmentId],
  );
  const row = selected.rows[0];
  if (!row) throw new Error("community_reputation_evidence_missing");
  return validateEvidenceRow(row, expected);
}

function assertReadContext(context: AvailableTenantPrincipalContext): void {
  if (
    context.principalType !== "student" ||
    !context.principalId ||
    !context.scopes.includes("community:reputation:read")
  ) {
    throw new Error("community_reputation_context_invalid");
  }
}

function emptySummary(): CommunityReputationEvidenceSummary {
  return {
    evidenceVersion: COMMUNITY_REPUTATION_EVIDENCE_VERSION,
    policyStatus: "evidence_only",
    finalizedCycles: 0,
    completedCycles: 0,
    notCompletedCycles: 0,
    eligibleClosedTrades: 0,
    validReflections: 0,
    aggregateCoverageBasisPoints: 0,
    firstFinalizedAt: null,
    latestFinalizedAt: null,
    latest: null,
    score: null,
    rank: null,
    rewardEligibility: false,
    mentorDecisionEligible: false,
    instructorDecisionEligible: false,
  };
}

export async function loadCommunityReputationEvidenceSummary(
  context: AvailableTenantPrincipalContext,
): Promise<CommunityReputationEvidenceLoadResult> {
  try {
    assertReadContext(context);
    const transaction = await withTx(async (client) => {
      const aggregate = await client.query<{
        finalized_cycles: string | number;
        completed_cycles: string | number;
        not_completed_cycles: string | number;
        eligible_closed_trades: string | number;
        valid_reflections: string | number;
        first_finalized_at: Date | string | null;
        latest_finalized_at: Date | string | null;
      }>(
        `SELECT COUNT(*)::bigint AS finalized_cycles,
                COUNT(*) FILTER (WHERE evidence.outcome = 'completed')::bigint AS completed_cycles,
                COUNT(*) FILTER (WHERE evidence.outcome = 'not_completed')::bigint AS not_completed_cycles,
                COALESCE(SUM(evidence.eligible_closed_trade_count), 0)::bigint AS eligible_closed_trades,
                COALESCE(SUM(evidence.valid_reflection_count), 0)::bigint AS valid_reflections,
                MIN(evidence.finalized_at) AS first_finalized_at,
                MAX(evidence.finalized_at) AS latest_finalized_at
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
            AND evidence.source_type = $5`,
        [
          context.tenantId,
          context.workspaceId,
          context.principalId,
          COMMUNITY_REPUTATION_EVIDENCE_VERSION,
          COMMUNITY_REPUTATION_SOURCE_TYPE,
        ],
      );
      const latest = await client.query<CommunityReputationEvidenceRow>(
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
          ORDER BY evidence.finalized_at DESC, evidence.cycle_key DESC, evidence.id DESC
          LIMIT 1`,
        [
          context.tenantId,
          context.workspaceId,
          context.principalId,
          COMMUNITY_REPUTATION_EVIDENCE_VERSION,
          COMMUNITY_REPUTATION_SOURCE_TYPE,
        ],
      );
      const aggregateRow = aggregate.rows[0];
      if (!aggregateRow) throw new Error("community_reputation_aggregate_missing");
      const finalizedCycles = safeInteger(
        aggregateRow.finalized_cycles,
        "community_reputation_aggregate_invalid",
      );
      const completedCycles = safeInteger(
        aggregateRow.completed_cycles,
        "community_reputation_aggregate_invalid",
      );
      const notCompletedCycles = safeInteger(
        aggregateRow.not_completed_cycles,
        "community_reputation_aggregate_invalid",
      );
      const eligibleClosedTrades = safeInteger(
        aggregateRow.eligible_closed_trades,
        "community_reputation_aggregate_invalid",
      );
      const validReflections = safeInteger(
        aggregateRow.valid_reflections,
        "community_reputation_aggregate_invalid",
      );
      if (
        completedCycles + notCompletedCycles !== finalizedCycles ||
        validReflections > eligibleClosedTrades ||
        (finalizedCycles === 0) !== (latest.rows.length === 0)
      ) {
        throw new Error("community_reputation_aggregate_inconsistent");
      }
      if (finalizedCycles === 0) return emptySummary();
      const firstFinalizedAt = aggregateRow.first_finalized_at
        ? officialJournalChallengeIso(aggregateRow.first_finalized_at)
        : null;
      const latestFinalizedAt = aggregateRow.latest_finalized_at
        ? officialJournalChallengeIso(aggregateRow.latest_finalized_at)
        : null;
      const latestEvidence = latest.rows[0]
        ? validateEvidenceRow(latest.rows[0])
        : null;
      if (
        !firstFinalizedAt ||
        !latestFinalizedAt ||
        !latestEvidence ||
        latestEvidence.finalizedAt !== latestFinalizedAt ||
        firstFinalizedAt > latestFinalizedAt
      ) {
        throw new Error("community_reputation_timeline_invalid");
      }
      return {
        evidenceVersion: COMMUNITY_REPUTATION_EVIDENCE_VERSION,
        policyStatus: "evidence_only",
        finalizedCycles,
        completedCycles,
        notCompletedCycles,
        eligibleClosedTrades,
        validReflections,
        aggregateCoverageBasisPoints: communityReputationCoverageBasisPoints(
          eligibleClosedTrades,
          validReflections,
        ),
        firstFinalizedAt,
        latestFinalizedAt,
        latest: latestEvidence,
        score: null,
        rank: null,
        rewardEligibility: false,
        mentorDecisionEligible: false,
        instructorDecisionEligible: false,
      } satisfies CommunityReputationEvidenceSummary;
    });
    if (!transaction.enabled) return { available: false, summary: null };
    return { available: true, summary: transaction.value };
  } catch (error) {
    logger.error("[community-reputation-evidence] load failed", {
      requestId: context.requestId,
      principalFingerprint: createHash("sha256")
        .update(`${context.tenantId}\0${context.principalId}`)
        .digest("hex"),
      error: String(error),
    });
    return { available: false, summary: null };
  }
}
