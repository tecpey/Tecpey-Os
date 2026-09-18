import assert from "node:assert/strict";
import test from "node:test";
import {
  createOperationalSignalEvidence,
  validateOperationalSignalEvidence,
} from "@/lib/ops/operational-signal-evidence";

function signal(
  occurredAt: string,
  sourceUnit = "tecpey-mentor-profile-health.service",
  instanceFingerprint = "111111111111111111111111",
  measurements: Record<string, number | boolean | null> = {
    unresolved_dead_letters: 1,
    oldest_ready_age_seconds: 420,
  },
) {
  return createOperationalSignalEvidence({
    signalType: "mentor_profile_projection_health",
    component: "mentor_profile_projection",
    sourceUnit,
    instanceFingerprint,
    severity: "critical",
    lifecycle: "firing",
    occurredAt,
    dedupeWindowSeconds: 3_600,
    reasonCodes: ["dead_letter_present", "ready_age_critical"],
    measurements,
  });
}

test("operational signal identity is stable inside one dedupe window", () => {
  const first = signal("2026-09-18T12:05:00.000Z");
  const second = signal(
    "2026-09-18T12:55:00.000Z",
    "tecpey-mentor-profile-health.service",
    "111111111111111111111111",
    {
      unresolved_dead_letters: 3,
      oldest_ready_age_seconds: 900,
    },
  );
  assert.equal(first.signalId, second.signalId);
  assert.equal(first.incidentKey, second.incidentKey);
  assert.equal(first.dedupeWindowStart, "2026-09-18T12:00:00.000Z");
  assert.deepEqual(validateOperationalSignalEvidence(first), first);
});

test("new windows and different detector services produce distinct identities", () => {
  const first = signal("2026-09-18T12:05:00.000Z");
  const nextWindow = signal("2026-09-18T13:05:00.000Z");
  const otherDetector = signal(
    "2026-09-18T12:05:00.000Z",
    "tecpey-other-health.service",
  );
  const otherInstance = signal(
    "2026-09-18T12:05:00.000Z",
    "tecpey-mentor-profile-health.service",
    "222222222222222222222222",
  );
  assert.notEqual(first.signalId, nextWindow.signalId);
  assert.notEqual(first.incidentKey, otherDetector.incidentKey);
  assert.notEqual(first.signalId, otherDetector.signalId);
  assert.notEqual(first.incidentKey, otherInstance.incidentKey);
  assert.notEqual(first.signalId, otherInstance.signalId);
});

test("operational signal payload forbids free-text measurements and bad windows", () => {
  assert.throws(
    () =>
      createOperationalSignalEvidence({
        signalType: "mentor_profile_projection_health",
        component: "mentor_profile_projection",
        sourceUnit: "tecpey-mentor-profile-health.service",
        instanceFingerprint: "111111111111111111111111",
        severity: "critical",
        occurredAt: "2026-09-18T12:05:00.000Z",
        dedupeWindowSeconds: 30,
        reasonCodes: ["dead_letter_present"],
        measurements: {},
      }),
    /operational_signal_dedupe_window_invalid/,
  );

  assert.throws(
    () =>
      createOperationalSignalEvidence({
        signalType: "mentor_profile_projection_health",
        component: "mentor_profile_projection",
        sourceUnit: "tecpey-mentor-profile-health.service",
        instanceFingerprint: "111111111111111111111111",
        severity: "critical",
        occurredAt: "2026-09-18T12:05:00.000Z",
        reasonCodes: ["dead_letter_present"],
        measurements: {
          unsafe: "student-123" as never,
        },
      }),
    /operational_signal_measurement_value_invalid/,
  );
});

test("tampered incident identity is rejected", () => {
  const created = signal("2026-09-18T12:05:00.000Z");
  assert.throws(
    () =>
      validateOperationalSignalEvidence({
        ...created,
        incidentKey: "a".repeat(64),
      }),
    /operational_signal_incident_key_invalid/,
  );
});
