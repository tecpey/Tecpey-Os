import "server-only";

import {
  MENTOR_PROFILE_HEALTH_POLICY_VERSION,
  type MentorProfileHealthEvaluation,
  type MentorProfileHealthSnapshot,
} from "@/lib/mentor-profile-health";
import {
  buildOperationalSignal,
  type OperationalSignalEvidence,
} from "@/lib/ops/operational-signal-evidence";

const SOURCE = Object.freeze({
  component: "mentor-profile-projection",
  unit: "tecpey-mentor-profile-health.service",
});

const CRITICAL_DEDUPE_WINDOW_SECONDS = 5 * 60;
const WARNING_DEDUPE_WINDOW_SECONDS = 30 * 60;

function numericAttributes(
  snapshot: MentorProfileHealthSnapshot,
): Readonly<Record<string, number | null>> {
  return Object.freeze({
    pending: snapshot.pending,
    processing: snapshot.processing,
    failedRetryable: snapshot.failedRetryable,
    unresolvedTerminalFailures: snapshot.unresolvedTerminalFailures,
    unresolvedDeadLetters: snapshot.unresolvedDeadLetters,
    readyBacklog: snapshot.readyBacklog,
    overdueLeases: snapshot.overdueLeases,
    oldestReadyAgeSeconds: snapshot.oldestReadyAgeSeconds,
    maxLeaseOverdueSeconds: snapshot.maxLeaseOverdueSeconds,
  });
}

export function buildMentorProfileHealthSignal(
  snapshot: MentorProfileHealthSnapshot,
  evaluation: MentorProfileHealthEvaluation,
  observedAt: string,
): OperationalSignalEvidence | null {
  if (evaluation.status === "healthy") return null;
  return buildOperationalSignal({
    eventName: "mentor.profile.projection.health",
    source: SOURCE,
    severity: evaluation.status === "critical" ? "critical" : "warning",
    policyVersion: MENTOR_PROFILE_HEALTH_POLICY_VERSION,
    occurredAt: observedAt,
    observedAt,
    dedupeWindowSeconds:
      evaluation.status === "critical"
        ? CRITICAL_DEDUPE_WINDOW_SECONDS
        : WARNING_DEDUPE_WINDOW_SECONDS,
    reasonCodes: evaluation.reasonCodes,
    attributes: numericAttributes(snapshot),
  });
}

export function buildMentorProfileHealthAuthoritySignal(
  reasonCode:
    | "mentor_profile_database_unavailable"
    | "mentor_profile_health_probe_failed",
  observedAt: string,
): OperationalSignalEvidence {
  return buildOperationalSignal({
    eventName: "mentor.profile.projection.health_authority",
    source: SOURCE,
    severity: "critical",
    policyVersion: MENTOR_PROFILE_HEALTH_POLICY_VERSION,
    occurredAt: observedAt,
    observedAt,
    dedupeWindowSeconds: CRITICAL_DEDUPE_WINDOW_SECONDS,
    reasonCodes: [reasonCode],
    attributes: {},
  });
}
