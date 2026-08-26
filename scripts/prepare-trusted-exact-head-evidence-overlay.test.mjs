import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  candidateEvidencePath,
  prepareTrustedExactHeadEvidenceOverlay,
  trustedEvidencePath,
} from "./prepare-trusted-exact-head-evidence-overlay.mjs";

const oldEvidence =
  "docs/launch/generated/exact-head-workflow-evidence-20260812.json";
const newEvidence =
  "docs/launch/generated/exact-head-workflow-evidence-20260826.json";
const copiedPaths = [
  "docs/launch/generated/protected-staging-no-go-register-20260810.json",
  "docs/launch/generated/current-controlled-launch-candidate.json",
  "docs/launch/PROTECTED_STAGING_EVIDENCE_PACKET_20260810.md",
  "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
  "package.json",
];

async function write(root, path, value) {
  const destination = join(root, path);
  await mkdir(join(destination, ".."), { recursive: true });
  await writeFile(destination, value);
}

test("prepares candidate evidence for the immutable trusted-base checker", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "tecpey-trusted-overlay-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = join(root, "source");
  const trustedRoot = join(root, "trusted");

  await write(
    trustedRoot,
    "scripts/check-exact-head-workflow-evidence-authority.mjs",
    `const files = { evidence: "${oldEvidence}" };\n`,
  );
  await write(sourceRoot, newEvidence, "candidate-evidence\n");
  await write(
    sourceRoot,
    copiedPaths[0],
    JSON.stringify({ exactHeadWorkflowEvidence: newEvidence }),
  );
  await write(
    sourceRoot,
    copiedPaths[1],
    JSON.stringify({ activeInputs: { exactHeadWorkflowEvidence: newEvidence } }),
  );
  await write(sourceRoot, copiedPaths[2], `Evidence: ${newEvidence}\n`);
  await write(sourceRoot, copiedPaths[3], "checklist\n");
  await write(sourceRoot, copiedPaths[4], "{}\n");

  assert.deepEqual(
    await prepareTrustedExactHeadEvidenceOverlay({ sourceRoot, trustedRoot }),
    { candidatePath: newEvidence, trustedPath: oldEvidence },
  );
  assert.equal(await readFile(join(trustedRoot, oldEvidence), "utf8"), "candidate-evidence\n");
  for (const path of copiedPaths.slice(0, 3)) {
    const value = await readFile(join(trustedRoot, path), "utf8");
    assert.equal(value.includes(newEvidence), false);
    assert.equal(value.includes(oldEvidence), true);
  }
  assert.equal(await readFile(join(trustedRoot, copiedPaths[3]), "utf8"), "checklist\n");
  assert.equal(await readFile(join(trustedRoot, copiedPaths[4]), "utf8"), "{}\n");
  assert.equal(
    await readFile(
      join(trustedRoot, "scripts/check-exact-head-workflow-evidence-authority.mjs"),
      "utf8",
    ),
    `const files = { evidence: "${oldEvidence}" };\n`,
  );
});

test("rejects candidate and trusted-checker paths outside the evidence namespace", () => {
  assert.throws(
    () => candidateEvidencePath({ activeInputs: { exactHeadWorkflowEvidence: "../secret" } }),
    /must match/,
  );
  assert.throws(() => trustedEvidencePath('const files = { evidence: "../secret" }'), /must match/);
});
