import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, test } from "node:test";

const roots: string[] = [];
const installer = path.resolve("scripts/install-mentor-profile-worker.sh");

async function executable(filePath: string, body = "#!/bin/sh\nexit 0\n") {
  await writeFile(filePath, body, { mode: 0o755 });
  await chmod(filePath, 0o755);
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "tecpey-mentor-installer-"));
  roots.push(root);
  const app = path.join(root, "app");
  const bin = path.join(root, "bin");
  const envFile = path.join(root, "runtime.env");
  const state = path.join(root, "state");
  const systemd = path.join(root, "systemd");
  await mkdir(app);
  await mkdir(bin);
  await mkdir(path.join(app, "dist"));
  await writeFile(path.join(app, "package.json"), "{}\n", { mode: 0o644 });
  for (const name of [
    "run-mentor-profile-worker.cjs",
    "check-mentor-profile-health.cjs",
    "deliver-operational-alerts.cjs",
    "check-operational-alert-delivery-env.cjs",
  ]) {
    await writeFile(
      path.join(app, "dist", name),
      "module.exports = {};\n",
      { mode: 0o644 },
    );
  }
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
  for (const name of ["npm", "id", "getent", "systemd-analyze"]) {
    await executable(path.join(bin, name));
  }
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
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    ),
  );
});

test("Mentor installer verifies worker, watchdog and durable alert rail in dry-run", async () => {
  const setup = await fixture();
  const result = runInstall(setup);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /unit_verification=passed/);
  assert.match(result.stdout, /health_watchdog=verified/);
  assert.match(result.stdout, /durable_alert_delivery=verified/);
  assert.match(result.stdout, /state_directory=/);
  assert.doesNotMatch(result.stdout, /test-token|postgres:\/\//);
});

test("Mentor installer fails closed without approved HTTPS ops webhook", async () => {
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

test("Mentor installer rejects missing production alert bundle", async () => {
  const setup = await fixture();
  await rm(path.join(setup.app, "dist", "deliver-operational-alerts.cjs"));
  const result = runInstall(setup);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /operational_alert_delivery_bundle_missing/);
});

test("Mentor installer rejects symlinked state directory", async () => {
  const setup = await fixture();
  const target = path.join(setup.root, "state-target");
  const link = path.join(setup.root, "state-link");
  await mkdir(target);
  await symlink(target, link);
  const result = runInstall(setup, { TECPEY_OPS_STATE_DIR: link });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /state_directory_symlink_forbidden/);
});
