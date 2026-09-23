import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MODEL_LAB_COUNCIL_AUTHORITY_SQL,
  MODEL_LAB_COUNCIL_TABLES,
} from "../../lib/db-migrate-ai-model-lab-council";

describe("Model Lab + Council database authority", () => {
  it("protects every relation with signed tenant FORCE RLS", () => {
    assert.deepEqual(MODEL_LAB_COUNCIL_TABLES, [
      "ai_model_lab_runs",
      "ai_model_lab_candidates",
      "ai_council_syntheses",
    ]);
    for (const table of MODEL_LAB_COUNCIL_TABLES) {
      assert.match(MODEL_LAB_COUNCIL_AUTHORITY_SQL, new RegExp(table));
    }
    assert.match(MODEL_LAB_COUNCIL_AUTHORITY_SQL, /FORCE ROW LEVEL SECURITY/u);
    assert.match(
      MODEL_LAB_COUNCIL_AUTHORITY_SQL,
      /tecpey_ai_authorized_context\(\)/u,
    );
  });

  it("stores prompt and council inputs by digest rather than raw prompt text", () => {
    assert.match(MODEL_LAB_COUNCIL_AUTHORITY_SQL, /prompt_digest CHAR\(64\)/u);
    assert.match(MODEL_LAB_COUNCIL_AUTHORITY_SQL, /input_digest CHAR\(64\)/u);
    assert.doesNotMatch(MODEL_LAB_COUNCIL_AUTHORITY_SQL, /\bprompt\s+TEXT\b/u);
    assert.doesNotMatch(MODEL_LAB_COUNCIL_AUTHORITY_SQL, /\binput_text\s+TEXT\b/u);
  });

  it("binds every candidate and optional council synthesis to the exact scoped run", () => {
    assert.match(
      MODEL_LAB_COUNCIL_AUTHORITY_SQL,
      /FOREIGN KEY \(run_id, tenant_id, workspace_id\)[\s\S]*REFERENCES ai_model_lab_runs/u,
    );
    assert.match(
      MODEL_LAB_COUNCIL_AUTHORITY_SQL,
      /FOREIGN KEY \(model_lab_run_id, tenant_id, workspace_id\)[\s\S]*REFERENCES ai_model_lab_runs/u,
    );
    assert.match(
      MODEL_LAB_COUNCIL_AUTHORITY_SQL,
      /UNIQUE \(tenant_id, workspace_id, run_id, provider_id, endpoint_id, canonical_model\)/u,
    );
  });

  it("persists entitlement version evidence and replay-safe idempotency boundaries", () => {
    assert.match(
      MODEL_LAB_COUNCIL_AUTHORITY_SQL,
      /entitlement_snapshot_version BIGINT NOT NULL/u,
    );
    assert.match(
      MODEL_LAB_COUNCIL_AUTHORITY_SQL,
      /subscription_state_version BIGINT NOT NULL/u,
    );
    assert.match(
      MODEL_LAB_COUNCIL_AUTHORITY_SQL,
      /UNIQUE \(tenant_id, workspace_id, account_id, idempotency_key\)/u,
    );
    assert.match(MODEL_LAB_COUNCIL_AUTHORITY_SQL, /request_hash CHAR\(64\)/u);
  });

  it("makes evidence append-only and grants no broad worker access", () => {
    assert.match(
      MODEL_LAB_COUNCIL_AUTHORITY_SQL,
      /model lab and council evidence is append-only/u,
    );
    assert.match(
      MODEL_LAB_COUNCIL_AUTHORITY_SQL,
      /BEFORE UPDATE OR DELETE ON ai_model_lab_runs/u,
    );
    assert.match(
      MODEL_LAB_COUNCIL_AUTHORITY_SQL,
      /BEFORE UPDATE OR DELETE ON ai_model_lab_candidates/u,
    );
    assert.match(
      MODEL_LAB_COUNCIL_AUTHORITY_SQL,
      /BEFORE UPDATE OR DELETE ON ai_council_syntheses/u,
    );
    assert.doesNotMatch(
      MODEL_LAB_COUNCIL_AUTHORITY_SQL,
      /GRANT (?:SELECT|INSERT|UPDATE|DELETE)[\s\S]{0,400}TO tecpey_ai_worker/u,
    );
  });
});
