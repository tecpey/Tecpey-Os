import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, it } from "node:test";

const roots: string[] = [];
const installer = path.resolve("scripts/install-community-challenge-scheduler.sh");

async function executable(filePath: string, content = "#!/bin/sh\nexit 0\n") {
  await writeFile(filePath, content, { mode: 0o755 });
  await chmod(filePath, 0o755);
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "tecpey-scheduler-installer-"));
  roots.push(root);
  const app = path.join(root, "app");
  const bin = path.join(root, "bin");
  const envFile = path.join(root, "runtime.env");
  const state = path.join(root, "state");
  const systemd = path.join(root, "systemd");
  await mkdir(app);
  await mkdir(bin);
  await writeFile(path.join(app, "package.json"), "{}\n", { mode: 0o644 });
  await writeFile(
    envFile,
    [
      "DATABASE_URL=postgres://database.internal/tecpey",
      "TECPEY_OPS_ALERT_WEBHOOK_URL=https://alerts.tecpey.test/hooks/ops",
      "TECPEY_OPS_ALERT_BEARER_TOKEN=test-token",
      "",
    ].join("\n"),
    { mode: 0o640 },
  );
  await executable(path.join(bin, "npm"));
  await executable(path.join(bin, "id"));
  await executable(path.join(bin, "getent"));
  await executable(path.join(bin, "systemd-analyze"));
  return { root, app, bin, envFile, state, systemd };
}

function runInstall(
  setup: Awaited<ReturnType<typeof fixture>>,
  overrides: Record<string, string> = {},
) {
  return spawnSync("bash", [installer], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${setup.bin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
      TECPEY_DRY_RUN: "1",
      TECPEY_APP_DIR: setup.app,
      TECPEY_RUN_USER: "tecpeytest",
      TECPEY_RUN_GROUP: "tecpeytest",
      TECPEY_ENV_FILE: setup.envFile,
      TECPEY_OPS_STATE_DIR: setup.state,
      TECPEY_SYSTEMD_DIR: setup.systemd,
      TECPEY_NPM_BIN: path.join(setup.bin, "npm"),
      ...overrides,
    },
  });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Community challenge scheduler installer", () => {
  it("renders and verifies all units in dry-run without mutating destinations", async () => {
    const setup = await fixture();
    const result = runInstall(setup);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /dry_run=1/);
    assert.match(result.stdout, /unit_verification=passed/);
    assert.equal(result.stdout.includes("test-token"), false);
    assert.equal(result.stdout.includes("postgres://"), false);
  });

  it("rejects root runtime identity and relative paths", async () => {
    const setup = await fixture();
    const rootUser = runInstall(setup, { TECPEY_RUN_USER: "root" });
    assert.notEqual(rootUser.status, 0);
    assert.match(rootUser.stderr, /runtime_user_root_forbidden/);
    const relative = runInstall(setup, { TECPEY_APP_DIR: "relative/app" });
    assert.notEqual(relative.status, 0);
    assert.match(relative.stderr, /app_directory_invalid/);
  });

  it("rejects a missing HTTPS alert webhook", async () => {
    const setup = await fixture();
    await writeFile(
      setup.envFile,
      "DATABASE_URL=postgres://database.internal/tecpey\n",
      { mode: 0o640 },
    );
    const result = runInstall(setup);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ops_alert_https_webhook_missing/);
  });

  it("rejects world-readable and symlinked environment files", async () => {
    const setup = await fixture();
    await chmod(setup.envFile, 0o644);
    const exposed = runInstall(setup);
    assert.notEqual(exposed.status, 0);
    assert.match(exposed.stderr, /environment_file_world_access_forbidden/);
  });
});
