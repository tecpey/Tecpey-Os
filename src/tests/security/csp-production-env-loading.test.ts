import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { runtimeBootstrapFindings } from "../../../scripts/check-runtime-bootstrap.mjs";

const repositoryRoot = process.cwd();
const tsxImport = createRequire(import.meta.url).resolve("tsx");

function validProductionEnvironment(
  overrides: Record<string, string> = {},
): string {
  const values = {
    NEXT_PUBLIC_SITE_URL: "https://tecpey.test",
    NEXT_PUBLIC_API_URL: "https://my.tecpey.test",
    NEXT_PUBLIC_API_BACKEND_URL: "https://api.tecpey.test",
    NEXT_PUBLIC_API_SOCKET_URL: "wss://stream.tecpey.test",
    TECPEY_SESSION_SECRET: "a".repeat(32),
    TECPEY_REFRESH_SECRET: "b".repeat(32),
    TECPEY_ACADEMY_AUTH_SECRET: "c".repeat(32),
    CERTIFICATE_SIGNING_SECRET: "d".repeat(32),
    TECPEY_WITHDRAWAL_PRICE_SECRET: "e".repeat(32),
    TECPEY_OFFLINE_SYNC_SECRET: "f".repeat(32),
    TECPEY_CRM_PII_KEY_B64: Buffer.alloc(32, 7).toString("base64"),
    TECPEY_CRM_CONTACT_HASH_SECRET: "g".repeat(32),
    TECPEY_TRUSTED_PROXY_HEADER: "x-forwarded-for",
    TECPEY_TRUSTED_PROXY_HOPS: "1",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    REDIS_URL: "redis://localhost:6379",
    UPSTASH_REDIS_REST_URL: "https://rate-limit.tecpey.test",
    UPSTASH_REDIS_REST_TOKEN: "rate-limit-token",
    TECPEY_REAL_WITHDRAWALS_ENABLED: "0",
    TECPEY_CUSTODY_SIMULATION_ENABLED: "0",
    ...overrides,
  };
  return Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function productionChildEnvironment(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    LANG: "C",
    NODE_ENV: "production",
  };
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

function productionBootstrapSources() {
  const [
    server,
    runtimeSmoke,
    productionBootstrap,
    environmentValidator,
    cspValidator,
    publicBrowserWorkflow,
  ] = [
    readFileSync(resolve(repositoryRoot, "server.ts"), "utf8"),
    readFileSync(resolve(repositoryRoot, "scripts/check-ui-runtime.mjs"), "utf8"),
    readFileSync(
      resolve(repositoryRoot, "scripts/run-production-bootstrap.ts"),
      "utf8",
    ),
    readFileSync(resolve(repositoryRoot, "scripts/validate-env.mjs"), "utf8"),
    readFileSync(
      resolve(repositoryRoot, "scripts/validate-csp-connection-env.ts"),
      "utf8",
    ),
    readFileSync(
      resolve(repositoryRoot, ".github/workflows/public-browser-golden-path.yml"),
      "utf8",
    ),
  ];
  return {
    server,
    runtimeSmoke,
    productionBootstrap,
    environmentValidator,
    cspValidator,
    publicBrowserWorkflow,
  };
}

test("production bootstrap loads .env.production before CSP validation", () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "tecpey-csp-bootstrap-"));
  try {
    writeFileSync(
      join(workingDirectory, ".env.production"),
      validProductionEnvironment({
        NEXT_PUBLIC_API_BACKEND_URL: "https://api.file-env.tecpey.test",
        NEXT_PUBLIC_API_SOCKET_URL: "wss://stream.file-env.tecpey.test/ws",
      }),
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

test("standalone environment validation forces every production-only gate", () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "tecpey-full-env-check-"));
  try {
    writeFileSync(
      join(workingDirectory, ".env.production"),
      validProductionEnvironment({
        TECPEY_REAL_WITHDRAWALS_ENABLED: "1",
      }),
    );
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      LANG: "C",
      NODE_ENV: "production",
    };
    Reflect.deleteProperty(env, "NODE_ENV");

    const child = runTypeScript(
      workingDirectory,
      "scripts/validate-env.mjs",
      [],
      env,
    );

    assert.equal(child.status, 1);
    assert.match(
      child.stderr,
      /TECPEY_REAL_WITHDRAWALS_ENABLED=1 is forbidden/u,
    );
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});

