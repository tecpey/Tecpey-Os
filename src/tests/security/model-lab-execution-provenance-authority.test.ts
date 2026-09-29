import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MODEL_LAB_EXECUTION_AUTHORITY_SQL,
  MODEL_LAB_EXECUTION_TABLES,
} from "../../lib/db-migrate-ai-model-lab-execution";

describe("Model Lab execution database authority", () => {
  it("protects every execution relation with signed tenant FORCE RLS", () => {
    assert.deepEqual(MODEL_LAB_EXECUTION_TABLES, [
      "ai_model_lab_egress_admissions",
      "ai_model_lab_execution_results",
    ]);
    for (const table of MODEL_LAB_EXECUTION_TABLES) {
      assert.match(MODEL_LAB_EXECUTION_AUTHORITY_SQL, new RegExp(table));
    }
    assert.match(MODEL_LAB_EXECUTION_AUTHORITY_SQL, /FORCE ROW LEVEL SECURITY/u);
    assert.match(
      MODEL_LAB_EXECUTION_AUTHORITY_SQL,
      /tecpey_ai_authorized_context\(\)/u,
    );
  });

  it("binds egress to the exact account-owned run, candidate and spend reservation", () => {
    assert.match(
      MODEL_LAB_EXECUTION_AUTHORITY_SQL,
      /FOREIGN KEY \(run_id, tenant_id, workspace_id, account_id\)[\s\S]*REFERENCES ai_model_lab_runs/u,
    );
    assert.match(
      MODEL_LAB_EXECUTION_AUTHORITY_SQL,
      /FOREIGN KEY \(candidate_id, run_id, tenant_id, workspace_id\)[\s\S]*REFERENCES ai_model_lab_candidates/u,
    );
    assert.match(
      MODEL_LAB_EXECUTION_AUTHORITY_SQL,
      /FOREIGN KEY \(reservation_id, tenant_id, workspace_id, agent_id\)[\s\S]*REFERENCES ai_spend_reservations/u,
    );
  });

  it("requires terminal results to attach to their immutable egress identity", () => {
    assert.match(
      MODEL_LAB_EXECUTION_AUTHORITY_SQL,
      /FOREIGN KEY \([\s\S]*attempt_id, tenant_id, workspace_id, account_id, run_id, candidate_id[\s\S]*\)[\s\S]*REFERENCES ai_model_lab_egress_admissions/u,
    );
    assert.match(
      MODEL_LAB_EXECUTION_AUTHORITY_SQL,
      /status <> 'succeeded'[\s\S]*model_identity_verified = TRUE[\s\S]*output_hash IS NOT NULL/u,
    );
  });

  it("persists hashes and sanitized references rather than raw prompts or outputs", () => {
    assert.match(MODEL_LAB_EXECUTION_AUTHORITY_SQL, /input_digest CHAR\(64\)/u);
    assert.match(MODEL_LAB_EXECUTION_AUTHORITY_SQL, /output_hash CHAR\(64\)/u);
    assert.match(MODEL_LAB_EXECUTION_AUTHORITY_SQL, /source_refs JSONB/u);
    assert.doesNotMatch(MODEL_LAB_EXECUTION_AUTHORITY_SQL, /\bprompt\s+TEXT\b/u);
    assert.doesNotMatch(MODEL_LAB_EXECUTION_AUTHORITY_SQL, /\boutput_text\s+TEXT\b/u);
    assert.doesNotMatch(MODEL_LAB_EXECUTION_AUTHORITY_SQL, /\bresponse_body\s+TEXT\b/u);
  });

  it("keeps evidence append-only and grants no worker mutation authority", () => {
    assert.match(
      MODEL_LAB_EXECUTION_AUTHORITY_SQL,
      /model lab execution evidence is append-only/u,
    );
    assert.match(
      MODEL_LAB_EXECUTION_AUTHORITY_SQL,
      /BEFORE UPDATE OR DELETE ON ai_model_lab_egress_admissions/u,
    );
    assert.match(
      MODEL_LAB_EXECUTION_AUTHORITY_SQL,
      /BEFORE UPDATE OR DELETE ON ai_model_lab_execution_results/u,
    );
    assert.match(
      MODEL_LAB_EXECUTION_AUTHORITY_SQL,
      /GRANT SELECT, INSERT ON TABLE[\s\S]*TO tecpey_ai_tenant_runtime/u,
    );
    assert.doesNotMatch(
      MODEL_LAB_EXECUTION_AUTHORITY_SQL,
      /GRANT (?:SELECT|INSERT|UPDATE|DELETE)[\s\S]{0,500}TO tecpey_ai_worker/u,
    );
  });
});
