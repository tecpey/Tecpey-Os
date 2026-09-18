import type { PoolClient } from "pg";

export const MENTOR_PROFILE_HEALTH_POLICY_VERSION = "2026-09-18.1" as const;

export type MentorProfileHealthPolicy = Readonly<{
  warningReadyAgeSeconds: number;
  criticalReadyAgeSeconds: number;
  warningBacklogDepth: number;
  criticalBacklogDepth: number;
  criticalLeaseOverdueSeconds: number;
}>;

export const DEFAULT_MENTOR_PROFILE_HEALTH_POLICY: MentorProfileHealthPolicy =
  Object.freeze({
    warningReadyAgeSeconds: 60,
    criticalReadyAgeSeconds: 300,
    warningBacklogDepth: 50,
    criticalBacklogDepth: 500,
    criticalLeaseOverdueSeconds: 30,
  });

export type MentorProfileHealthSnapshot = Readonly<{
  pending: number;
  processing: number;
  processed: number;
  failedRetryable: number;
  failedTerminal: number;
  deadLetters: number;
  readyBacklog: number;
  overdueLeases: number;
  oldestReadyAgeSeconds: number | null;
  maxLeaseOverdueSeconds: number | null;
}>;

export type MentorProfileHealthEvaluation = Readonly<{
  status: "healthy" | "warning" | "critical";
  reasonCodes: readonly string[];
}>;

type HealthRow = {
  pending: string;
  processing: string;
  processed: string;
  failed_retryable: string;
  failed_terminal: string;
  dead_letters: string;
  ready_backlog: string;
  overdue_leases: string;
  oldest_ready_age_seconds: string | null;
  max_lease_overdue_seconds: string | null;
};

function count(value: string, code: string): number {
  if (!/^\d+$/.test(value)) throw new Error(code);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(code);
  return parsed;
}

function seconds(value: string | null, code: string): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(code);
  return Math.round(parsed * 1000) / 1000;
}

function assertPolicy(policy: MentorProfileHealthPolicy): void {
  for (const [key, value] of Object.entries(policy)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 86_400) {
      throw new Error(`mentor_profile_health_policy_invalid:${key}`);
    }
  }
  if (policy.warningReadyAgeSeconds >= policy.criticalReadyAgeSeconds) {
    throw new Error("mentor_profile_health_age_threshold_order_invalid");
  }
  if (policy.warningBacklogDepth >= policy.criticalBacklogDepth) {
    throw new Error("mentor_profile_health_backlog_threshold_order_invalid");
  }
}

