import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  createArenaExecutionStateV2,
  type ArenaClosedTradeV2,
  type ArenaExecutionStateV2,
} from "@/lib/trading-arena-execution-v2";
import { validateArenaExecutionStateV2 } from "@/lib/trading-arena-execution-state-validation";
import {
  mapArenaReflectionRow,
  type ArenaReflectionRecord,
  type ArenaReflectionRow,
} from "@/lib/trading-arena-reflections";
import type { AvailableTenantPrincipalContext } from "@/lib/security/tenant-principal-context";

export const OFFICIAL_JOURNAL_CHALLENGE_ID = "journal-reflection-week";
export const OFFICIAL_JOURNAL_CHALLENGE_VERSION = "journal-reflection-v1";
export const OFFICIAL_JOURNAL_CHALLENGE_MIN_TRADES = 3;
export const OFFICIAL_JOURNAL_CHALLENGE_REQUIRED_RATE = 0.8;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_RE = /^[A-Za-z0-9._:-]{16,120}$/;
const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;
const OPERATION_PREFIX = "community.challenge.journal-reflection-v1";

const REFLECTION_SELECT = `
  id::text, student_id::text, attempt_id::text, closed_trade_id,
  revision::text, decision_review, learned_lesson, emotional_review,
  mistake_tags, next_action_commitment, evidence_asset,
  evidence_realized_pnl::text, evidence_realized_pnl_rate::text,
  evidence_closure_reason, evidence_closed_at, evidence_mentor_flags,
  created_at, updated_at
`;

export type OfficialJournalChallengeCycle = {
  key: string;
  startsAt: string;
  endsAt: string;
};

export type OfficialJournalChallengeProgress = {
  eligibleClosedTrades: number;
  validReflections: number;
  coverageRate: number;
  minimumTrades: number;
  requiredRate: number;
  eligibleToComplete: boolean;
};

export type OfficialJournalChallengeState = {
  challengeId: typeof OFFICIAL_JOURNAL_CHALLENGE_ID;
  challengeVersion: typeof OFFICIAL_JOURNAL_CHALLENGE_VERSION;
  cycle: OfficialJournalChallengeCycle;
  consentEnabled: boolean;
  status: "not_joined" | "active" | "completed";
  enrollmentId: string | null;
  revision: number | null;
  startedAt: string | null;
  evaluatedAt: string | null;
  completedAt: string | null;
  progress: OfficialJournalChallengeProgress;
  rewards: {
    xp: 0;
    badge: null;
    financialReward: null;
    status: "disabled";
  };
};

export type OfficialJournalChallengeLoadResult =
  | { available: true; state: OfficialJournalChallengeState }
  | { available: false; state: null };

export type OfficialJournalChallengeCommand = {
  action: "join" | "evaluate";
  cycleKey: string;
  idempotencyKey: string;
};

export type OfficialJournalChallengeCommandResult =
  | {
      ok: true;
      replayed: boolean;
      state: OfficialJournalChallengeState;
    }
  | {
      ok: false;
      reason:
        | "challenge_consent_required"
        | "challenge_cycle_conflict"
        | "challenge_not_joined"
        | "idempotency_conflict"
        | "command_in_progress"
        | "challenge_authority_unavailable";
    };

type EnrollmentRow = {
  id: string;
  challenge_id: string;
  challenge_version: string;
  cycle_key: string;
  cycle_starts_at: Date | string;
  cycle_ends_at: Date | string;
  status: "active" | "completed";
  revision: string | number;
  started_at: Date | string;
  evaluated_at: Date | string | null;
  completed_at: Date | string | null;
  eligible_closed_trade_count: number;
  valid_reflection_count: number;
  coverage_rate: string | number;
};

type AttemptRow = {
  id: string;
  starting_balance: string;
  execution_state: unknown;
};

type ReceiptRow = {
  request_hash: string;
  status: "processing" | "completed";
  http_status: number | null;
  response_body: unknown;
};

type EvidenceProgress = {
  eligibleClosedTrades: number;
  validReflections: number;
  coverageRate: number;
  eligibleToComplete: boolean;
};

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  return "null";
}

function iso(value: Date | string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("community_challenge_timestamp_invalid");
  }
  return parsed.toISOString();
}

