import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ACADEMY_PROGRESS_AUTHORITY_SQL } from "@/lib/db-migrate-user-state";

describe("Academy authority migration contract", () => {
  it("enforces reward and command idempotency at the database layer", () => {
    assert.match(ACADEMY_PROGRESS_AUTHORITY_SQL, /UNIQUE \(student_id, locale, reward_key\)/);
    assert.match(ACADEMY_PROGRESS_AUTHORITY_SQL, /UNIQUE \(student_id, command_type, request_hash\)/);
    assert.match(ACADEMY_PROGRESS_AUTHORITY_SQL, /academy_learning_commands_idempotency_idx/);
  });

  it("preserves legacy mutable state for controlled reconciliation", () => {
    assert.match(ACADEMY_PROGRESS_AUTHORITY_SQL, /academy_progress_legacy_snapshots/);
    assert.match(ACADEMY_PROGRESS_AUTHORITY_SQL, /reconciliation_status/);
    assert.match(ACADEMY_PROGRESS_AUTHORITY_SQL, /progress_authority/);
  });
});
