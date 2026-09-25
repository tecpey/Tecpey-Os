import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  academyV3Concepts,
  validateAcademyV3ConceptRegistry,
} from "./academyV3ConceptRegistry";
import {
  academyV3CriticalObjectives,
  academyV3Misconceptions,
  validateAcademyV3CriticalLearningRegistry,
} from "./academyV3CriticalLearningRegistry";
import { academyV3ReferenceMissions as academyV3MissionBlueprints } from "./academyV3MissionRegistry";
import { academyV3ReferenceMissions } from "./academyV3ReferenceMissions";

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
  it("requires governed objectives, evidence strategies and misconception repair for the critical learning registry", () => {
    assert.deepEqual(validateAcademyV3CriticalLearningRegistry(), []);
    assert.ok(academyV3CriticalObjectives.length >= 15);
    assert.ok(academyV3Misconceptions.length >= 24);
    for (const objective of academyV3CriticalObjectives) {
      assert.ok(objective.evidenceKinds.length > 0, `${objective.id}: evidence strategy is required`);
    }
    for (const misconception of academyV3Misconceptions) {
      assert.ok(misconception.remediation);
      assert.ok(misconception.reassessment);
    }
  });
  it("binds reference missions to governed concepts, objectives and misconception identities", () => {
    const conceptIds = new Set(academyV3Concepts.map((concept) => concept.id));
    const objectiveIds = new Set(academyV3CriticalObjectives.map((objective) => objective.id));
    const misconceptionIds = new Set(academyV3Misconceptions.map((misconception) => misconception.id));
    for (const mission of academyV3ReferenceMissions) {
      assert.ok(conceptIds.has(mission.conceptId), `${mission.id}: concept must be governed`);
      assert.ok(mission.objectiveIds.length > 0, `${mission.id}: objectives are required`);
      for (const objectiveId of mission.objectiveIds) assert.ok(objectiveIds.has(objectiveId), `${mission.id}: unknown objective ${objectiveId}`);
      assert.ok(mission.scenario.knownEvidence.length > 0, `${mission.id}: known evidence is required`);
      assert.ok(mission.scenario.uncertainty.length > 0, `${mission.id}: uncertainty must be explicit`);
      assert.ok(mission.scenario.choices.some((choice) => choice.id === mission.scenario.correctChoiceId), `${mission.id}: correct choice must exist`);
      for (const choice of mission.scenario.choices) {
        if (choice.misconceptionId) assert.ok(misconceptionIds.has(choice.misconceptionId), `${mission.id}: unknown misconception ${choice.misconceptionId}`);
      }
      assert.ok(mission.scenario.evidenceThatCouldChangeDecision.fa.trim());
      assert.ok(mission.scenario.evidenceThatCouldChangeDecision.en.trim());
      assert.ok(mission.reassessment.minimumDelayHours > 0, `${mission.id}: delayed reassessment is required`);
    }
  });
  it("keeps reference mission blueprints evidence-bearing, bilingual and non-authoritative by themselves", () => {
    for (const mission of academyV3MissionBlueprints) {
      assert.equal(mission.awardsMasteryDirectly, false);
      assert.equal(mission.awardsLeagueScoreDirectly, false);
      assert.equal(mission.awardsFinancialValue, false);
      assert.ok(mission.stages.length >= 7);
      const stages = new Set(mission.stages.map((step) => step.stage));
      for (const required of ["mental-model", "misconception", "retrieval", "decision", "feedback", "transfer", "reassessment"]) {
        assert.ok(stages.has(required as never), `${mission.id}: missing ${required}`);
      }
      for (const step of mission.stages) {
        assert.ok(step.title.fa.trim() && step.title.en.trim(), `${mission.id}/${step.id}: bilingual title required`);
        assert.ok(step.prompt.fa.trim() && step.prompt.en.trim(), `${mission.id}/${step.id}: bilingual prompt required`);
      }
    }
  });
  it("keeps every V3 reference mission semantically complete in both FA and EN", () => {
    for (const mission of academyV3ReferenceMissions) {
      for (const locale of ["fa", "en"] as const) {
        assert.ok(mission.title[locale].trim(), `${mission.id}: ${locale} title required`);
        assert.ok(mission.mentalModel[locale].trim(), `${mission.id}: ${locale} mental model required`);
        assert.ok(mission.scenario.context[locale].trim(), `${mission.id}: ${locale} scenario required`);
        for (const evidence of mission.scenario.knownEvidence) assert.ok(evidence[locale].trim(), `${mission.id}: ${locale} known evidence required`);
        for (const uncertainty of mission.scenario.uncertainty) assert.ok(uncertainty[locale].trim(), `${mission.id}: ${locale} uncertainty required`);
        for (const choice of mission.scenario.choices) assert.ok(choice.text[locale].trim(), `${mission.id}: ${locale} choice required`);
        assert.ok(mission.scenario.rationale[locale].trim(), `${mission.id}: ${locale} rationale required`);
      }
    }
  });
});
