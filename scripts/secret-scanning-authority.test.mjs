import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  secretScanningRunnerFindings,
  secretScanningWorkflowFindings,
} from "./check-secret-scanning-authority.mjs";
import { readSecretScanningBaseline } from "./secret-scanning-baseline.mjs";

const workflow = fs.readFileSync(".github/workflows/secret-scanning.yml", "utf8");
const runner = fs.readFileSync("scripts/run-secret-scan.sh", "utf8");
const baseline = readSecretScanningBaseline();

test("workflow is exact-head, full-history, read-only and immutable", () => {
  assert.deepEqual(secretScanningWorkflowFindings(workflow), []);
  assert.deepEqual(secretScanningRunnerFindings(runner, baseline), []);
});

test("workflow rejects checkout, permission, redaction and evidence weakening", () => {
  for (const [mutated, expected] of [
    [
      workflow.replace(
        "          ref: ${{ github.event.pull_request.head.sha || github.sha }}",
        "          # ref: ${{ github.event.pull_request.head.sha || github.sha }}",
      ),
      /pull-request head SHA/,
    ],
    [workflow.replace("          fetch-depth: 0", "          fetch-depth: 1"), /complete history/],
    [
      workflow.replace("  contents: read", "  contents: write"),
      /permissions must grant only contents: read/,
    ],
    [
      workflow.replace(
        "        run: bash scripts/run-secret-scan.sh",
        "        run: echo scan-disabled # bash scripts/run-secret-scan.sh",
      ),
      /governed secret scanner/,
    ],
    [
      workflow.replace("        if: ${{ always() }}", "        if: ${{ success() }}"),
      /upload even after scan failure/,
    ],
    [
      workflow.replace(
        "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
        "actions/checkout@main",
      ),
      /not pinned/,
    ],
  ]) {
    assert.match(secretScanningWorkflowFindings(mutated).join("\n"), expected);
  }
});

test("runner rejects floating tools, broad output and incomplete history", () => {
  for (const [mutated, expected] of [
    [
      runner.replace('readonly GITLEAKS_VERSION="8.30.1"', 'readonly GITLEAKS_VERSION="latest"'),
      /GITLEAKS_VERSION/,
    ],
    [
      runner.replace(
        'if [[ "$artifact_dir" != "artifacts/secret-scanning" ]]; then',
        'if [[ -z "$artifact_dir" ]]; then',
      ),
      /artifact_dir/,
    ],
    [runner.replace("  --redact \\", "  --no-redact \\"), /redact/],
    [runner.replace("  --log-opts='--all' \\", "  --log-opts='HEAD~1..HEAD' \\"), /log-opts/],
    [
      runner.replace("sha256sum --check --status", "sha256sum --status"),
      /digests must be verified/,
    ],
  ]) {
    assert.match(secretScanningRunnerFindings(mutated, baseline).join("\n"), expected);
  }
});
