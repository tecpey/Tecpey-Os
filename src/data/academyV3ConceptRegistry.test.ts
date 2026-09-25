import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  academyV3Concepts,
  validateAcademyV3ConceptRegistry,
} from "./academyV3ConceptRegistry";

describe("Academy V3 concept registry", () => {
  it("has stable unique IDs, known prerequisites and an acyclic graph", () => {
    assert.deepEqual(validateAcademyV3ConceptRegistry(), []);
  });

  it("covers every core term without turning Infinite Growth into a finite term", () => {
    assert.deepEqual([...new Set(academyV3Concepts.map((concept) => concept.term))], [1, 2, 3, 4, 5, 6, 7]);
    assert.ok(academyV3Concepts.length >= 50);
  });

  it("marks the safety-critical spine explicitly", () => {
    const critical = new Set(
      academyV3Concepts.filter((concept) => concept.safetyCriticality === "critical").map((concept) => concept.id),
    );
    for (const id of [
      "T1.FOUNDATIONAL_RISK",
      "T2.SEED_RECOVERY",
      "T2.TRANSFER_SAFETY",
      "T3.DEPOSIT_WITHDRAW",
      "T4.SOURCE_VERIFICATION",
      "T5.INVALIDATION",
      "T6.POSITION_SIZING",
      "T6.NO_TRADE",
      "T7.ARENA_TRANSFER",
      "T7.GRADUATION_TRANSFER",
    ]) {
      assert.ok(critical.has(id), `${id} must remain safety-critical`);
    }
  });

  it("keeps prerequisites earlier than or within the same term", () => {
    const byId = new Map(academyV3Concepts.map((concept) => [concept.id, concept] as const));
    for (const concept of academyV3Concepts) {
      for (const prerequisiteId of concept.prerequisiteConceptIds) {
        const prerequisite = byId.get(prerequisiteId);
        assert.ok(prerequisite, `${concept.id}: missing prerequisite ${prerequisiteId}`);
        assert.ok(
          prerequisite.term <= concept.term,
          `${concept.id}: prerequisite ${prerequisiteId} cannot live in a later term`,
        );
      }
    }
  });
});
