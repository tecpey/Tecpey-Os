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

test("policy validates required controls at their effective YAML nodes", () => {
  for (const [mutated, finding] of [
    [
      workflow.replace(
        "          ref: ${{ github.event.pull_request.head.sha || github.sha }}",
        "          # ref: ${{ github.event.pull_request.head.sha || github.sha }}",
      ),
      /pull-request head SHA|YAML structure is invalid/,
    ],
    [
      workflow.replace(
        "          persist-credentials: false",
        "          # persist-credentials: false",
      ),
      /credentials must not persist|pull-request head SHA/,
    ],
    [
      workflow.replace(
        "        run: npm run audit:manifest:verify",
        "        run: echo verification-disabled # npm run audit:manifest:verify",
      ),
      /exact manifest verification is missing/,
    ],
    [
      workflow.replace(
        "        run: npm run audit:manifest:check",
        "        # run: npm run audit:manifest:check",
      ),
      /authority guard is missing|YAML structure is invalid/,
    ],
    [
      workflow.replace(
        "          TECPEY_AUDIT_SOURCE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
        "          MOVED_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
      ),
      /manifest generation must receive|exact manifest verification is missing/,
    ],
    [
      workflow.replace(
        "      - name: Run manifest policy tests",
        "      - name: Injected ungoverned step\n        run: echo bypass\n\n      - name: Run manifest policy tests",
      ),
      /exact governed step sequence/,
    ],
  ]) {
    assert.match(repositoryAuditWorkflowFindings(mutated).join("\n"), finding);
  }
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
    `${workflow}
  bypass:
    permissions: write-all
    runs-on: ubuntu-latest
    steps:
      - name: Bypass audit
        uses: actions/checkout@v4
`,
  ]) {
    assert.match(
      repositoryAuditWorkflowFindings(mutated).join("\n"),
      /permissions must be exactly one top-level contents: read grant|YAML structure is invalid/,
    );
  }
});

test("policy rejects conditions that can skip governed audit steps", () => {
  for (const stepName of [
    "Generate exact tracked-path manifest",
    "Verify exact denominator and evidence",
    "Upload immutable manifest evidence",
  ]) {
    const mutated = workflow.replace(
      `      - name: ${stepName}`,
      `      - name: ${stepName}\n        if: false`,
    );
    assert.match(
      repositoryAuditWorkflowFindings(mutated).join("\n"),
      /unsupported property if|YAML structure is invalid/,
    );
  }
});

test("policy rejects conditions or overrides on the governed audit job", () => {
  for (const injected of ["    if: false", "    permissions: write-all", "    environment: production"]) {
    const mutated = workflow.replace("  manifest:\n", `  manifest:\n${injected}\n`);
    assert.match(
      repositoryAuditWorkflowFindings(mutated).join("\n"),
      /unsupported property|YAML structure is invalid/,
    );
  }
});
