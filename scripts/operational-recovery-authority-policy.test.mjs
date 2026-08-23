import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  evaluateOperationalRecoveryAuthority,
  PROTECTED_RECOVERY_TRIGGER_PATHS,
  RECOVERY_MIGRATION_TRIGGER_PATHS,
} from "./operational-recovery-authority-policy.mjs";

const files = {
  workflow: ".github/workflows/operational-recovery.yml",
  recovery: "scripts/test-container-volume-recovery.sh",
  verifier: "scripts/verify-operational-recovery-evidence.mjs",
  protectedVerifier: "scripts/verify-protected-recovery-reconciliation-evidence.mjs",
  protectedCollector: "scripts/collect-protected-recovery-reconciliation-evidence.mjs",
  protectedCollectorPolicy: "scripts/protected-recovery-reconciliation-collector-policy.mjs",
  protectedCollectorTest: "scripts/protected-recovery-reconciliation-collector-policy.test.mjs",
  protectedWorkflow: ".github/workflows/protected-staging-recovery-reconciliation-evidence.yml",
  runbook: "docs/operations/OPERATIONAL_RECOVERY_DRILLS.md",
  reconciliation: "docs/operations/RECOVERY_RECONCILIATION_CONTRACT.md",
  packageJson: "package.json",
  containerWorkflow: ".github/workflows/container-supply-chain.yml",
};
const valid = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
  ),
);
const recoveryScript = path.resolve(files.recovery);

