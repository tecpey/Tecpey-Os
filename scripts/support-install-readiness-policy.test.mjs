import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertSupportInstallReadiness,
  supportInstallReadinessFindings,
} from "./support-install-readiness-policy.mjs";

const sources = {
  packageJson: fs.readFileSync("package.json", "utf8"),
  bundleCreator: fs.readFileSync("scripts/create-support-deployment-bundle.sh", "utf8"),
  bundleVerifier: fs.readFileSync("scripts/verify-support-deployment-bundle.mjs", "utf8"),
  rehearsal: fs.readFileSync("scripts/rehearse-support-deployment-install.mjs", "utf8"),
  readinessContract: fs.readFileSync(
    "docs/operations/SUPPORT_INSTALL_READINESS_CONTRACT.md",
    "utf8",
  ),
  handoff: fs.readFileSync("docs/operations/SUPPORT_TEAM_DEPLOYMENT_HANDOFF.md", "utf8"),
  workflow: fs.readFileSync(".github/workflows/support-deployment-bundle.yml", "utf8"),
};

test("support install readiness authority accepts the governed package flow", () => {
  assert.doesNotThrow(() => assertSupportInstallReadiness(sources));
});

test("policy rejects a bundle workflow that uploads before clean-room rehearsal", () => {
  const mutated = {
    ...sources,
    workflow: sources.workflow.replace(
      "Rehearse support install package",
      "Package rehearsal omitted",
    ),
  };
  assert.match(
    supportInstallReadinessFindings(mutated).join("\n"),
    /support workflow must rehearse the package before writing and uploading the artifact/,
  );
});

test("policy rejects rehearsal that executes bundled install commands", () => {
  const mutated = {
    ...sources,
    rehearsal: `${sources.rehearsal}\nexecFileSync("bash", ["scripts/ubuntu24-preflight.sh", "candidate"]);\n`,
  };
  assert.match(
    supportInstallReadinessFindings(mutated).join("\n"),
    /must not execute bundled shell scripts/,
  );
});

test("policy rejects handoff that skips candidate migration before runtime", () => {
  const mutated = {
    ...sources,
    handoff: sources.handoff.replace("bash scripts/ubuntu24-preflight.sh migrate", ""),
  };
  assert.match(
    supportInstallReadinessFindings(mutated).join("\n"),
    /support handoff must order rehearsal before recipient checksum, unpack, candidate, migration and runtime checks/,
  );
});
