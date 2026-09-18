import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, it } from "node:test";

const roots: string[] = [];
const installer = path.resolve("scripts/install-mentor-profile-worker.sh");

async function executable(
  filePath: string,
  content = "#!/bin/sh\nexit 0\n",
): Promise<void> {
  await writeFile(filePath, content, { mode: 0o755 });
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
  const npmTrace = path.join(root, "npm.trace");

  await mkdir(app);
  await mkdir(path.join(app, "dist"));
  await mkdir(bin);
  await writeFile(path.join(app, "package.json"), "{}\n", { mode: 0o644 });
  for (const name of [
    "run-mentor-profile-worker.cjs",
    "check-mentor-profile-health.cjs",
    "deliver-operational-alerts.cjs",
    "check-operational-delivery-env.cjs",
    "check-operational-installer-env.cjs",
  ]) {
    await writeFile(path.join(app, "dist", name), "// test bundle\n", {
      mode: 0o644,
    });
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
  await executable(
    path.join(bin, "npm"),
    [
      "#!/bin/sh",
      "if [ \"$1\" = \"run\" ] && [ \"$2\" = \"--silent\" ] && [ \"$3\" = \"ops:installer:env-check\" ]; then",
      "  [ -n \"$TECPEY_NPM_TRACE\" ] && printf '%s\\n' 'ops:installer:env-check' >> \"$TECPEY_NPM_TRACE\"",
      "  [ \"${TECPEY_TEST_INSTALL_ENV_CHECK_FAIL:-0}\" = \"1\" ] && exit 42",
      "fi",
      "exit 0",
      "",
    ].join("\\n"),
  );
  await executable(path.join(bin, "id"));
  await executable(path.join(bin, "getent"));
  await executable(path.join(bin, "systemd-analyze"));

  return { root, app, bin, envFile, state, systemd, npmTrace };
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
      TECPEY_NPM_TRACE: setup.npmTrace,
      ...overrides,
    },
  });
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })),
  );
});

describe("Mentor profile operational installer", () => {
  it("verifies worker, watchdog and durable delivery units in dry-run", async () => {
    const setup = await fixture();
    const result = runInstall(setup);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /unit_verification=passed/);
    assert.match(result.stdout, /health_watchdog=verified/);
    assert.match(result.stdout, /durable_signal_delivery=verified/);
    assert.match(result.stdout, /state_directory=/);
    assert.equal(result.stdout.includes("test-token"), false);
    assert.equal(result.stdout.includes("postgres://"), false);
  });

  it("fails closed when any operational runtime bundle is missing", async () => {
    const setup = await fixture();
    await rm(path.join(setup.app, "dist", "check-operational-delivery-env.cjs"));
    const result = runInstall(setup);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /mentor_operational_bundle_missing/);
  });

  it("rejects root identity, unsafe state path and state symlink", async () => {
    const setup = await fixture();

    const rootUser = runInstall(setup, { TECPEY_RUN_USER: "root" });
    assert.notEqual(rootUser.status, 0);
    assert.match(rootUser.stderr, /runtime_user_root_forbidden/);

    const relative = runInstall(setup, { TECPEY_OPS_STATE_DIR: "relative/state" });
    assert.notEqual(relative.status, 0);
    assert.match(relative.stderr, /state_directory_invalid/);

    const target = path.join(setup.root, "state-target");
    await mkdir(target);
    const link = path.join(setup.root, "state-link");
    await symlink(target, link);
    const symlinked = runInstall(setup, { TECPEY_OPS_STATE_DIR: link });
    assert.notEqual(symlinked.status, 0);
    assert.match(symlinked.stderr, /state_directory_symlink_forbidden/);
  });

  it("delegates env-file semantics to the bundled governed preflight", async () => {
    const setup = await fixture();
    await writeFile(
      setup.envFile,
      [
        "DATABASE_URL=\'postgresql://tecpey:secret@database.internal/tecpey\'",
        "TECPEY_OPS_ALERT_WEBHOOK_URL=\"https://alerts.tecpey.test/hooks/ops\"",
        "LIMOO_SMS_OTP_COPY=\'تک‌پی؛ رمز ورود شما: {0}\'",
        "",
      ].join("\\n"),
      { mode: 0o640 },
    );
    const accepted = runInstall(setup);
    assert.equal(accepted.status, 0, `${accepted.stdout}\n${accepted.stderr}`);
    assert.match(await readFile(setup.npmTrace, "utf8"), /ops:installer:env-check/);
    assert.equal(accepted.stdout.includes("secret"), false);
    assert.equal(accepted.stdout.includes("رمز"), false);

    const rejected = runInstall(setup, {
      TECPEY_TEST_INSTALL_ENV_CHECK_FAIL: "1",
    });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /operational_install_environment_invalid/);
  });

  it("rejects world-readable or symlinked environment authority", async () => {
    const setup = await fixture();
    await chmod(setup.envFile, 0o644);
    const exposed = runInstall(setup);
    assert.notEqual(exposed.status, 0);
    assert.match(
      exposed.stderr,
      /environment_file_world_access_forbidden/,
    );

    await chmod(setup.envFile, 0o640);
    const link = path.join(setup.root, "runtime-link.env");
    await symlink(setup.envFile, link);
    const linked = runInstall(setup, { TECPEY_ENV_FILE: link });
    assert.notEqual(linked.status, 0);
    assert.match(linked.stderr, /environment_file_unsafe/);
  });
});
