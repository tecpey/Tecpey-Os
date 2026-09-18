import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MENTOR_PROFILE_HEALTH_POLICY,
  evaluateMentorProfileHealth,
  mentorProfileHealthAlertMetadata,
  type MentorProfileHealthSnapshot,
} from "@/lib/mentor-profile-health";

const healthy: MentorProfileHealthSnapshot = {
  pending: 0,
  processing: 0,
  processed: 100,
  failedRetryable: 0,
  failedTerminal: 0,
  deadLetters: 0,
  readyBacklog: 0,
  overdueLeases: 0,
  oldestReadyAgeSeconds: null,
  maxLeaseOverdueSeconds: null,
};

test("Mentor profile health stays healthy at steady state", () => {
  assert.deepEqual(evaluateMentorProfileHealth(healthy), {
    status: "healthy",
    reasonCodes: [],
  });
});

test("retryable failures and bounded backlog age are warnings", () => {
  const result = evaluateMentorProfileHealth({
    ...healthy,
    failedRetryable: 1,
    readyBacklog: DEFAULT_MENTOR_PROFILE_HEALTH_POLICY.warningBacklogDepth,
    oldestReadyAgeSeconds:
      DEFAULT_MENTOR_PROFILE_HEALTH_POLICY.warningReadyAgeSeconds,
  });
  assert.equal(result.status, "warning");
  assert.deepEqual(result.reasonCodes, [
    "ready_age_warning",
    "ready_backlog_warning",
    "retryable_failure_present",
  ]);
});

test("terminal evidence, stale backlog and expired leases are critical", () => {
  const result = evaluateMentorProfileHealth({
    ...healthy,
    failedTerminal: 1,
    deadLetters: 1,
    readyBacklog: DEFAULT_MENTOR_PROFILE_HEALTH_POLICY.criticalBacklogDepth,
    overdueLeases: 2,
    oldestReadyAgeSeconds:
      DEFAULT_MENTOR_PROFILE_HEALTH_POLICY.criticalReadyAgeSeconds,
    maxLeaseOverdueSeconds:
      DEFAULT_MENTOR_PROFILE_HEALTH_POLICY.criticalLeaseOverdueSeconds,
  });
  assert.equal(result.status, "critical");
  assert.deepEqual(result.reasonCodes, [
    "dead_letter_present",
    "lease_overdue_critical",
    "ready_age_critical",
    "ready_backlog_critical",
    "terminal_projection_failure",
  ]);
});

test("alert metadata contains only aggregate operational values", () => {
  const evaluation = evaluateMentorProfileHealth(healthy);
  const metadata = mentorProfileHealthAlertMetadata(healthy, evaluation);
  assert.deepEqual(Object.keys(metadata).sort(), [
    "deadLetters",
    "failedRetryable",
    "failedTerminal",
    "maxLeaseOverdueSeconds",
    "oldestReadyAgeSeconds",
    "overdueLeases",
    "pending",
    "policyVersion",
    "processing",
    "readyBacklog",
    "reasonCodes",
    "status",
  ]);
  assert.doesNotMatch(JSON.stringify(metadata), /student|tenant|workspace|message|prompt/i);
});

test("invalid threshold ordering fails closed", () => {
  assert.throws(
    () =>
      evaluateMentorProfileHealth(healthy, {
        ...DEFAULT_MENTOR_PROFILE_HEALTH_POLICY,
        warningReadyAgeSeconds: 300,
        criticalReadyAgeSeconds: 60,
      }),
    /mentor_profile_health_age_threshold_order_invalid/,
  );
});
