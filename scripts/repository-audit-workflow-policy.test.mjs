import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertRepositoryAuditWorkflow,
  repositoryAuditWorkflowFindings,
} from "./repository-audit-workflow-policy.mjs";

const workflow = fs.readFileSync(".github/workflows/repository-audit-manifest.yml", "utf8");

test("repository audit workflow is exact-head, read-only and action-pinned", () => {
  assert.doesNotThrow(() => assertRepositoryAuditWorkflow(workflow));
});

test("policy rejects synthetic-merge checkout drift", () => {
  const mutated = workflow.replace(
    "ref: ${{ github.event.pull_request.head.sha || github.sha }}",
    "ref: ${{ github.sha }}",
  );
  assert.match(repositoryAuditWorkflowFindings(mutated).join("\n"), /pull-request head SHA/);
});

test("policy rejects reserved GitHub SHA overrides", () => {
  const mutated = workflow.replaceAll(
    "TECPEY_AUDIT_SOURCE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
    "GITHUB_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
  );
  const findings = repositoryAuditWorkflowFindings(mutated).join("\n");
  assert.match(findings, /expected source SHA/);
  assert.match(findings, /reserved GITHUB_SHA/);
});

test("policy rejects floating third-party actions", () => {
  const mutated = workflow.replace(
    "actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4",
    "actions/checkout@v4",
  );
  assert.match(repositoryAuditWorkflowFindings(mutated).join("\n"), /not pinned/);
});

test("policy rejects write-capable or overridden workflow permissions", () => {
  for (const mutated of [
    workflow.replace("  contents: read", "  contents: write"),
    workflow.replace("  contents: read", "  contents: read\n  actions: write"),
    workflow.replace("permissions:\n  contents: read", "permissions: read-all"),
    workflow.replace(
      "jobs:\n  manifest:",
      "jobs:\n  manifest:\n    permissions:\n      contents: write",
    ),
  ]) {
    assert.match(
      repositoryAuditWorkflowFindings(mutated).join("\n"),
      /permissions must be exactly one top-level contents: read grant/,
    );
  }
});