test("production bootstrap runs complete validation before selecting a target", () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "tecpey-full-bootstrap-"));
  try {
    writeFileSync(
      join(workingDirectory, ".env.production"),
      [
        "NEXT_PUBLIC_API_BACKEND_URL=https://api.tecpey.test",
        "NEXT_PUBLIC_API_SOCKET_URL=wss://stream.tecpey.test",
      ].join("\n"),
    );
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      LANG: "C",
      NODE_ENV: "production",
    };
    Reflect.deleteProperty(env, "NODE_ENV");

    const child = runTypeScript(
      workingDirectory,
      "scripts/run-production-bootstrap.ts",
      ["unsupported-test-target"],
      env,
    );

    assert.equal(child.status, 1);
    assert.match(child.stderr, /NEXT_PUBLIC_SITE_URL is missing/u);
    assert.doesNotMatch(child.stderr, /unsupported_production_bootstrap_target/u);
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});

test("production validation rejects unsafe origins and non-canonical CRM keys", () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "tecpey-strict-env-check-"));
  try {
    writeFileSync(
      join(workingDirectory, ".env.production"),
      validProductionEnvironment({
        NEXT_PUBLIC_SITE_URL: "http://tecpey.test/path",
        TECPEY_CRM_PII_KEY_B64: `${Buffer.alloc(32, 7).toString("base64")}!!!`,
      }),
    );
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      LANG: "C",
      NODE_ENV: "production",
    };
    Reflect.deleteProperty(env, "NODE_ENV");

    const child = runTypeScript(
      workingDirectory,
      "scripts/validate-env.mjs",
      [],
      env,
    );

    assert.equal(child.status, 1);
    assert.match(child.stderr, /NEXT_PUBLIC_SITE_URL must be an HTTPS origin/u);
    assert.match(child.stderr, /must be canonical base64 encoding exactly 32 bytes/u);
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});

test("runtime bootstrap policy rejects weakened production validation", () => {
  const sources = productionBootstrapSources();
  assert.deepEqual(runtimeBootstrapFindings(sources), []);

  for (const [mutated, expected] of [
    [
      {
        ...sources,
        productionBootstrap: sources.productionBootstrap.replace(
          'await import("./validate-env.mjs");',
          "",
        ),
      },
      /complete environment validation/u,
    ],
    [
      {
        ...sources,
        environmentValidator: sources.environmentValidator.replace(
          "Reflect.set(process.env, 'NODE_ENV', 'production')",
          "Reflect.set(process.env, 'NODE_ENV', 'development')",
        ),
      },
      /environment validator must force production mode/u,
    ],
    [
      {
        ...sources,
        environmentValidator: sources.environmentValidator.replace(
          "validateHttpsOrigin('NEXT_PUBLIC_SITE_URL');",
          "",
        ),
      },
      /HTTPS site origin/u,
    ],
    [
      {
        ...sources,
        environmentValidator: sources.environmentValidator.replace(
          "decoded.toString('base64') !== crmPiiKey",
          "false",
        ),
      },
      /canonical 32-byte CRM encryption key/u,
    ],
    [
      {
        ...sources,
        publicBrowserWorkflow: sources.publicBrowserWorkflow.replace(
          "          NEXT_PUBLIC_SITE_URL: https://e2e.tecpey.test",
          "          NEXT_PUBLIC_SITE_URL: http://127.0.0.1:3100",
        ),
      },
      /public Browser workflow must validate.*HTTPS origins/u,
    ],
    [
      {
        ...sources,
        publicBrowserWorkflow: sources.publicBrowserWorkflow.replace(
          [
            "            tests/e2e/test-results",
            "          if-no-files-found: ignore",
          ].join("\n"),
          [
            "            tests/e2e/test-results",
            "          if-no-files-found: error",
          ].join("\n"),
        ),
      },
      /missing-artifact failure/u,
    ],
  ] as const) {
    assert.match(runtimeBootstrapFindings(mutated).join("\n"), expected);
  }
});