function nullableIso(value: Date | string | null): string | null {
  return value === null ? null : iso(value);
}

function safeInteger(value: string | number, code: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(code);
  return parsed;
}

function startOfUtcIsoWeek(date: Date): Date {
  const normalized = new Date(date.getTime());
  if (!Number.isFinite(normalized.getTime())) {
    throw new Error("community_challenge_clock_invalid");
  }
  const weekday = (normalized.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(
    normalized.getUTCFullYear(),
    normalized.getUTCMonth(),
    normalized.getUTCDate() - weekday,
  ));
}

export function deriveOfficialJournalChallengeCycle(
  date: Date,
): OfficialJournalChallengeCycle {
  const start = startOfUtcIsoWeek(date);
  const thursday = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1_000);
  const isoYear = thursday.getUTCFullYear();
  const firstWeekStart = startOfUtcIsoWeek(new Date(Date.UTC(isoYear, 0, 4)));
  const weekNumber = 1 + Math.round((start.getTime() - firstWeekStart.getTime()) / WEEK_MS);
  const end = new Date(start.getTime() + WEEK_MS);
  return {
    key: `${isoYear}-W${String(weekNumber).padStart(2, "0")}`,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  };
}

function progressFromCounts(
  eligibleClosedTrades: number,
  validReflections: number,
): EvidenceProgress {
  if (
    !Number.isSafeInteger(eligibleClosedTrades) || eligibleClosedTrades < 0 ||
    !Number.isSafeInteger(validReflections) || validReflections < 0 ||
    validReflections > eligibleClosedTrades
  ) {
    throw new Error("community_challenge_progress_invalid");
  }
  const coverageRate = eligibleClosedTrades === 0
    ? 0
    : Number((validReflections / eligibleClosedTrades).toFixed(6));
  return {
    eligibleClosedTrades,
    validReflections,
    coverageRate,
    eligibleToComplete:
      eligibleClosedTrades >= OFFICIAL_JOURNAL_CHALLENGE_MIN_TRADES &&
      validReflections * 5 >= eligibleClosedTrades * 4,
  };
}

function emptyProgress(): OfficialJournalChallengeProgress {
  return {
    ...progressFromCounts(0, 0),
    minimumTrades: OFFICIAL_JOURNAL_CHALLENGE_MIN_TRADES,
    requiredRate: OFFICIAL_JOURNAL_CHALLENGE_REQUIRED_RATE,
  };
}

function assertContext(
  context: AvailableTenantPrincipalContext,
  scope: "community:challenge:read" | "community:challenge:write",
): void {
  if (
    context.principalType !== "student" ||
    !context.principalId ||
    !context.scopes.includes(scope)
  ) {
    throw new Error("community_challenge_context_invalid");
  }
}

function isEmptyExecutionState(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 0,
  );
}