async function runInvalidEvidencePath(t, evidenceDir, prepare) {
  const root = await mkdtemp(path.join(os.tmpdir(), "tecpey-recovery-path-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  await mkdir(bin);
  const git = path.join(bin, "git");
  await writeFile(
    git,
    "#!/bin/sh\n[ \"$1\" = rev-parse ] && [ \"$2\" = HEAD ] && printf '%s\\n' \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"\n",
  );
  await chmod(git, 0o755);
  if (prepare) await prepare(root);

  return {
    root,
    result: spawnSync("bash", [recoveryScript, "candidate-image"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        TECPEY_RECOVERY_EVIDENCE_DIR: evidenceDir,
      },
    }),
  };
}

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

test("rejects omission of protected recovery authority from pull-request triggers", () => {
  for (const protectedPath of PROTECTED_RECOVERY_TRIGGER_PATHS) {
    const workflow = valid.workflow.replace(`      - ${protectedPath}\n`, "");
    const failures = evaluateOperationalRecoveryAuthority({ ...valid, workflow });
    assert.equal(
      failures.includes(
        `scheduled workflow does not run for protected recovery authority ${protectedPath}`,
      ),
      true,
      protectedPath,
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

test("rejects weakening protected recovery reconciliation evidence verification", () => {
  const protectedVerifier = valid.protectedVerifier
    .replace("tenantPrincipalIsolation", "tenantScopeOptional")
    .replaceAll("forbidRawMaterial", "allowRawMaterial");
  const failures = evaluateOperationalRecoveryAuthority({ ...valid, protectedVerifier });
  assert.equal(
    failures.includes("protected recovery verifier is missing tenantPrincipalIsolation"),
    true,
  );
  assert.equal(
    failures.includes("protected recovery verifier is missing forbidRawMaterial"),
    true,
  );
});

test("rejects a mutable action or dependent-review bypass in protected staging recovery", () => {
  const protectedWorkflow = valid.protectedWorkflow
    .replace(
      "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
      "actions/checkout@v4",
    )
    .replace("independent_review_confirmed:", "review_optional:");
  const failures = evaluateOperationalRecoveryAuthority({ ...valid, protectedWorkflow });
  assert.equal(
    failures.includes("protected staging recovery workflow contains a mutable action reference"),
    true,
  );
  assert.equal(
    failures.includes("protected staging recovery workflow is missing independent_review_confirmed:"),
    true,
  );
});

test("rejects weakening isolated restore, source/restore comparison or privacy controls", () => {
  const protectedCollector = valid.protectedCollector
    .replace("SELECT pg_export_snapshot() AS snapshot", "SELECT now() AS snapshot")
    .replaceAll("assertSummariesMatch", "acceptUncomparedRestore")
    .replace("no-raw-rows", "raw-rows-allowed");
  const failures = evaluateOperationalRecoveryAuthority({ ...valid, protectedCollector });
  assert.equal(
    failures.includes("protected staging recovery collector is missing SELECT pg_export_snapshot() AS snapshot"),
    true,
  );
  assert.equal(
    failures.includes("protected staging recovery collector is missing assertSummariesMatch"),
    true,
  );
  assert.equal(
    failures.includes("protected staging recovery collector is missing no-raw-rows"),
    true,
  );
});

test("rejects removing tenant drift and financial conservation from collector policy", () => {
  const protectedCollectorPolicy = valid.protectedCollectorPolicy
    .replaceAll("tenant_registry_runtime_drift", "tenant_registry_drift_ignored")
    .replaceAll("assertFinancialInvariantCounts", "ignoreFinancialInvariantCounts");
  const failures = evaluateOperationalRecoveryAuthority({ ...valid, protectedCollectorPolicy });
  assert.equal(
    failures.includes("protected staging recovery collector policy is missing tenant_registry_runtime_drift"),
    true,
  );
  assert.equal(
    failures.includes("protected staging recovery collector policy is missing assertFinancialInvariantCounts"),
    true,
  );
});

test("rejects removing a launch domain from the recovery reconciliation contract", () => {
  for (const domain of [
    "Academy",
    "Trading Arena",
    "Mentor AI",
    "Exchange Ledger",
    "Notifications and operational jobs",
    "Tenant and principal isolation",
  ]) {
    const escaped = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const reconciliation = valid.reconciliation.replace(
      new RegExp(`\\| ${escaped} \\|[^\\n]+\\n`),
      "",
    );
    const failures = evaluateOperationalRecoveryAuthority({ ...valid, reconciliation });
    assert.equal(
      failures.includes(`reconciliation contract is missing ${domain}`),
      true,
      domain,
    );
  }
});

test("rejects raw-data recovery evidence or destructive restore acceptance", () => {
  const reconciliation = valid.reconciliation
    .replace("Do not store raw rows", "raw customer data may be stored")
    .replace("After every protected staging restore", "production restore is accepted");
  const failures = evaluateOperationalRecoveryAuthority({ ...valid, reconciliation });
  assert.equal(
    failures.includes(
      "reconciliation contract must not allow destructive restore or raw customer data",
    ),
    true,
  );
});

test("rejects an unbounded recursive evidence cleanup", () => {
  const recovery = valid.recovery.replace(
    "mkdir -p -- \"$CANONICAL_EVIDENCE_DIR\"",
    "rm -rf \"$CANONICAL_EVIDENCE_DIR\"\nmkdir -p -- \"$CANONICAL_EVIDENCE_DIR\"",
  );
  const failures = evaluateOperationalRecoveryAuthority({ ...valid, recovery });
  assert.equal(
    failures.includes("recovery script must not recursively delete evidence paths"),
    true,
  );
});

test("real recovery script rejects traversal before creating external evidence", async (t) => {
  const escapeName = `tecpey-recovery-escape-${process.pid}`;
  const { root, result } = await runInvalidEvidencePath(
    t,
    `artifacts/../../${escapeName}`,
  );
  const escaped = path.resolve(root, `../${escapeName}`);
  t.after(() => rm(escaped, { recursive: true, force: true }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /evidence_dir_must_be_under_artifacts/);
  assert.equal(existsSync(escaped), false);
});

test("real recovery script rejects an evidence symlink outside artifacts", async (t) => {
  const outside = await mkdtemp(path.join(os.tmpdir(), "tecpey-recovery-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const { result } = await runInvalidEvidencePath(
    t,
    "artifacts/external/evidence",
    async (root) => {
      await mkdir(path.join(root, "artifacts"));
      await symlink(outside, path.join(root, "artifacts", "external"));
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /evidence_dir_must_be_under_artifacts/);
  assert.equal(existsSync(path.join(outside, "evidence")), false);
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
