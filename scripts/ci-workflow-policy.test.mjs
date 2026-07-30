import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertCiWorkflowPolicy,
  ciWorkflowPolicyFindings,
  GOVERNED_CI_WORKFLOWS,
} from "./ci-workflow-policy.mjs";

const sources = Object.fromEntries(
  Object.keys(GOVERNED_CI_WORKFLOWS).map((path) => [path, fs.readFileSync(path, "utf8")]),
);

function mutate(path, search, replacement) {
  assert.ok(sources[path].includes(search), `fixture source must contain ${search}`);
  return {
    ...sources,
    [path]: sources[path].replace(search, replacement),
  };
}

test("governed CI workflows are exact-head, bounded, read-only and action-pinned", () => {
  assert.doesNotThrow(() => assertCiWorkflowPolicy(sources));
});

test("policy rejects pull-request artifacts labeled with the synthetic merge SHA", () => {
  for (const [path, artifactPrefix] of [
    [".github/workflows/api-security-manifest.yml", "api-security-manifest-diagnostics-"],
    [".github/workflows/ci.yml", "repository-hygiene-"],
    [".github/workflows/full-suite-diagnostics.yml", "full-suite-diagnostics-"],
    [".github/workflows/sensitive-mutation-audit.yml", "sensitive-mutation-audit-diagnostics-"],
  ]) {
    const changed = mutate(
      path,
      `${artifactPrefix}\${{ github.event.pull_request.head.sha || github.sha }}`,
      `${artifactPrefix}\${{ github.sha }}`,
    );
    assert.match(ciWorkflowPolicyFindings(changed).join("\n"), /artifact .* exact evidence SHA/);
  }
});

test("policy rejects comment-spoofed artifact identity", () => {
  const path = ".github/workflows/full-suite-diagnostics.yml";
  const changed = mutate(
    path,
    "          name: full-suite-diagnostics-${{ github.event.pull_request.head.sha || github.sha }}",
    "          name: full-suite-diagnostics-${{ github.sha }} # ${{ github.event.pull_request.head.sha || github.sha }}",
  );
  assert.match(ciWorkflowPolicyFindings(changed).join("\n"), /artifact .* exact evidence SHA/);
});

test("policy rejects missing or expanded job timeouts", () => {
  for (const [search, replacement] of [
    ["    timeout-minutes: 10\n", ""],
    ["    timeout-minutes: 60\n", "    timeout-minutes: 360\n"],
  ]) {
    const changed = mutate(".github/workflows/ci.yml", search, replacement);
    assert.match(ciWorkflowPolicyFindings(changed).join("\n"), /exact bounded timeout/);
  }
});

test("policy rejects missing npm runtime verification", () => {
  const path = ".github/workflows/full-suite-diagnostics.yml";
  const changed = mutate(
    path,
    `      - name: Verify npm version
        run: test "$(npm --version | cut -d. -f1)" = "10"

`,
    "",
  );
  assert.match(ciWorkflowPolicyFindings(changed).join("\n"), /npm 10 runtime verification/);
});

test("policy rejects a staging release older than the approved authority baseline", () => {
  const path = ".github/workflows/staging-community-challenge-scheduler-evidence.yml";
  const changed = mutate(
    path,
    '          git merge-base --is-ancestor "$MINIMUM_RELEASE_SHA" "$RELEASE_SHA"\n',
    "",
  );
  assert.match(ciWorkflowPolicyFindings(changed).join("\n"), /at or after the approved baseline/);
});

test("policy rejects mutable actions and permission expansion", () => {
  for (const changed of [
    mutate(
      ".github/workflows/api-security-manifest.yml",
      "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
      "actions/checkout@v4",
    ),
    mutate(
      ".github/workflows/sensitive-mutation-audit.yml",
      "permissions:\n  contents: read",
      "permissions:\n  contents: write",
    ),
  ]) {
    assert.match(
      ciWorkflowPolicyFindings(changed).join("\n"),
      /not pinned|permissions must be exactly/,
    );
  }
});
