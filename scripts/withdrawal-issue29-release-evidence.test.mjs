import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { evaluateWithdrawalIssue29ReleaseEvidence } from "./check-withdrawal-issue29-release-evidence.mjs";

const files = {
  report: "docs/launch/WITHDRAWAL_RELEASE_EVIDENCE_ISSUE_29_20260820.md",
  inventory: "docs/security/WITHDRAWAL_EXTERNAL_EFFECT_EVIDENCE_INVENTORY.md",
  walletGuard: "scripts/check-wallet-authority.mjs",
  externalEffectGuard: "scripts/check-withdrawal-external-effect-evidence.mjs",
  custodyGate: "scripts/check-wallet-custody-launch-gate.mjs",
  runtimeGuard: "scripts/check-withdrawal-runtime-authority.mjs",
  packageJson: "package.json",
  ciWorkflow: ".github/workflows/ci.yml",
};

const valid = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
  ),
);

test("accepts the governed issue #29 release-evidence boundary", () => {
  assert.deepEqual(evaluateWithdrawalIssue29ReleaseEvidence(valid), []);
});

test("rejects issue closure or custody approval claims", () => {
  const report = valid.report
    .replace("It does not close #29.", "Issue #29 is closed.")
    .replace(
      "This readiness record does not approve real-money withdrawals",
      "real-money withdrawals approved",
    );
  const failures = evaluateWithdrawalIssue29ReleaseEvidence({ ...valid, report });
  assert.equal(
    failures.includes(
      "report must not claim issue closure, custody approval, real-money approval, signer approval, or GO",
    ),
    true,
  );
});

test("rejects removing the protected-staging and custody evidence families", () => {
  const report = valid.report
    .replace("| Testnet runtime evidence | No real chain execution claim | Testnet withdrawal Golden Path for every enabled chain |\n", "")
    .replace("| HSM/MPC custody | Production custody gate blocks real withdrawals | Implemented signer, key rotation, recovery, and fallback-impossible evidence |\n", "")
    .replace("| Staging Golden Path | Repository CI and focused integration tests | Protected staging end-to-end withdrawal Golden Path |\n", "");
  const failures = evaluateWithdrawalIssue29ReleaseEvidence({ ...valid, report });
  assert.equal(failures.includes("report is missing evidence family Testnet runtime evidence"), true);
  assert.equal(failures.includes("report is missing evidence family HSM/MPC custody"), true);
  assert.equal(failures.includes("report is missing evidence family Staging Golden Path"), true);
});

test("rejects disconnecting the issue #29 guard from CI and release checks", () => {
  const packageJson = valid.packageJson
    .replace('    "withdrawal:issue29:evidence:check": "node scripts/check-withdrawal-issue29-release-evidence.mjs",\n', "")
    .replace('    "test:withdrawal-issue29-evidence": "node --test scripts/withdrawal-issue29-release-evidence.test.mjs",\n', "")
    .replace(" && npm run withdrawal:issue29:evidence:check", "")
    .replace(" && npm run test:withdrawal-issue29-evidence", "");
  const ciWorkflow = valid.ciWorkflow
    .replace("Withdrawal issue #29 release evidence guard", "")
    .replace("npm run withdrawal:issue29:evidence:check", "")
    .replace("npm run test:withdrawal-issue29-evidence", "");
  const failures = evaluateWithdrawalIssue29ReleaseEvidence({
    ...valid,
    packageJson,
    ciWorkflow,
  });
  assert.equal(
    failures.includes(
      'package.json is missing "withdrawal:issue29:evidence:check": "node scripts/check-withdrawal-issue29-release-evidence.mjs"',
    ),
    true,
  );
  assert.equal(
    failures.includes("CI workflow is missing Withdrawal issue #29 release evidence guard"),
    true,
  );
});
