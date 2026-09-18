import assert from "node:assert/strict";
import test from "node:test";
import {
  createOperationalSignalEpisodeEvidence,
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


test("legacy v1 signal payload remains episode-field free", () => {
  const legacy = signal("2026-09-18T12:05:00.000Z");
  assert.equal(legacy.schemaVersion, 1);
  assert.equal(Object.hasOwn(legacy, "episodeId"), false);
  assert.equal(Object.hasOwn(legacy, "episodeSequence"), false);
  assert.deepEqual(validateOperationalSignalEvidence(legacy), legacy);
});

test("episode v2 identity is sequence-bound and recurrence-safe inside one legacy window", () => {
  const episodeId = "11111111-1111-4111-8111-111111111111";
  const firing = createOperationalSignalEpisodeEvidence({
    signalType: "mentor_profile_projection_health",
    component: "mentor_profile_projection",
    sourceUnit: "tecpey-mentor-profile-health.service",
    severity: "critical",
    lifecycle: "firing",
    episodeId,
    episodeSequence: 1,
    occurredAt: "2026-09-18T12:05:00.000Z",
    dedupeWindowSeconds: 3_600,
    reasonCodes: ["dead_letter_present"],
    measurements: { unresolved_dead_letters: 1 },
  });
  const updated = createOperationalSignalEpisodeEvidence({
    ...firing,
    lifecycle: "updated",
    episodeSequence: 2,
    occurredAt: "2026-09-18T12:20:00.000Z",
    reasonCodes: ["lease_overdue_critical"],
    measurements: { overdue_leases: 1 },
  });
  const recurrence = createOperationalSignalEpisodeEvidence({
    ...firing,
    episodeId: "22222222-2222-4222-8222-222222222222",
    occurredAt: "2026-09-18T12:30:00.000Z",
  });
  assert.equal(firing.schemaVersion, 2);
  assert.notEqual(firing.signalId, updated.signalId);
  assert.notEqual(firing.signalId, recurrence.signalId);
  assert.equal(firing.dedupeWindowStart, recurrence.dedupeWindowStart);
  assert.deepEqual(validateOperationalSignalEvidence(updated), updated);
});

test("episode v2 rejects tampered sequence identity", () => {
  const created = createOperationalSignalEpisodeEvidence({
    signalType: "mentor_profile_projection_health",
    component: "mentor_profile_projection",
    sourceUnit: "tecpey-mentor-profile-health.service",
    severity: "critical",
    lifecycle: "firing",
    episodeId: "33333333-3333-4333-8333-333333333333",
    episodeSequence: 1,
    occurredAt: "2026-09-18T12:05:00.000Z",
    reasonCodes: ["dead_letter_present"],
  });
  assert.throws(
    () =>
      validateOperationalSignalEvidence({
        ...created,
        episodeSequence: 2,
      }),
    /operational_signal_identity_invalid/,
  );
});
