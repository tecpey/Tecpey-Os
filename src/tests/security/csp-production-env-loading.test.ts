import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const repositoryRoot = process.cwd();
const tsxImport = createRequire(import.meta.url).resolve("tsx");

function productionChildEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
  };
  for (const name of [
    "NEXT_PUBLIC_API_BACKEND_URL",
    "NEXT_PUBLIC_API_SOCKET_URL",
    "NEXT_PUBLIC_EXTRA_CONNECT_SRC",
  ]) {
    Reflect.deleteProperty(env, name);
  }
  return env;
}

function runTypeScript(
  workingDirectory: string,
  script: string,
  args: string[] = [],
  env: NodeJS.ProcessEnv = productionChildEnvironment(),
) {
  return spawnSync(
    process.execPath,
    ["--import", tsxImport, resolve(repositoryRoot, script), ...args],
    {
      cwd: workingDirectory,
      env,
      encoding: "utf8",
    },
  );
}

test("production bootstrap loads .env.production before CSP validation", () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "tecpey-csp-bootstrap-"));
  try {
    writeFileSync(
      join(workingDirectory, ".env.production"),
      [
        "NEXT_PUBLIC_API_BACKEND_URL=https://api.file-env.tecpey.test",
        "NEXT_PUBLIC_API_SOCKET_URL=wss://stream.file-env.tecpey.test/ws",
      ].join("\n"),
    );

    const child = runTypeScript(
      workingDirectory,
      "scripts/run-production-bootstrap.ts",
      ["unsupported-test-target"],
    );

    assert.equal(child.status, 1);
    assert.match(child.stderr, /unsupported_production_bootstrap_target/u);
    assert.doesNotMatch(child.stderr, /csp_connection_policy_invalid/u);
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});

test("production bootstrap forces production before environment loading and imports", () => {
  const bootstrap = readFileSync(
    resolve(repositoryRoot, "scripts/run-production-bootstrap.ts"),
    "utf8",
  );
  const productionMode = bootstrap.indexOf(
    'Reflect.set(process.env, "NODE_ENV", "production")',
  );
  const environmentLoad = bootstrap.indexOf(
    "loadEnvConfig(process.cwd(), false);",
  );
  const assertion = bootstrap.indexOf("assertCspConnectionEnvironment();");
  const serverImport = bootstrap.indexOf('await import("../server")');

  assert.ok(productionMode >= 0);
  assert.ok(productionMode < environmentLoad);
  assert.ok(environmentLoad < assertion);
  assert.ok(assertion < serverImport);
});

test("production bootstrap enforces production CSP semantics without exported NODE_ENV", () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "tecpey-csp-bootstrap-mode-"));
  try {
    writeFileSync(
      join(workingDirectory, ".env.production"),
      [
        "NEXT_PUBLIC_API_BACKEND_URL=http://api.file-env.tecpey.test",
        "NEXT_PUBLIC_API_SOCKET_URL=wss://stream.file-env.tecpey.test/ws",
      ].join("\n"),
    );
    const env = productionChildEnvironment();
    Reflect.deleteProperty(env, "NODE_ENV");

    const child = runTypeScript(
      workingDirectory,
      "scripts/run-production-bootstrap.ts",
      ["unsupported-test-target"],
      env,
    );

    assert.equal(child.status, 1);
    assert.match(
      child.stderr,
      /csp_connection_policy_invalid:NEXT_PUBLIC_API_BACKEND_URL:scheme_http/u,
    );
    assert.doesNotMatch(child.stderr, /unsupported_production_bootstrap_target/u);
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});

test("standalone CSP validation loads production files and enforces production schemes", () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "tecpey-csp-env-check-"));
  try {
    writeFileSync(
      join(workingDirectory, ".env.production"),
      [
        "NEXT_PUBLIC_API_BACKEND_URL=http://api.file-env.tecpey.test",
        "NEXT_PUBLIC_API_SOCKET_URL=wss://stream.file-env.tecpey.test/ws",
      ].join("\n"),
    );
    const env = productionChildEnvironment();
    Reflect.deleteProperty(env, "NODE_ENV");

    const child = runTypeScript(
      workingDirectory,
      "scripts/validate-csp-connection-env.ts",
      [],
      env,
    );

    assert.equal(child.status, 1);
    assert.match(
      child.stderr,
      /csp_connection_policy_invalid:NEXT_PUBLIC_API_BACKEND_URL:scheme_http/u,
    );
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});
