import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACADEMY_V3_DECISION_INVARIANT_CANONICAL_MIGRATION } from "./db-migration-content-academy-v3-decision-invariant";
import { ACADEMY_V3_DECISION_INVARIANT_MIGRATION_STEP } from "./db-migration-registry-academy-v3-decision-invariant";

// Contract-level guard used while step 104 is integrated into the canonical registry.
describe("Academy V3 migration step 104 contract", () => {
  it("binds the canonical 0120 identity to step 104", () => {
    assert.equal(ACADEMY_V3_DECISION_INVARIANT_CANONICAL_MIGRATION.identity, "0120_academy_v3_decision_invariant.sql");
    assert.equal(ACADEMY_V3_DECISION_INVARIANT_MIGRATION_STEP.sequence, 104);
    assert.equal(ACADEMY_V3_DECISION_INVARIANT_MIGRATION_STEP.id, "migration-step-104");
    assert.equal(ACADEMY_V3_DECISION_INVARIANT_MIGRATION_STEP.owner, "academy-platform");
    assert.equal(ACADEMY_V3_DECISION_INVARIANT_MIGRATION_STEP.domain, "academy");
  });
});