function loadAttemptState(row: AttemptRow): ArenaExecutionStateV2 {
  if (!UUID_RE.test(row.id)) throw new Error("community_challenge_attempt_identity_invalid");
  return isEmptyExecutionState(row.execution_state)
    ? createArenaExecutionStateV2(row.starting_balance)
    : validateArenaExecutionStateV2(row.execution_state);
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function reflectionMatchesTrade(
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

function validateEnrollmentRow(
  row: EnrollmentRow,
  cycle: OfficialJournalChallengeCycle,
): {
  revision: number;
  startedAt: string;
  evaluatedAt: string | null;
  completedAt: string | null;
  progress: EvidenceProgress;
} {
  if (!UUID_RE.test(row.id)) throw new Error("community_challenge_enrollment_identity_invalid");
  if (
    row.challenge_id !== OFFICIAL_JOURNAL_CHALLENGE_ID ||
    row.challenge_version !== OFFICIAL_JOURNAL_CHALLENGE_VERSION ||
    row.cycle_key !== cycle.key ||
    iso(row.cycle_starts_at) !== cycle.startsAt ||
    iso(row.cycle_ends_at) !== cycle.endsAt ||
    (row.status !== "active" && row.status !== "completed")
  ) {
    throw new Error("community_challenge_enrollment_authority_invalid");
  }
  const revision = safeInteger(row.revision, "community_challenge_revision_invalid");
  if (revision < 1) throw new Error("community_challenge_revision_invalid");
  const startedAt = iso(row.started_at);
  if (startedAt < cycle.startsAt || startedAt >= cycle.endsAt) {
    throw new Error("community_challenge_started_at_invalid");
  }
  const eligible = safeInteger(
    row.eligible_closed_trade_count,
    "community_challenge_eligible_count_invalid",
  );
  const valid = safeInteger(
    row.valid_reflection_count,
    "community_challenge_reflection_count_invalid",
  );
  const progress = progressFromCounts(eligible, valid);
  const databaseCoverage = Number(row.coverage_rate);
  if (
    !Number.isFinite(databaseCoverage) ||
    Math.abs(databaseCoverage - progress.coverageRate) > 0.000001
  ) {
    throw new Error("community_challenge_coverage_invalid");
  }
  const evaluatedAt = nullableIso(row.evaluated_at);
  const completedAt = nullableIso(row.completed_at);
  if (row.status === "completed") {
    if (!completedAt || !progress.eligibleToComplete) {
      throw new Error("community_challenge_completion_invalid");
    }
  } else if (completedAt !== null) {
    throw new Error("community_challenge_active_completion_invalid");
  }
  return { revision, startedAt, evaluatedAt, completedAt, progress };
}

async function loadConsent(
  client: PoolClient,
  context: AvailableTenantPrincipalContext,
): Promise<boolean> {
  const result = await client.query<{ challenge_participation: boolean }>(
    `SELECT profile.challenge_participation
       FROM academy_public_profiles profile
       JOIN platform_principal_bindings binding
         ON binding.tenant_id = profile.tenant_id
        AND binding.workspace_id = profile.workspace_id
        AND binding.principal_type = profile.principal_type
        AND binding.principal_id = profile.principal_id
        AND binding.status = 'active'
      WHERE profile.tenant_id = $1
        AND profile.workspace_id = $2
        AND profile.principal_type = 'student'
        AND profile.principal_id = $3
        AND profile.consent_version = 'community-profile-consent-v1'
        AND profile.consented_at IS NOT NULL
      LIMIT 1`,
    [context.tenantId, context.workspaceId, context.principalId],
  );
  return result.rows[0]?.challenge_participation === true;
}

async function loadEnrollment(
  client: PoolClient,
  context: AvailableTenantPrincipalContext,
  cycleKey: string,
  lock: boolean,
): Promise<EnrollmentRow | null> {
  const result = await client.query<EnrollmentRow>(
    `SELECT id::text, challenge_id, challenge_version, cycle_key,
            cycle_starts_at, cycle_ends_at, status, revision::text,
            started_at, evaluated_at, completed_at,
            eligible_closed_trade_count, valid_reflection_count,
            coverage_rate::text
       FROM academy_community_challenge_enrollments
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND principal_type = 'student'
        AND principal_id = $3
        AND challenge_id = $4
        AND challenge_version = $5
        AND cycle_key = $6
      LIMIT 1
      ${lock ? "FOR UPDATE" : ""}`,
    [
      context.tenantId,
      context.workspaceId,
      context.principalId,
      OFFICIAL_JOURNAL_CHALLENGE_ID,
      OFFICIAL_JOURNAL_CHALLENGE_VERSION,
      cycleKey,
    ],
  );
  return result.rows[0] ?? null;
}

async function calculateEvidenceProgress(
  client: PoolClient,
  studentId: string,
  startsAt: string,
  endsAt: string,
): Promise<EvidenceProgress> {
  const attempts = await client.query<AttemptRow>(
    `SELECT id::text, starting_balance::text, execution_state
       FROM academy_trading_arena_attempts
      WHERE student_id = $1::uuid
      ORDER BY created_at ASC, id ASC`,
    [studentId],
  );
  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error("community_challenge_evidence_window_invalid");
  }

  const eligibleTrades = new Map<string, ArenaClosedTradeV2>();
  for (const attempt of attempts.rows) {
    const state = loadAttemptState(attempt);
    for (const trade of state.closedTrades) {
      const closedAt = new Date(trade.closedAt).getTime();
      if (!Number.isFinite(closedAt)) {
        throw new Error("community_challenge_trade_timestamp_invalid");
      }
      if (closedAt >= startMs && closedAt < endMs) {
        const key = `${attempt.id}:${trade.id}`;
        if (eligibleTrades.has(key)) {
          throw new Error("community_challenge_trade_identity_duplicate");
        }
        eligibleTrades.set(key, trade);
      }
    }
  }

  const reflections = await client.query<ArenaReflectionRow>(
    `SELECT ${REFLECTION_SELECT}
       FROM academy_trading_arena_reflections
      WHERE student_id = $1::uuid
        AND evidence_closed_at >= $2::timestamptz
        AND evidence_closed_at < $3::timestamptz
        AND created_at >= $2::timestamptz
        AND created_at < $3::timestamptz
      ORDER BY evidence_closed_at ASC, id ASC`,
    [studentId, startsAt, endsAt],
  );

  const validReflectionKeys = new Set<string>();
  for (const row of reflections.rows) {
    const reflection = mapArenaReflectionRow(row);
    const key = `${reflection.attemptId}:${reflection.closedTradeId}`;
    const trade = eligibleTrades.get(key);
    if (!trade || !reflectionMatchesTrade(reflection, trade)) {
      throw new Error("community_challenge_reflection_evidence_corrupt");
    }
    if (validReflectionKeys.has(key)) {
      throw new Error("community_challenge_reflection_identity_duplicate");
    }
    validReflectionKeys.add(key);
  }
  return progressFromCounts(eligibleTrades.size, validReflectionKeys.size);
}

function stateFrom(
  cycle: OfficialJournalChallengeCycle,
  consentEnabled: boolean,
  enrollment: EnrollmentRow | null,
  liveProgress: EvidenceProgress | null,
): OfficialJournalChallengeState {
  if (!enrollment) {
    return {
      challengeId: OFFICIAL_JOURNAL_CHALLENGE_ID,
      challengeVersion: OFFICIAL_JOURNAL_CHALLENGE_VERSION,
      cycle,
      consentEnabled,
      status: "not_joined",
      enrollmentId: null,
      revision: null,
      startedAt: null,
      evaluatedAt: null,
      completedAt: null,
      progress: emptyProgress(),
      rewards: { xp: 0, badge: null, financialReward: null, status: "disabled" },
    };
  }
  const validated = validateEnrollmentRow(enrollment, cycle);
  const progress = liveProgress ?? validated.progress;
  return {
    challengeId: OFFICIAL_JOURNAL_CHALLENGE_ID,
    challengeVersion: OFFICIAL_JOURNAL_CHALLENGE_VERSION,
    cycle,
    consentEnabled,
    status: enrollment.status,
    enrollmentId: enrollment.id,
    revision: validated.revision,
    startedAt: validated.startedAt,
    evaluatedAt: validated.evaluatedAt,
    completedAt: validated.completedAt,
    progress: {
      ...progress,
      minimumTrades: OFFICIAL_JOURNAL_CHALLENGE_MIN_TRADES,
      requiredRate: OFFICIAL_JOURNAL_CHALLENGE_REQUIRED_RATE,
    },
    rewards: { xp: 0, badge: null, financialReward: null, status: "disabled" },
  };
}

function commandHash(command: OfficialJournalChallengeCommand): string {
  return createHash("sha256")
    .update(canonicalJson({
      action: command.action,
      cycleKey: command.cycleKey,
      challengeId: OFFICIAL_JOURNAL_CHALLENGE_ID,
      challengeVersion: OFFICIAL_JOURNAL_CHALLENGE_VERSION,
    }))
    .digest("hex");
}

function operation(action: OfficialJournalChallengeCommand["action"]): string {
  return `${OPERATION_PREFIX}.${action}`;
}

function parseStoredCommandResult(value: unknown): OfficialJournalChallengeState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = (value as Record<string, unknown>).state;
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const raw = state as Record<string, unknown>;
  if (
    raw.challengeId !== OFFICIAL_JOURNAL_CHALLENGE_ID ||
    raw.challengeVersion !== OFFICIAL_JOURNAL_CHALLENGE_VERSION ||
    !raw.cycle || typeof raw.cycle !== "object" || Array.isArray(raw.cycle) ||
    !raw.progress || typeof raw.progress !== "object" || Array.isArray(raw.progress) ||
    !raw.rewards || typeof raw.rewards !== "object" || Array.isArray(raw.rewards)
  ) return null;
  const rewards = raw.rewards as Record<string, unknown>;
  if (
    rewards.xp !== 0 || rewards.badge !== null ||
    rewards.financialReward !== null || rewards.status !== "disabled"
  ) return null;
  return state as OfficialJournalChallengeState;
}

