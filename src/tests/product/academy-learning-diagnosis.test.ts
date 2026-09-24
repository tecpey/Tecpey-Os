import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ACADEMY_LEARNING_DIAGNOSIS_POLICY_VERSION,
  diagnoseAcademyLearning,
  type AcademyLearningEvidence,
} from "../../lib/academy-learning-diagnosis";

const asOf = new Date("2026-09-24T12:00:00.000Z");

function evidence(
  patch: Partial<AcademyLearningEvidence> = {},
): AcademyLearningEvidence {
  return {
    sourceType: "assessment",
    sourceId: "assessment:risk:1",
    conceptTag: "risk",
    strength: -80,
    confidence: 90,
    observedAt: "2026-09-23T12:00:00.000Z",
    ...patch,
  };
}

describe("Academy learning diagnosis", () => {
  it("uses an explicit versioned policy", () => {
    assert.equal(ACADEMY_LEARNING_DIAGNOSIS_POLICY_VERSION, "academy-learning-diagnosis-v1");
  });

  it("fails closed when governed evidence is absent or stale", () => {
    assert.deepEqual(diagnoseAcademyLearning({ evidence: [], asOf }), {
      status: "insufficient_evidence",
      concepts: [],
    });

    assert.deepEqual(
      diagnoseAcademyLearning({
        evidence: [evidence({ observedAt: "2026-01-01T00:00:00.000Z" })],
        asOf,
      }),
      { status: "insufficient_evidence", concepts: [] },
    );
  });

  it("is deterministic for the same evidence snapshot regardless of input order", () => {
    const snapshot = [
      evidence(),
      evidence({
        sourceType: "arena",
        sourceId: "arena:risk:2",
        strength: -65,
        confidence: 80,
        observedAt: "2026-09-20T12:00:00.000Z",
      }),
      evidence({
        sourceId: "assessment:security:1",
        conceptTag: "security",
        strength: -55,
        confidence: 95,
      }),
    ];

    assert.deepEqual(
      diagnoseAcademyLearning({ evidence: snapshot, asOf }),
      diagnoseAcademyLearning({ evidence: [...snapshot].reverse(), asOf }),
    );
  });

  it("weights governed assessment evidence above advisory Mentor evidence", () => {
    const result = diagnoseAcademyLearning({
      evidence: [
        evidence({ conceptTag: "risk", sourceType: "assessment", sourceId: "assessment:risk" }),
        evidence({ conceptTag: "fomo", sourceType: "mentor", sourceId: "mentor:fomo" }),
      ],
      asOf,
    });
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    assert.equal(result.concepts[0].conceptTag, "risk");
    assert.ok(result.concepts[0].priorityBps > result.concepts[1].priorityBps);
    assert.equal(result.concepts[0].authoritativeEvidenceCount, 1);
    assert.equal(result.concepts[1].authoritativeEvidenceCount, 0);
  });

  it("decays older evidence and exposes reason codes instead of opaque ranking", () => {
    const result = diagnoseAcademyLearning({
      evidence: [
        evidence({ conceptTag: "fresh-risk", sourceId: "fresh", observedAt: "2026-09-23T12:00:00.000Z" }),
        evidence({ conceptTag: "old-risk", sourceId: "old", observedAt: "2026-07-01T12:00:00.000Z" }),
      ],
      asOf,
    });
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    const fresh = result.concepts.find((item) => item.conceptTag === "fresh-risk");
    const old = result.concepts.find((item) => item.conceptTag === "old-risk");
    assert.ok(fresh && old);
    assert.ok(fresh.priorityBps > old.priorityBps);
    assert.ok(old.reasonCodes.includes("evidence_decayed"));
  });

  it("does not treat positive evidence as a weakness signal", () => {
    assert.deepEqual(
      diagnoseAcademyLearning({
        evidence: [evidence({ strength: 80 })],
        asOf,
      }),
      { status: "insufficient_evidence", concepts: [] },
    );
  });
});
