import assert from "node:assert/strict";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  collectCommunityChallengeHostEvidence,
  type CommunityChallengeHostCollectorDependencies,
  type CommunityChallengeHostCollectorOptions,
} from "../../lib/ops/community-challenge-host-collector";
import { verifyCommunityChallengeHostEvidence } from "../../lib/ops/community-challenge-host-evidence";

const SHA = "a".repeat(40);
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "tecpey-host-evidence-"));
  roots.push(root);
  const sourceDirectory = path.join(root, "source");
  const applicationDirectory = path.join(root, "application");
  const environmentFile = path.join(root, "runtime.env");
  const stateDirectory = path.join(root, "state");
  const systemdDirectory = path.join(root, "systemd");
  const npmBinary = path.join(root, "npm");
  for (const directory of [sourceDirectory, applicationDirectory, systemdDirectory]) {
    await mkdir(directory, { mode: 0o755 });
  }
  await mkdir(path.join(sourceDirectory, "deploy", "systemd"), {
    recursive: true,
    mode: 0o755,
  });
  await mkdir(path.join(stateDirectory, "alerts", "pending"), {
    recursive: true,
    mode: 0o700,
  });
  await mkdir(path.join(stateDirectory, "alerts", "delivered"), {
    recursive: true,
    mode: 0o700,
  });
  await mkdir(path.join(stateDirectory, "alerts", "quarantine"), {
    recursive: true,
    mode: 0o700,
  });
  await chmod(stateDirectory, 0o700);
  await writeFile(environmentFile, "DATABASE_URL=redacted\n", { mode: 0o640 });
  await writeFile(npmBinary, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

  const serviceTemplate = [
    "[Service]",
    "User=@@RUN_USER@@",
    "Group=@@RUN_GROUP@@",
    "WorkingDirectory=@@APP_DIR@@",
    "EnvironmentFile=@@ENV_FILE@@",
    "Environment=TECPEY_OPS_STATE_DIR=@@STATE_DIR@@",
    "ExecStart=@@NPM_BIN@@ run example",
    "",
  ].join("\n");
  const timerTemplate = [
    "[Timer]",
    "OnCalendar=*-*-* *:05:00 UTC",
    "Persistent=true",
    "",
  ].join("\n");
  const render = (value: string) => value
    .replaceAll("@@RUN_USER@@", "tecpey")
    .replaceAll("@@RUN_GROUP@@", "tecpey")
    .replaceAll("@@APP_DIR@@", applicationDirectory)
    .replaceAll("@@ENV_FILE@@", environmentFile)
    .replaceAll("@@STATE_DIR@@", stateDirectory)
    .replaceAll("@@NPM_BIN@@", npmBinary);
  const units = {
    "tecpey-community-challenge-finalizer.service": render(serviceTemplate),
    "tecpey-community-challenge-finalizer.timer": timerTemplate,
    "tecpey-ops-alert-delivery.service": render(serviceTemplate),
    "tecpey-ops-alert-delivery.timer": timerTemplate,
  };
  await writeFile(
    path.join(sourceDirectory, "deploy/systemd/tecpey-community-challenge-finalizer.service.in"),
    serviceTemplate,
  );
  await writeFile(
    path.join(sourceDirectory, "deploy/systemd/tecpey-community-challenge-finalizer.timer"),
    timerTemplate,
  );
  await writeFile(
    path.join(sourceDirectory, "deploy/systemd/tecpey-ops-alert-delivery.service.in"),
    serviceTemplate,
  );
  await writeFile(
    path.join(sourceDirectory, "deploy/systemd/tecpey-ops-alert-delivery.timer"),
    timerTemplate,
  );
  for (const [name, content] of Object.entries(units)) {
    await writeFile(path.join(systemdDirectory, name), content, { mode: 0o644 });
  }

  const options: CommunityChallengeHostCollectorOptions = {
    environment: "staging",
    expectedReleaseSha: SHA,
    sourceDirectory,
    applicationDirectory,
    environmentFile,
    stateDirectory,
    systemdDirectory,
    npmBinary,
    expectedUser: "tecpey",
    expectedGroup: "tecpey",
    healthUrl: "https://staging.tecpey.test/api/health",
    hostFingerprintKey: "k".repeat(64),
    runAlertProbe: false,
  };
  let clock = 0;
  const deps: CommunityChallengeHostCollectorDependencies = {
    lstat,
    readFile: (filePath) => readFile(filePath, "utf8"),
    readdir: (directory) => readdir(directory, { withFileTypes: true }),
    runCommand: async (command, args) => {
      if (command === "git" && args.includes("rev-parse")) return `${SHA}\n`;
      if (command === "git" && args.includes("status")) return "";
      if (command === "id" && args[0] === "-un") return "tecpey\n";
      if (command === "id" && args[0] === "-gn") return "tecpey\n";
      if (command === "systemctl" && args[0] === "show") {
        const unit = args[1];
        const timer = unit.endsWith(".timer");
        return [
          "LoadState=loaded",
          `ActiveState=${timer ? "active" : "inactive"}`,
          `SubState=${timer ? "waiting" : "dead"}`,
          `UnitFileState=${timer ? "enabled" : "static"}`,
          `NextElapseUSecRealtime=${timer ? "Tue 2026-07-21 11:05:00 UTC" : ""}`,
          `LastTriggerUSec=${timer ? "Tue 2026-07-21 10:05:00 UTC" : ""}`,
          "",
        ].join("\n");
      }
      throw new Error("unexpected_command");
    },
    fetchHealth: async () => ({
      status: 200,
      body: JSON.stringify({
        ok: true,
        health: "ok",
        service: "tecpey-web",
        environment: "production",
        checks: { database: "ok", redis: "ok" },
        build: { commit: SHA },
        migrations: { status: "tracked", applied: 50 },
      }),
    }),
    readDatabaseEvidence: async () => ({
      migration0050Applied: true,
      latestRun: {
        runId: RUN_ID,
        resultStatus: "succeeded",
        startedAt: "2026-07-21T10:05:00.000Z",
        completedAt: "2026-07-21T10:05:01.000Z",
        batchesProcessed: 1,
        selectedCount: 0,
        finalizedCompletedCount: 0,
        finalizedNotCompletedCount: 0,
        failureCount: 0,
        drainLimitReached: false,
      },
    }),
    runAlertProbe: async () => {
      throw new Error("probe_not_expected");
    },
    now: () => new Date(clock++ === 0
      ? "2026-07-21T10:09:00.000Z"
      : "2026-07-21T10:10:00.000Z"),
    hostname: () => "staging-host-01",
  };
  return { root, options, deps, units };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

describe("Community challenge host evidence collector", () => {
  it("accepts 0755 public paths while enforcing private sensitive paths", async () => {
    const test = await fixture();
    const evidence = await collectCommunityChallengeHostEvidence(test.options, test.deps);
    assert.equal(evidence.runtime.environmentFile.mode, "0640");
    assert.equal(evidence.runtime.stateDirectory.mode, "0700");
    assert.equal(evidence.systemd.finalizerTimer.matchesExpected, true);
    assert.equal(evidence.hostFingerprint.includes("staging-host-01"), false);
    const result = verifyCommunityChallengeHostEvidence(evidence, {
      expectedEnvironment: "staging",
      expectedReleaseSha: SHA,
      now: new Date("2026-07-21T10:10:00.000Z"),
    });
    assert.equal(result.ok, true);
  });

  it("rejects production collection without explicit acknowledgement", async () => {
    const test = await fixture();
    await assert.rejects(
      collectCommunityChallengeHostEvidence({
        ...test.options,
        environment: "production",
      }, test.deps),
      /host_evidence_production_ack_required/,
    );
  });

  it("rejects symlinked and world-readable environment files", async () => {
    const test = await fixture();
    const target = path.join(test.root, "target.env");
    await writeFile(target, "DATABASE_URL=redacted\n", { mode: 0o640 });
    const linked = path.join(test.root, "linked.env");
    await symlink(target, linked);
    await assert.rejects(
      collectCommunityChallengeHostEvidence({
        ...test.options,
        environmentFile: linked,
      }, test.deps),
      /host_evidence_environment_file_symlink/,
    );

    await chmod(test.options.environmentFile, 0o644);
    await assert.rejects(
      collectCommunityChallengeHostEvidence(test.options, test.deps),
      /host_evidence_environment_file_permissions/,
    );
  });

  it("detects installed unit drift and a dirty application checkout", async () => {
    const drift = await fixture();
    await writeFile(
      path.join(drift.options.systemdDirectory, "tecpey-community-challenge-finalizer.timer"),
      "[Timer]\nOnCalendar=daily\n",
    );
    const evidence = await collectCommunityChallengeHostEvidence(drift.options, drift.deps);
    assert.equal(evidence.systemd.finalizerTimer.matchesExpected, false);
    assert.throws(
      () => verifyCommunityChallengeHostEvidence(evidence, {
        expectedEnvironment: "staging",
        expectedReleaseSha: SHA,
        now: new Date("2026-07-21T10:10:00.000Z"),
      }),
      /host_evidence_finalizer_timer_invalid/,
    );

    const dirty = await fixture();
    const original = dirty.deps.runCommand;
    dirty.deps.runCommand = async (command, args, timeout) => {
      if (command === "git" && args.includes("status") && args[2] === dirty.options.applicationDirectory) {
        return " M package.json\n";
      }
      return original(command, args, timeout);
    };
    await assert.rejects(
      collectCommunityChallengeHostEvidence(dirty.options, dirty.deps),
      /host_evidence_application_worktree_dirty/,
    );
  });

  it("rejects missing migration and unsafe remote health transport", async () => {
    const missingMigration = await fixture();
    missingMigration.deps.readDatabaseEvidence = async () => ({
      migration0050Applied: false,
      latestRun: null,
    });
    await assert.rejects(
      collectCommunityChallengeHostEvidence(
        missingMigration.options,
        missingMigration.deps,
      ),
      /host_evidence_migration_0050_missing/,
    );

    const insecure = await fixture();
    await assert.rejects(
      collectCommunityChallengeHostEvidence({
        ...insecure.options,
        healthUrl: "http://staging.tecpey.test/api/health",
      }, insecure.deps),
      /host_evidence_health_https_required/,
    );
  });
});
