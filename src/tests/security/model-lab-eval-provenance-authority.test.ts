import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_MODEL_EVALUATION_AUTHORITY_SQL,
  AI_MODEL_EVALUATION_TABLES,
} from "../../lib/db-migrate-ai-model-evaluation";

describe("Model evaluation provenance authority", () => {
  it("protects all evaluation relations with signed FORCE RLS", () => {
    assert.deepEqual(AI_MODEL_EVALUATION_TABLES, [
      "ai_model_capability_snapshots",
      "ai_model_eval_runs",
      "ai_model_eval_metric_results",
    ]);
    assert.match(AI_MODEL_EVALUATION_AUTHORITY_SQL, /FORCE ROW LEVEL SECURITY/u);
    assert.match(AI_MODEL_EVALUATION_AUTHORITY_SQL, /tecpey_ai_authorized_context\(\)/u);
    for (const table of AI_MODEL_EVALUATION_TABLES) {
      assert.match(AI_MODEL_EVALUATION_AUTHORITY_SQL, new RegExp(table));
    }
  });

  it("stores bounded hashes and metrics instead of raw prompts or model outputs", () => {
    assert.match(AI_MODEL_EVALUATION_AUTHORITY_SQL, /dataset_hash CHAR\(64\)/u);
    assert.match(AI_MODEL_EVALUATION_AUTHORITY_SQL, /evidence_hash CHAR\(64\)/u);
    assert.doesNotMatch(AI_MODEL_EVALUATION_AUTHORITY_SQL, /\bprompt\s+TEXT\b/u);
    assert.doesNotMatch(AI_MODEL_EVALUATION_AUTHORITY_SQL, /\boutput\s+TEXT\b/u);
    assert.match(AI_MODEL_EVALUATION_AUTHORITY_SQL, /octet_length\(reasons::text\) <= 16384/u);
  });

  it("separates scored quality metrics from latency and cost observations", () => {
    assert.match(
      AI_MODEL_EVALUATION_AUTHORITY_SQL,
      /latency_p95_ms','cost_per_sample_usd_micros/u,
    );
    assert.match(
      AI_MODEL_EVALUATION_AUTHORITY_SQL,
      /score_basis_points IS NULL AND measured_value IS NOT NULL/u,
    );
    assert.match(
      AI_MODEL_EVALUATION_AUTHORITY_SQL,
      /score_basis_points IS NOT NULL AND measured_value IS NULL/u,
    );
  });

  it("makes capability, eval and metric evidence append-only without worker grants", () => {
    for (const table of AI_MODEL_EVALUATION_TABLES) {
      assert.match(
        AI_MODEL_EVALUATION_AUTHORITY_SQL,
        new RegExp(`BEFORE UPDATE OR DELETE ON ${table}`),
      );
    }
    assert.doesNotMatch(
      AI_MODEL_EVALUATION_AUTHORITY_SQL,
      /GRANT (?:SELECT|INSERT|UPDATE|DELETE)[\s\S]{0,500}TO tecpey_ai_worker/u,
    );
  });
});
