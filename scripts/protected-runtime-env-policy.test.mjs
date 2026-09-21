import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  buildProtectedRuntimeEnvironment,
  parseProtectedRuntimeEnvSource,
  validateProtectedRuntimeEnvFileStat,
} from "./protected-runtime-env-policy.mjs";

test("protected runtime env parser accepts strict dotenv and rejects control-variable injection", () => {
  const parsed = parseProtectedRuntimeEnvSource([
    "DATABASE_URL=postgres://example.invalid/db",
    "export REDIS_URL='redis://example.invalid:6379'",
    'RESEND_API_KEY="secret-value"',
  ].join("\n"));
  assert.deepEqual(parsed.keys, ["DATABASE_URL", "REDIS_URL", "RESEND_API_KEY"]);
  assert.equal(parsed.values.RESEND_API_KEY, "secret-value");

  for (const source of [
    "NODE_OPTIONS=--require=/tmp/pwn.js",
    "PATH=/tmp/bin",
    "GITHUB_TOKEN=token",
    "RUNNER_TEMP=/tmp/other",
    "TECPEY_STAGING_HEALTH_URL=https://evil.invalid/api/health",
    "TECPEY_PROMOTION_RESULT_FILE=/tmp/result",
    "TECPEY_PREFLIGHT_NPM_CI_DONE=1",
    "NPM_CONFIG_USERCONFIG=/tmp/npmrc",
  ]) {
    assert.throws(
      () => parseProtectedRuntimeEnvSource(source),
      /protected_runtime_env_reserved_key/,
      source,
    );
  }
});

test("protected runtime env parser rejects duplicate, empty and malformed values", () => {
  assert.throws(
    () => parseProtectedRuntimeEnvSource("DATABASE_URL=a\nDATABASE_URL=b"),
    /format_invalid/,
  );
  assert.throws(() => parseProtectedRuntimeEnvSource("DATABASE_URL="), /value_invalid/);
  assert.throws(() => parseProtectedRuntimeEnvSource("not-valid"), /format_invalid/);
  assert.throws(() => parseProtectedRuntimeEnvSource("# comment only"), /empty/);
});

test("protected runtime env file stat enforces owner/group and restrictive permissions", () => {
  const base = {
    isFile: () => true,
    isSymbolicLink: () => false,
    size: 100,
    mode: 0o100640,
    uid: 0,
    gid: 2000,
  };
  assert.equal(
    validateProtectedRuntimeEnvFileStat(base, { expectedUid: 1000, expectedGid: 2000 }),
    true,
  );
  assert.equal(
    validateProtectedRuntimeEnvFileStat(
      { ...base, mode: 0o100600, gid: 0 },
      { expectedUid: 1000, expectedGid: 2000 },
    ),
    true,
  );
  assert.throws(
    () => validateProtectedRuntimeEnvFileStat(
      { ...base, uid: 1234 },
      { expectedUid: 1000, expectedGid: 2000 },
    ),
    /owner_invalid/,
  );
  assert.throws(
    () => validateProtectedRuntimeEnvFileStat(
      { ...base, gid: 1234 },
      { expectedUid: 1000, expectedGid: 2000 },
    ),
    /group_read_identity_invalid/,
  );
  for (const mode of [0o100666, 0o100650, 0o100641, 0o100700]) {
    assert.throws(
      () => validateProtectedRuntimeEnvFileStat(
        { ...base, mode },
        { expectedUid: 1000, expectedGid: 2000 },
      ),
      /permissions_unsafe/,
    );
  }
});

test("protected runtime environment overrides authority selectors but not through file data", () => {
  const env = buildProtectedRuntimeEnvironment(
    { PATH: "/usr/bin", NODE_ENV: "test", TECPEY_ENV_VALIDATION_SOURCE: "auto" },
    { DATABASE_URL: "postgres://example.invalid/db" },
  );
  assert.equal(env.PATH, "/usr/bin");
  assert.equal(env.DATABASE_URL, "postgres://example.invalid/db");
  assert.equal(env.NODE_ENV, "production");
  assert.equal(env.TECPEY_ENV_VALIDATION_SOURCE, "process");
});

test("runner loads protected values only into the child process without shell evaluation", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tecpey-protected-env-"));
  try {
    const envFile = path.join(dir, "staging.env");
    writeFileSync(
      envFile,
      "DATABASE_URL=postgres://example.invalid/db\nSAFE_LITERAL=$(touch /tmp/tecpey-should-not-run)\n",
      { mode: 0o600 },
    );
    chmodSync(envFile, 0o600);
    const result = spawnSync(
      process.execPath,
      [
        "scripts/run-with-protected-runtime-env.mjs",
        envFile,
        "--",
        process.execPath,
        "-e",
        "process.stdout.write(JSON.stringify({db:process.env.DATABASE_URL,literal:process.env.SAFE_LITERAL,nodeEnv:process.env.NODE_ENV,source:process.env.TECPEY_ENV_VALIDATION_SOURCE}))",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          TECPEY_PROTECTED_ENV_EXPECTED_UID: String(process.getuid?.() ?? 0),
          TECPEY_PROTECTED_ENV_EXPECTED_GID: String(process.getgid?.() ?? 0),
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      db: "postgres://example.invalid/db",
      literal: "$(touch /tmp/tecpey-should-not-run)",
      nodeEnv: "production",
      source: "process",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
