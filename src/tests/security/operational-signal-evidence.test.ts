import assert from "node:assert/strict";
import test from "node:test";
import {
  createOperationalSignalEvidence,
  validateOperationalSignalEvidence,
} from "@/lib/ops/operational-signal-evidence";

function signal(
  occurredAt: string,
  sourceUnit = "tecpey-mentor-profile-health.service",
  measurements: Record<string, number | boolean | null> = {
    unresolved_dead_letters: 1,
    oldest_ready_age_seconds: 420,
  },
) {
  return createOperationalSignalEvidence({
    signalType: "mentor_profile_projection_health",
    component: "mentor_profile_projection",
    sourceUnit,
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
    {
      unresolved_dead_letters: 3,
      oldest_ready_age_seconds: 900,
    },
  );
  assert.equal(first.signalId, second.signalId);
  assert.equal(first.incidentKey, second.incidentKey);
  assert.equal(first.incidentId, second.incidentId);
  assert.equal(first.conditionFingerprint, second.conditionFingerprint);
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

test("condition identity is stable across cause changes while incident generation rotates", () => {
  const first = signal("2026-09-18T12:05:00.000Z");
  const changed = createOperationalSignalEvidence({
    signalType: "mentor_profile_projection_health",
    component: "mentor_profile_projection",
    sourceUnit: "tecpey-mentor-profile-health.service",
    severity: "critical",
    lifecycle: "firing",
    occurredAt: "2026-09-18T12:10:00.000Z",
    dedupeWindowSeconds: 3_600,
    reasonCodes: ["lease_overdue_critical"],
    measurements: {},
  });
  assert.equal(first.incidentKey, changed.incidentKey);
  assert.notEqual(first.conditionFingerprint, changed.conditionFingerprint);
  assert.notEqual(first.incidentId, changed.incidentId);
  assert.notEqual(first.signalId, changed.signalId);
});

test("resolved signal keeps the exact incident generation and fingerprint", () => {
  const firing = signal("2026-09-18T12:05:00.000Z");
  const resolved = createOperationalSignalEvidence({
    signalType: firing.signalType,
    component: firing.component,
    sourceUnit: firing.sourceUnit,
    severity: firing.severity,
    lifecycle: "resolved",
    occurredAt: "2026-09-18T12:20:00.000Z",
    incidentId: firing.incidentId,
    conditionFingerprint: firing.conditionFingerprint,
    reasonCodes: ["condition_recovered"],
    measurements: {},
  });
  assert.equal(resolved.incidentKey, firing.incidentKey);
  assert.equal(resolved.incidentId, firing.incidentId);
  assert.equal(resolved.conditionFingerprint, firing.conditionFingerprint);
  assert.notEqual(resolved.signalId, firing.signalId);
  assert.deepEqual(validateOperationalSignalEvidence(resolved), resolved);
});

test("resolved evidence cannot exist without explicit incident binding", () => {
  assert.throws(
    () =>
      createOperationalSignalEvidence({
        signalType: "mentor_profile_projection_health",
        component: "mentor_profile_projection",
        sourceUnit: "tecpey-mentor-profile-health.service",
        severity: "critical",
        lifecycle: "resolved",
        occurredAt: "2026-09-18T12:20:00.000Z",
        reasonCodes: ["condition_recovered"],
        measurements: {},
      }),
    /operational_signal_resolution_binding_required/,
  );
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

test("operational signal labels reject user-scoped and high-cardinality dimensions", () => {
  assert.throws(
    () =>
      createOperationalSignalEvidence({
        signalType: "mentor_profile_projection_health",
        component: "mentor_profile_projection",
        sourceUnit: "tecpey-mentor-profile-health.service",
        severity: "critical",
        occurredAt: "2026-09-18T12:05:00.000Z",
        reasonCodes: ["student_123456"],
        measurements: {},
      }),
    /operational_signal_reason_cardinality_forbidden/,
  );

  assert.throws(
    () =>
      createOperationalSignalEvidence({
        signalType: "mentor_profile_projection_health",
        component: "student_123456",
        sourceUnit: "tecpey-mentor-profile-health.service",
        severity: "critical",
        occurredAt: "2026-09-18T12:05:00.000Z",
        reasonCodes: ["dead_letter_present"],
        measurements: {},
      }),
    /operational_signal_component_cardinality_forbidden/,
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
          tenant_id: 42,
        },
      }),
    /operational_signal_measurement_cardinality_forbidden/,
  );

  assert.throws(
    () =>
      createOperationalSignalEvidence({
        signalType: "mentor_profile_projection_health",
        component: "mentor_profile_projection",
        sourceUnit: "tecpey-mentor-profile-health.service",
        severity: "critical",
        occurredAt: "2026-09-18T12:05:00.000Z",
        reasonCodes: ["trace_0123456789abcdef"],
        measurements: {},
      }),
    /operational_signal_reason_cardinality_forbidden/,
  );
});

test("firing fingerprint override and tampered generation identity are rejected", () => {
  const created = signal("2026-09-18T12:05:00.000Z");
  assert.throws(
    () =>
      createOperationalSignalEvidence({
        signalType: created.signalType,
        component: created.component,
        sourceUnit: created.sourceUnit,
        severity: "critical",
        lifecycle: "firing",
        occurredAt: created.occurredAt,
        incidentId: created.incidentId,
        conditionFingerprint: "a".repeat(64),
        reasonCodes: ["different_reason"],
        measurements: {},
      }),
    /operational_signal_condition_fingerprint_invalid/,
  );
  assert.throws(
    () =>
      validateOperationalSignalEvidence({
        ...created,
        incidentId: "b".repeat(64),
      }),
    /operational_signal_identity_invalid/,
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
