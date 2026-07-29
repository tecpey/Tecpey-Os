import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  evaluateOperationalRecoveryAuthority,
  RECOVERY_MIGRATION_TRIGGER_PATHS,
} from "./operational-recovery-authority-policy.mjs";

const files = {
  workflow: ".github/workflows/operational-recovery.yml",
  recovery: "scripts/test-container-volume-recovery.sh",
  verifier: "scripts/verify-operational-recovery-evidence.mjs",
  runbook: "docs/operations/OPERATIONAL_RECOVERY_DRILLS.md",
  packageJson: "package.json",
  containerWorkflow: ".github/workflows/container-supply-chain.yml",
};
const valid = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
  ),
);

test("accepts the governed scheduled recovery contract", () => {
  assert.deepEqual(evaluateOperationalRecoveryAuthority(valid), []);
});

test("rejects removal of the schedule and exact-head assertion", () => {
  const workflow = valid.workflow
    .replace("schedule:", "disabled_schedule:")
    .replace("git rev-parse HEAD", "git status");
  const failures = evaluateOperationalRecoveryAuthority({ ...valid, workflow });
  assert.equal(failures.some((value) => value.includes("schedule:")), true);
  assert.equal(failures.some((value) => value.includes("git rev-parse HEAD")), true);
});

test("rejects omission of every migration artifact input from pull-request triggers", () => {
  for (const migrationPath of RECOVERY_MIGRATION_TRIGGER_PATHS) {
    const workflow = valid.workflow.replace(`      - ${migrationPath}\n`, "");
    const failures = evaluateOperationalRecoveryAuthority({ ...valid, workflow });
    assert.equal(
      failures.includes(
        `scheduled workflow does not run for migration input ${migrationPath}`,
      ),
      true,
      migrationPath,
    );
  }
});

test("rejects a mutable action and a non-failing drill", () => {
  const workflow = valid.workflow
    .replace(
      "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
      "actions/checkout@v4",
    )
    .replace("timeout-minutes: 25", "timeout-minutes: 25\n    continue-on-error: true");
  const failures = evaluateOperationalRecoveryAuthority({ ...valid, workflow });
  assert.equal(failures.includes("scheduled workflow contains a mutable action reference"), true);
  assert.equal(failures.includes("recovery failures must fail closed"), true);
});

test("rejects loss of schema equivalence and RPO exclusion assertions", () => {
  const recovery = valid.recovery
    .replace('test "$SOURCE_PLAN_HASH" = "$RESTORED_PLAN_HASH"', "true")
    .replaceAll("committedAfterBackupAbsent", "lateWriteExcluded");
  const failures = evaluateOperationalRecoveryAuthority({ ...valid, recovery });
  assert.equal(failures.some((value) => value.includes("SOURCE_PLAN_HASH")), true);
  assert.equal(failures.some((value) => value.includes("committedAfterBackupAbsent")), true);
});

test("rejects weakening the measured RTO verifier", () => {
  const verifier = valid.verifier.replace(
    "recoveryDurationMs > maximumRecoverySeconds * 1000",
    "false",
  );
  const failures = evaluateOperationalRecoveryAuthority({ ...valid, verifier });
  assert.equal(failures.some((value) => value.includes("recoveryDurationMs")), true);
});

test("rejects an unbounded recursive evidence cleanup", () => {
  const recovery = valid.recovery.replace(
    "mkdir -p \"$EVIDENCE_DIR\"",
    "rm -rf \"$EVIDENCE_DIR\"\nmkdir -p \"$EVIDENCE_DIR\"",
  );
  const failures = evaluateOperationalRecoveryAuthority({ ...valid, recovery });
  assert.equal(
    failures.includes("recovery script must not recursively delete evidence paths"),
    true,
  );
});

test("rejects reserved GitHub SHA override and loss of checkout binding", () => {
  const workflow = valid.workflow.replace(
    "TECPEY_RECOVERY_SOURCE_SHA:",
    "GITHUB_SHA:",
  );
  const recovery = valid.recovery.replace(
    'SOURCE_SHA="$(git rev-parse HEAD)"',
    'SOURCE_SHA="${GITHUB_SHA}"',
  );
  const failures = evaluateOperationalRecoveryAuthority({ ...valid, workflow, recovery });
  assert.equal(
    failures.includes("reserved GitHub environment variables must not be overridden"),
    true,
  );
  assert.equal(failures.some((value) => value.includes("SOURCE_SHA")), true);
});
