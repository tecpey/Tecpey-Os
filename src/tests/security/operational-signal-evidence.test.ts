import assert from "node:assert/strict";
import test from "node:test";
import {
  createOperationalSignalEvidence,
  validateOperationalSignalEvidence,
} from "@/lib/ops/operational-signal-evidence";

function signal(occurredAt: string, sourceUnit = "tecpey-mentor-profile-health.service") {
  return createOperationalSignalEvidence({
    signalType: "mentor_profile_projection_health",
    component: "mentor_profile_projection",
    sourceUnit,
    severity: "critical",
    lifecycle: "firing",
    occurredAt,
    dedupeWindowSeconds: 3_600,
    reasonCodes: ["dead_letter_present", "ready_age_critical"],
    measurements: {
      unresolved_dead_letters: 1,
      oldest_ready_age_seconds: 420,
    },
  });
}

test("operational signal identity is stable inside one dedupe window", () => {
  const first = signal("2026-09-18T12:05:00.000Z");
  const second = createOperationalSignalEvidence({
    ...first,
    signalId: undefined as never,
    incidentKey: undefined as never,
    occurredAt: "2026-09-18T12:55:00.000Z",
    measurements: {
      unresolved_dead_letters: 3,
      oldest_ready_age_seconds: 900,
    },
  });
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
  assert.notEqual(first.signalId, nextWindow.signalId);
  assert.notEqual(first.incidentKey, otherDetector.incidentKey);
  assert.notEqual(first.signalId, otherDetector.signalId);
});

test("operational signal payload forbids free-text measurements and bad windows", () => {
  assert.throws(
    () =>
      createOperationalSignalEvidence({
        signalType: "mentor_profile_projection_health",
        component: "mentor_profile_projection",
        sourceUnit: "tecpey-mentor-profile-health.service",
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
