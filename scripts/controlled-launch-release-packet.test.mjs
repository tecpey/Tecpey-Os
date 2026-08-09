import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const script = "scripts/generate-controlled-launch-release-packet.mjs";
const digest = `sha256:${"a".repeat(64)}`;
const deploymentDigest = `sha256:${"b".repeat(64)}`;
const runUrl = "https://github.com/tecpey/Tecpey-Os/actions/runs/123456789";

function runPacket(args = [], env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 1024 * 1024,
  });
}

test("final launch packet fails closed without required release evidence", () => {
  const result = runPacket(["--allow-dirty"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /image digest is required for a final release packet/);
});

test("launch packet rejects unknown options instead of silently omitting evidence", () => {
  const result = runPacket(["--image-digset", digest]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown launch packet option: --image-digset/);
});

test("draft launch packet can scaffold incomplete evidence explicitly", () => {
  const result = runPacket(["--draft", "--allow-dirty"]);

  assert.equal(result.status, 0, result.stderr);
  const packet = JSON.parse(result.stdout);
  assert.equal(packet.packetMode, "draft_incomplete_evidence_allowed");
  assert.equal(packet.artifactIdentity.imageDigest, null);
  assert.equal(packet.workflowEvidence.ciRunUrl, null);
});

test("final launch packet emits only after artifact and workflow evidence are complete", () => {
  const result = runPacket([
    "--allow-dirty",
    "--image-digest",
    digest,
    "--deployment-artifact-digest",
    deploymentDigest,
    "--ci-run-url",
    runUrl,
    "--repository-audit-run-url",
    runUrl,
    "--public-golden-path-run-url",
    runUrl,
    "--secret-scanning-run-url",
    runUrl,
  ]);

  assert.equal(result.status, 0, result.stderr);
  const packet = JSON.parse(result.stdout);
  assert.equal(packet.packetMode, "final_evidence_required");
  assert.equal(packet.artifactIdentity.imageDigest, digest);
  assert.equal(packet.artifactIdentity.deploymentArtifactDigest, deploymentDigest);
  assert.equal(packet.workflowEvidence.ciRunUrl, runUrl);
  assert.equal(packet.workflowEvidence.publicGoldenPathRunUrl, runUrl);
});