async function claimCommandReceipt(
  client: PoolClient,
  context: AvailableTenantPrincipalContext,
  command: OfficialJournalChallengeCommand,
  requestHash: string,
): Promise<
  | { kind: "claimed" }
  | { kind: "replay"; state: OfficialJournalChallengeState }
  | { kind: "conflict" }
  | { kind: "processing" }
> {
  const existing = await client.query<ReceiptRow>(
    `SELECT request_hash, status, http_status, response_body
       FROM api_command_receipts
      WHERE tenant_id = $1
        AND principal_type = 'student'
        AND principal_id = $2
        AND operation = $3
        AND idempotency_key = $4
      LIMIT 1
      FOR UPDATE`,
    [context.tenantId, context.principalId, operation(command.action), command.idempotencyKey],
  );
  const row = existing.rows[0];
  if (row) {
    if (row.request_hash !== requestHash) return { kind: "conflict" };
    if (row.status === "processing") return { kind: "processing" };
    const state = parseStoredCommandResult(row.response_body);
    if (!state || row.http_status !== 200) {
      throw new Error("community_challenge_receipt_corrupt");
    }
    return { kind: "replay", state };
  }
  await client.query(
    `INSERT INTO api_command_receipts
       (tenant_id, principal_type, principal_id, operation,
        idempotency_key, request_hash, status)
     VALUES ($1, 'student', $2, $3, $4, $5, 'processing')`,
    [context.tenantId, context.principalId, operation(command.action), command.idempotencyKey, requestHash],
  );
  return { kind: "claimed" };
}

