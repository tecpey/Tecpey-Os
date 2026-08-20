import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { evaluateOperationalRedteamReadiness } from "./check-operational-redteam-drill-readiness.mjs";

const files = {
  readiness: "docs/launch/OPERATIONAL_REDTEAM_READINESS_ISSUE_110_20260820.md",
  recoveryRunbook: "docs/operations/OPERATIONAL_RECOVERY_DRILLS.md",
  recoveryContract: "docs/operations/RECOVERY_RECONCILIATION_CONTRACT.md",
  incidentContract: "docs/operations/INCIDENT_READINESS_CONTRACT.md",
  recoveryWorkflow: ".github/workflows/operational-recovery.yml",
  ciWorkflow: ".github/workflows/ci.yml",
  packageJson: "package.json",
};

const valid = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
  ),
);

test("accepts the governed issue #110 readiness boundary", () => {
  assert.deepEqual(evaluateOperationalRedteamReadiness(valid), []);
});

test("rejects a readiness report that claims closure or launch readiness", () => {
  const readiness = valid.readiness
    .replace("It does not close #110.", "Issue #110 is closed.")
    .replace("This readiness record does not approve public launch", "GO approved");
  const failures = evaluateOperationalRedteamReadiness({ ...valid, readiness });
  assert.equal(
    failures.includes(
      "readiness report must not claim #110 closure, GO, production readiness, or real-money readiness",
    ),
    true,
  );
});

test("rejects removing a required drill family", () => {
  const readiness = valid.readiness.replace(
    "| Provider timeout, malformed response, webhook disorder | Domain-specific fail-closed tests and incident contract | Provider or sandbox drill with signed replay/reconciliation evidence |\n",
    "",
  );
  const failures = evaluateOperationalRedteamReadiness({ ...valid, readiness });
  assert.equal(
    failures.includes(
      "readiness report is missing Provider timeout, malformed response, webhook disorder",
    ),
    true,
  );
});

test("rejects disconnecting the readiness guard from CI and release checks", () => {
  const ciWorkflow = valid.ciWorkflow.replace("Operational Red Team drill readiness guard", "");
  const packageJson = valid.packageJson
    .replace('"ops:redteam:readiness:check": "node scripts/check-operational-redteam-drill-readiness.mjs",\n', "")
    .replace(" && npm run ops:redteam:readiness:check", "");
  const failures = evaluateOperationalRedteamReadiness({
    ...valid,
    ciWorkflow,
    packageJson,
  });
  assert.equal(
    failures.includes("CI must run the operational Red Team readiness guard"),
    true,
  );
  assert.equal(
    failures.includes("package scripts must expose ops:redteam:readiness:check"),
    true,
  );
  assert.equal(
    failures.includes("release:check must include ops:redteam:readiness:check"),
    true,
  );
});