export async function loadMentorProfileHealthSnapshot(
  client: PoolClient,
): Promise<MentorProfileHealthSnapshot> {
  const result = await client.query<HealthRow>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
       COUNT(*) FILTER (WHERE status = 'processing')::text AS processing,
       COUNT(*) FILTER (WHERE status = 'processed')::text AS processed,
       COUNT(*) FILTER (WHERE status = 'failed_retryable')::text AS failed_retryable,
       COUNT(*) FILTER (WHERE status = 'failed_terminal')::text AS failed_terminal,
       (
         SELECT COUNT(*)::text
           FROM mentor_profile_update_dead_letters
       ) AS dead_letters,
       COUNT(*) FILTER (
         WHERE status IN ('pending', 'failed_retryable')
           AND available_at <= NOW()
       )::text AS ready_backlog,
       COUNT(*) FILTER (
         WHERE status = 'processing'
           AND lease_expires_at <= NOW()
       )::text AS overdue_leases,
       EXTRACT(EPOCH FROM (
         NOW() - MIN(created_at) FILTER (
           WHERE status IN ('pending', 'failed_retryable')
             AND available_at <= NOW()
         )
       ))::text AS oldest_ready_age_seconds,
       EXTRACT(EPOCH FROM (
         NOW() - MIN(lease_expires_at) FILTER (
           WHERE status = 'processing'
             AND lease_expires_at <= NOW()
         )
       ))::text AS max_lease_overdue_seconds
     FROM mentor_profile_update_outbox`,
  );
  const row = result.rows[0];
  if (!row) throw new Error("mentor_profile_health_snapshot_missing");
  return Object.freeze({
    pending: count(row.pending, "mentor_profile_health_pending_invalid"),
    processing: count(row.processing, "mentor_profile_health_processing_invalid"),
    processed: count(row.processed, "mentor_profile_health_processed_invalid"),
    failedRetryable: count(
      row.failed_retryable,
      "mentor_profile_health_failed_retryable_invalid",
    ),
    failedTerminal: count(
      row.failed_terminal,
      "mentor_profile_health_failed_terminal_invalid",
    ),
    deadLetters: count(
      row.dead_letters,
      "mentor_profile_health_dead_letters_invalid",
    ),
    readyBacklog: count(
      row.ready_backlog,
      "mentor_profile_health_ready_backlog_invalid",
    ),
    overdueLeases: count(
      row.overdue_leases,
      "mentor_profile_health_overdue_leases_invalid",
    ),
    oldestReadyAgeSeconds: seconds(
      row.oldest_ready_age_seconds,
      "mentor_profile_health_ready_age_invalid",
    ),
    maxLeaseOverdueSeconds: seconds(
      row.max_lease_overdue_seconds,
      "mentor_profile_health_lease_age_invalid",
    ),
  });
}

export function evaluateMentorProfileHealth(
  snapshot: MentorProfileHealthSnapshot,
  policy: MentorProfileHealthPolicy = DEFAULT_MENTOR_PROFILE_HEALTH_POLICY,
): MentorProfileHealthEvaluation {
  assertPolicy(policy);
  const critical = new Set<string>();
  const warning = new Set<string>();

  if (snapshot.failedTerminal > 0) critical.add("terminal_projection_failure");
  if (snapshot.deadLetters > 0) critical.add("dead_letter_present");
  if (snapshot.readyBacklog >= policy.criticalBacklogDepth) {
    critical.add("ready_backlog_critical");
  } else if (snapshot.readyBacklog >= policy.warningBacklogDepth) {
    warning.add("ready_backlog_warning");
  }

  const readyAge = snapshot.oldestReadyAgeSeconds;
  if (readyAge !== null && readyAge >= policy.criticalReadyAgeSeconds) {
    critical.add("ready_age_critical");
  } else if (readyAge !== null && readyAge >= policy.warningReadyAgeSeconds) {
    warning.add("ready_age_warning");
  }

  const leaseAge = snapshot.maxLeaseOverdueSeconds;
  if (
    snapshot.overdueLeases > 0 &&
    leaseAge !== null &&
    leaseAge >= policy.criticalLeaseOverdueSeconds
  ) {
    critical.add("lease_overdue_critical");
  } else if (snapshot.overdueLeases > 0) {
    warning.add("lease_overdue_warning");
  }

  if (snapshot.failedRetryable > 0) warning.add("retryable_failure_present");

  if (critical.size > 0) {
    return { status: "critical", reasonCodes: [...critical].sort() };
  }
  if (warning.size > 0) {
    return { status: "warning", reasonCodes: [...warning].sort() };
  }
  return { status: "healthy", reasonCodes: [] };
}

export function mentorProfileHealthAlertMetadata(
  snapshot: MentorProfileHealthSnapshot,
  evaluation: MentorProfileHealthEvaluation,
): Record<string, unknown> {
  return {
    policyVersion: MENTOR_PROFILE_HEALTH_POLICY_VERSION,
    status: evaluation.status,
    reasonCodes: [...evaluation.reasonCodes],
    pending: snapshot.pending,
    processing: snapshot.processing,
    failedRetryable: snapshot.failedRetryable,
    failedTerminal: snapshot.failedTerminal,
    deadLetters: snapshot.deadLetters,
    readyBacklog: snapshot.readyBacklog,
    overdueLeases: snapshot.overdueLeases,
    oldestReadyAgeSeconds: snapshot.oldestReadyAgeSeconds,
    maxLeaseOverdueSeconds: snapshot.maxLeaseOverdueSeconds,
  };
}