async function completeCommandReceipt(
  client: PoolClient,
  context: AvailableTenantPrincipalContext,
  command: OfficialJournalChallengeCommand,
  state: OfficialJournalChallengeState,
): Promise<void> {
  const updated = await client.query(
    `UPDATE api_command_receipts
        SET status = 'completed',
            http_status = 200,
            response_body = $5::jsonb,
            completed_at = NOW(),
            retain_until = NOW() + INTERVAL '90 days'
      WHERE tenant_id = $1
        AND principal_type = 'student'
        AND principal_id = $2
        AND operation = $3
        AND idempotency_key = $4
        AND status = 'processing'`,
    [
      context.tenantId,
      context.principalId,
      operation(command.action),
      command.idempotencyKey,
      JSON.stringify({ state }),
    ],
  );
  if (updated.rowCount !== 1) {
    throw new Error("community_challenge_receipt_completion_missing");
  }
}

async function writeEvent(
  client: PoolClient,
  input: {
    enrollmentId: string;
    type: "joined" | "evaluated" | "completed";
    command: OfficialJournalChallengeCommand;
    requestHash: string;
    evidence: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO academy_community_challenge_events
       (id, enrollment_id, event_type, idempotency_key, request_hash, evidence)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb)`,
    [
      randomUUID(), input.enrollmentId, input.type, input.command.idempotencyKey,
      input.requestHash, JSON.stringify(input.evidence),
    ],
  );
}

async function databaseNow(client: PoolClient): Promise<Date> {
  const result = await client.query<{ now: Date }>("SELECT NOW() AS now");
  const now = result.rows[0]?.now;
  if (!now) throw new Error("community_challenge_database_clock_missing");
  return new Date(now);
}

async function currentStateInTransaction(
  client: PoolClient,
  context: AvailableTenantPrincipalContext,
  now: Date,
): Promise<OfficialJournalChallengeState> {
  const cycle = deriveOfficialJournalChallengeCycle(now);
  const consentEnabled = await loadConsent(client, context);
  const enrollment = await loadEnrollment(client, context, cycle.key, false);
  if (!enrollment) return stateFrom(cycle, consentEnabled, null, null);
  if (enrollment.status === "completed") {
    return stateFrom(cycle, consentEnabled, enrollment, null);
  }
  const validated = validateEnrollmentRow(enrollment, cycle);
  const evidenceEnd = new Date(
    Math.min(now.getTime(), new Date(cycle.endsAt).getTime()),
  ).toISOString();
  const progress = await calculateEvidenceProgress(
    client,
    context.principalId,
    validated.startedAt,
    evidenceEnd,
  );
  return stateFrom(cycle, consentEnabled, enrollment, progress);
}

export async function loadOfficialJournalChallengeState(
  context: AvailableTenantPrincipalContext,
): Promise<OfficialJournalChallengeLoadResult> {
  try {
    assertContext(context, "community:challenge:read");
    const transaction = await withTx(async (client) => {
      const now = await databaseNow(client);
      return currentStateInTransaction(client, context, now);
    });
    if (!transaction.enabled) return { available: false, state: null };
    return { available: true, state: transaction.value };
  } catch (error) {
    logger.error("[community-challenge] state load failed", {
      requestId: context.requestId,
      principalFingerprint: createHash("sha256")
        .update(`${context.tenantId}\0${context.principalId}`)
        .digest("hex"),
      error: String(error),
    });
    return { available: false, state: null };
  }
}

export async function processOfficialJournalChallengeCommand(
  context: AvailableTenantPrincipalContext,
  command: OfficialJournalChallengeCommand,
): Promise<OfficialJournalChallengeCommandResult> {
  try {
    assertContext(context, "community:challenge:write");
    if (!IDEMPOTENCY_RE.test(command.idempotencyKey)) {
      throw new Error("community_challenge_idempotency_invalid");
    }
    const transaction = await withTx(async (client) => {
      const now = await databaseNow(client);
      const cycle = deriveOfficialJournalChallengeCycle(now);
      if (command.cycleKey !== cycle.key) {
        return { ok: false, reason: "challenge_cycle_conflict" } as const;
      }
      const consentEnabled = await loadConsent(client, context);
      if (!consentEnabled) {
        return { ok: false, reason: "challenge_consent_required" } as const;
      }

      const lockIdentity = JSON.stringify([
        OPERATION_PREFIX,
        context.tenantId,
        context.workspaceId,
        context.principalId,
        cycle.key,
        command.action,
      ]);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
        [lockIdentity],
      );

      const requestHash = commandHash(command);
      const receipt = await claimCommandReceipt(client, context, command, requestHash);
      if (receipt.kind === "conflict") {
        return { ok: false, reason: "idempotency_conflict" } as const;
      }
      if (receipt.kind === "processing") {
        return { ok: false, reason: "command_in_progress" } as const;
      }
      if (receipt.kind === "replay") {
        return { ok: true, replayed: true, state: receipt.state } as const;
      }

      let enrollment = await loadEnrollment(client, context, cycle.key, true);
      if (command.action === "join") {
        let created = false;
        if (!enrollment) {
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO academy_community_challenge_enrollments
               (id, tenant_id, workspace_id, principal_type, student_id,
                challenge_id, challenge_version, cycle_key,
                cycle_starts_at, cycle_ends_at, started_at)
             VALUES
               ($1::uuid, $2, $3, 'student', $4::uuid,
                $5, $6, $7, $8::timestamptz, $9::timestamptz, $10::timestamptz)
             ON CONFLICT
               (tenant_id, workspace_id, principal_type, principal_id,
                challenge_id, challenge_version, cycle_key)
             DO NOTHING
             RETURNING id::text`,
            [
              randomUUID(), context.tenantId, context.workspaceId, context.principalId,
              OFFICIAL_JOURNAL_CHALLENGE_ID, OFFICIAL_JOURNAL_CHALLENGE_VERSION,
              cycle.key, cycle.startsAt, cycle.endsAt, now.toISOString(),
            ],
          );
          created = Boolean(inserted.rows[0]);
          enrollment = await loadEnrollment(client, context, cycle.key, true);
          if (!enrollment) throw new Error("community_challenge_enrollment_insert_missing");
          validateEnrollmentRow(enrollment, cycle);
          if (created) {
            await writeEvent(client, {
              enrollmentId: enrollment.id,
              type: "joined",
              command,
              requestHash,
              evidence: {
                challengeId: OFFICIAL_JOURNAL_CHALLENGE_ID,
                challengeVersion: OFFICIAL_JOURNAL_CHALLENGE_VERSION,
                cycleKey: cycle.key,
                startedAt: iso(enrollment.started_at),
                retrospectiveEvidenceAccepted: false,
                rewardsEnabled: false,
              },
            });
          }
        }
        const state = await currentStateInTransaction(client, context, now);
        await completeCommandReceipt(client, context, command, state);
        return { ok: true, replayed: false, state } as const;
      }

      if (!enrollment) {
        throw new Error("community_challenge_evaluate_without_enrollment");
      }
      if (enrollment.status === "completed") {
        const state = stateFrom(cycle, consentEnabled, enrollment, null);
        await completeCommandReceipt(client, context, command, state);
        return { ok: true, replayed: false, state } as const;
      }

      const validated = validateEnrollmentRow(enrollment, cycle);
      const evidenceEnd = new Date(
        Math.min(now.getTime(), new Date(cycle.endsAt).getTime()),
      ).toISOString();
      const progress = await calculateEvidenceProgress(
        client,
        context.principalId,
        validated.startedAt,
        evidenceEnd,
      );
      const completed = progress.eligibleToComplete;
      const updated = await client.query<EnrollmentRow>(
        `UPDATE academy_community_challenge_enrollments
            SET status = $4,
                revision = revision + 1,
                evaluated_at = $5::timestamptz,
                completed_at = CASE WHEN $4 = 'completed' THEN $5::timestamptz ELSE NULL END,
                eligible_closed_trade_count = $6,
                valid_reflection_count = $7
          WHERE id = $1::uuid
            AND tenant_id = $2
            AND principal_id = $3
            AND status = 'active'
          RETURNING id::text, challenge_id, challenge_version, cycle_key,
                    cycle_starts_at, cycle_ends_at, status, revision::text,
                    started_at, evaluated_at, completed_at,
                    eligible_closed_trade_count, valid_reflection_count,
                    coverage_rate::text`,
        [
          enrollment.id, context.tenantId, context.principalId,
          completed ? "completed" : "active", now.toISOString(),
          progress.eligibleClosedTrades, progress.validReflections,
        ],
      );
      enrollment = updated.rows[0] ?? null;
      if (!enrollment) throw new Error("community_challenge_evaluation_update_missing");
      validateEnrollmentRow(enrollment, cycle);

      await writeEvent(client, {
        enrollmentId: enrollment.id,
        type: completed ? "completed" : "evaluated",
        command,
        requestHash,
        evidence: {
          challengeId: OFFICIAL_JOURNAL_CHALLENGE_ID,
          challengeVersion: OFFICIAL_JOURNAL_CHALLENGE_VERSION,
          cycleKey: cycle.key,
          evidenceStartsAt: validated.startedAt,
          evidenceEndsAt: evidenceEnd,
          eligibleClosedTrades: progress.eligibleClosedTrades,
          validReflections: progress.validReflections,
          coverageRate: progress.coverageRate,
          minimumTrades: OFFICIAL_JOURNAL_CHALLENGE_MIN_TRADES,
          requiredRate: OFFICIAL_JOURNAL_CHALLENGE_REQUIRED_RATE,
          completed,
          rewardsEnabled: false,
        },
      });

      const state = stateFrom(cycle, consentEnabled, enrollment, null);
      await completeCommandReceipt(client, context, command, state);
      return { ok: true, replayed: false, state } as const;
    });
    if (!transaction.enabled) {
      return { ok: false, reason: "challenge_authority_unavailable" };
    }
    return transaction.value;
  } catch (error) {
    if (String(error).includes("community_challenge_evaluate_without_enrollment")) {
      return { ok: false, reason: "challenge_not_joined" };
    }
    logger.error("[community-challenge] command failed", {
      requestId: context.requestId,
      action: command.action,
      principalFingerprint: createHash("sha256")
        .update(`${context.tenantId}\0${context.principalId}`)
        .digest("hex"),
      error: String(error),
    });
    return { ok: false, reason: "challenge_authority_unavailable" };
  }
}
