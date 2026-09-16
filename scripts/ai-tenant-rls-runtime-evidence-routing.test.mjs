import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  ".github/workflows/ai-tenant-rls-runtime-evidence.yml",
  "utf8",
);

const protectedBranch = "codex/ai-tenant-rls-v1";

test("protected evidence is generic to same-repository PR heads targeting main", () => {
  assert.match(workflow, /github\.event\.pull_request\.base\.ref == 'main'/u);
  assert.match(
    workflow,
    /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/u,
  );
  assert.doesNotMatch(workflow, /github\.event\.pull_request\.head\.ref ==/u);
  assert.doesNotMatch(workflow, new RegExp(protectedBranch, "u"));
});

test("exact source identity remains fail-closed", () => {
  assert.match(workflow, /EXPECTED_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/u);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$EXPECTED_SHA"/u);
  assert.match(workflow, /git rev-parse 'HEAD\^\{tree\}'/u);
  assert.match(workflow, /EXPECTED_HEAD_REPOSITORY: tecpey\/Tecpey-Os/u);
});

test("protected evidence security controls remain mandatory", () => {
  for (const marker of [
    "environment: ai-tenant-rls-evidence",
    "id-token: write",
    "attestations: write",
    "postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777",
    "Execute zero-skip PostgreSQL adversarial suite",
    "Verify detached digest and evidence policy",
    "Attest exact evidence subject",
    "if-no-files-found: error",
  ]) {
    assert.ok(workflow.includes(marker), `missing mandatory marker: ${marker}`);
  }

  for (const forbidden of [
    "pull_request_target:",
    "continue-on-error:",
    "secrets.DATABASE_URL",
    "secrets.TECPEY_AI_CONTEXT_HMAC_KEY_B64",
  ]) {
    assert.ok(!workflow.includes(forbidden), `forbidden authority: ${forbidden}`);
  }
});
