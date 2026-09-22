import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEEP_RESEARCH_PROVENANCE_SQL, DEEP_RESEARCH_TABLES } from "@/lib/db-migrate-deep-research-provenance";

describe("deep research provenance database authority", () => {
  it("protects every research relation with FORCE RLS and signed AI context", () => {
    assert.equal(DEEP_RESEARCH_TABLES.length, 6);
    for (const table of DEEP_RESEARCH_TABLES) assert.match(DEEP_RESEARCH_PROVENANCE_SQL, new RegExp(table));
    assert.match(DEEP_RESEARCH_PROVENANCE_SQL, /FORCE ROW LEVEL SECURITY/u);
    assert.match(DEEP_RESEARCH_PROVENANCE_SQL, /tecpey_ai_authorized_context\(\)/u);
  });
  it("binds claims, citations, sources and artifacts to scoped parents", () => {
    assert.match(DEEP_RESEARCH_PROVENANCE_SQL, /FOREIGN KEY \(run_id, tenant_id, workspace_id\)/u);
    assert.match(DEEP_RESEARCH_PROVENANCE_SQL, /FOREIGN KEY \(claim_id, tenant_id, workspace_id\)/u);
    assert.match(DEEP_RESEARCH_PROVENANCE_SQL, /FOREIGN KEY \(source_id, tenant_id, workspace_id\)/u);
  });
  it("makes finalized artifacts immutable and records provider provenance", () => {
    assert.match(DEEP_RESEARCH_PROVENANCE_SQL, /final research artifacts are immutable/u);
    assert.match(DEEP_RESEARCH_PROVENANCE_SQL, /provider_id TEXT NOT NULL/u);
    assert.match(DEEP_RESEARCH_PROVENANCE_SQL, /cited_source_count INTEGER NOT NULL/u);
  });
  it("does not grant the cross-tenant worker broad research access", () => {
    assert.doesNotMatch(DEEP_RESEARCH_PROVENANCE_SQL, /GRANT (?:SELECT|INSERT|UPDATE|DELETE)[\s\S]{0,500}TO tecpey_ai_worker/u);
  });
});
