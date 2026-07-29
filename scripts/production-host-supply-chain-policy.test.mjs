import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  assertProductionHostSupplyChain,
  productionHostSupplyChainFindings,
} from "./production-host-supply-chain-policy.mjs";

const sources = {
  baseInstaller: fs.readFileSync("scripts/ubuntu24-install-base.sh", "utf8"),
  pm2Deploy: fs.readFileSync("scripts/ubuntu24-deploy-pm2.sh", "utf8"),
  preflight: fs.readFileSync("scripts/ubuntu24-preflight.sh", "utf8"),
  productionVerification: fs.readFileSync("VERIFY_PRODUCTION.sh", "utf8"),
  deploymentDocs: [
    ["Ubuntu quick deployment guide", fs.readFileSync("DEPLOY_UBUNTU_24.md", "utf8")],
    [
      "Ubuntu production deployment guide",
      fs.readFileSync("DEPLOY_UBUNTU_24_PRODUCTION.md", "utf8"),
    ],
    ["Deployment entry point", fs.readFileSync("docs/Deployment.md", "utf8")],
  ],
};
const preflightPath = path.resolve("scripts/ubuntu24-preflight.sh");
const expectedReleaseSha = "a".repeat(40);
const healthyPayload = {
  ok: true,
  health: "ok",
  build: { commit: expectedReleaseSha },
  checks: {
    database: "ok",
    schema: "current",
    redis: "ok",
    runtime: "ready",
    requiredWorkers: "ready",
  },
};

function writeExecutable(filePath, source) {
  fs.writeFileSync(filePath, source, { mode: 0o755 });
}

function runPreflight(t, {
  curlExitCode = 22,
  curlSuccessAfter = 0,
  healthPayload = healthyPayload,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tecpey-host-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  fs.writeFileSync(path.join(root, ".env.production"), "NODE_ENV=production\n");
  const commandLog = path.join(root, "commands.log");
  const curlState = path.join(root, "curl-count");

  writeExecutable(
    path.join(bin, "node"),
    `#!/usr/bin/env bash
if [ "\${1:-}" = "-p" ]; then
  printf "%s\\n" "\${FAKE_NODE_MAJOR:-22}"
elif [ "\${1:-}" = "-v" ] || [ "\${1:-}" = "--version" ]; then
  printf "v%s.0.0\\n" "\${FAKE_NODE_MAJOR:-22}"
else
  exec "$REAL_NODE" "$@"
fi
`,
  );
  writeExecutable(
    path.join(bin, "npm"),
    `#!/usr/bin/env bash
if [ "\${1:-}" = "--version" ] || [ "\${1:-}" = "-v" ]; then
  printf "%s.0.0\\n" "\${FAKE_NPM_MAJOR:-10}"
  exit 0
fi
printf "npm %s\\n" "$*" >> "$FAKE_COMMAND_LOG"
exit 0
`,
  );
  writeExecutable(
    path.join(bin, "sleep"),
    '#!/usr/bin/env bash\nprintf "sleep %s\\n" "$*" >> "$FAKE_COMMAND_LOG"\nexit 0\n',
  );
  writeExecutable(
    path.join(bin, "git"),
    `#!/usr/bin/env bash
if [ "\${1:-}" = "rev-parse" ] && [ "\${2:-}" = "HEAD" ]; then
  printf "%s\\n" "$FAKE_RELEASE_SHA"
  exit 0
fi
if [ "\${1:-}" = "status" ]; then
  exit 0
fi
exit 2
`,
  );
  writeExecutable(
    path.join(bin, "curl"),
    `#!/usr/bin/env bash
count=0
if [ -f "$FAKE_CURL_STATE" ]; then
  read -r count < "$FAKE_CURL_STATE"
fi
count=$((count + 1))
printf "%s\\n" "$count" > "$FAKE_CURL_STATE"
if [ "$FAKE_CURL_SUCCESS_AFTER" -gt 0 ] && [ "$count" -ge "$FAKE_CURL_SUCCESS_AFTER" ]; then
  printf "%s\\n" "$FAKE_HEALTH_PAYLOAD"
  exit 0
fi
exit "$FAKE_CURL_EXIT_CODE"
`,
  );

  const result = spawnSync("/bin/bash", [preflightPath], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_COMMAND_LOG: commandLog,
      FAKE_CURL_EXIT_CODE: String(curlExitCode),
      FAKE_CURL_STATE: curlState,
      FAKE_CURL_SUCCESS_AFTER: String(curlSuccessAfter),
      FAKE_HEALTH_PAYLOAD: JSON.stringify(healthPayload),
      FAKE_NODE_MAJOR: "22",
      FAKE_NPM_MAJOR: "10",
      FAKE_RELEASE_SHA: expectedReleaseSha,
      REAL_NODE: process.execPath,
    },
  });
  return {
    ...result,
    commandLog: fs.existsSync(commandLog) ? fs.readFileSync(commandLog, "utf8") : "",
    curlCount: Number(fs.readFileSync(curlState, "utf8").trim()),
  };
}

test("governed host scripts retire mutable installers and keep verification fail closed", () => {
  assert.doesNotThrow(() => assertProductionHostSupplyChain(sources));
});

test("policy rejects remote root shell execution", () => {
  const mutated = {
    ...sources,
    baseInstaller: sources.baseInstaller.replace(
      'exit "$HOST_DEPLOYMENT_RETIRED"',
      "curl -fsSL https://example.invalid/setup.sh | sudo -E bash",
    ),
  };
  assert.match(productionHostSupplyChainFindings(mutated).join("\n"), /remote content into a shell/);
});

test("policy rejects commands before or after a retired script sentinel", () => {
  const before = {
    ...sources,
    baseInstaller: sources.baseInstaller.replace(
      "readonly HOST_DEPLOYMENT_RETIRED=1",
      "sudo apt update\nreadonly HOST_DEPLOYMENT_RETIRED=1",
    ),
  };
  assert.match(
    productionHostSupplyChainFindings(before).join("\n"),
    /must not execute commands before the retirement sentinel/,
  );

  const after = {
    ...sources,
    pm2Deploy: `${sources.pm2Deploy}\npm2 start ecosystem.config.cjs\n`,
  };
  assert.match(
    productionHostSupplyChainFindings(after).join("\n"),
    /must not retain dormant commands after the retirement exit/,
  );

  const substitution = {
    ...sources,
    baseInstaller: sources.baseInstaller.replace(
      'echo "Retired: repository-owned privileged host bootstrap is not an approved production authority." >&2',
      'echo "$(sudo apt update)" >&2',
    ),
  };
  assert.match(
    productionHostSupplyChainFindings(substitution).join("\n"),
    /may only emit diagnostics before the retirement exit/,
  );
});

test("policy rejects mutable global process-manager installation", () => {
  const mutated = {
    ...sources,
    pm2Deploy: sources.pm2Deploy.replace(
      'exit "$HOST_DEPLOYMENT_RETIRED"',
      "sudo npm install -g pm2",
    ),
  };
  assert.match(productionHostSupplyChainFindings(mutated).join("\n"), /mutable global npm tooling/);
});

test("policy rejects non-lockfile production installation", () => {
  const mutated = {
    ...sources,
    preflight: sources.preflight.replace("npm ci --no-audit --no-fund", "npm install"),
  };
  const findings = productionHostSupplyChainFindings(mutated).join("\n");
  assert.match(findings, /exact lockfile/);
  assert.match(findings, /bypass the lockfile/);
});

test("policy rejects swallowed readiness failures", () => {
  const mutated = {
    ...sources,
    preflight: sources.preflight.replace(
      'curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/health > "$health_payload"',
      "node -e \"fetch('http://127.0.0.1:3000/api/health').catch(()=>process.exit(0))\" || true",
    ),
  };
  const findings = productionHostSupplyChainFindings(mutated).join("\n");
  assert.match(findings, /unhealthy runtime/);
  assert.match(findings, /swallow readiness failure/);
});

test("policy rejects removal of bounded deterministic readiness retries", () => {
  const mutated = {
    ...sources,
    preflight: sources.preflight
      .replace("readonly READINESS_ATTEMPTS=5", "")
      .replace("for attempt in 1 2 3 4 5; do", "for attempt in 1; do"),
  };
  const findings = productionHostSupplyChainFindings(mutated).join("\n");
  assert.match(findings, /bound readiness attempts/);
  assert.match(findings, /retry readiness deterministically/);
});

test("policy rejects removal of the governed Node.js and npm version contract", () => {
  const mutated = {
    ...sources,
    preflight: sources.preflight
      .replace("readonly EXPECTED_NODE_MAJOR=22", "")
      .replace("readonly EXPECTED_NPM_MAJOR=10", ""),
  };
  const findings = productionHostSupplyChainFindings(mutated).join("\n");
  assert.match(findings, /approved Node\.js major/);
  assert.match(findings, /approved npm major/);
});

test("policy rejects removal of exact candidate and runtime readiness binding", () => {
  const mutated = {
    ...sources,
    preflight: sources.preflight
      .replace("expected_release_sha=$(git rev-parse HEAD)", "expected_release_sha=unknown")
      .replace("body.build?.commit !== expected", "false"),
  };
  const findings = productionHostSupplyChainFindings(mutated).join("\n");
  assert.match(findings, /resolve the exact candidate commit/);
  assert.match(findings, /bind readiness to the exact runtime commit/);
});

test("policy rejects a mutable or fail-open production verification wrapper", () => {
  for (const injected of [
    "npm install",
    "node scripts/qa-production-static.mjs || true",
    "npm start",
  ]) {
    const mutated = {
      ...sources,
      productionVerification: sources.productionVerification.replace(
        "exec bash scripts/ubuntu24-preflight.sh",
        `${injected}\nexec bash scripts/ubuntu24-preflight.sh`,
      ),
    };
    assert.match(
      productionHostSupplyChainFindings(mutated).join("\n"),
      /must delegate exactly to the governed host preflight/,
    );
  }
});

test("real preflight retries and succeeds only after live readiness passes", (t) => {
  const result = runPreflight(t, { curlSuccessAfter: 3 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.curlCount, 3);
  assert.match(result.commandLog, /^npm ci --no-audit --no-fund$/m);
  assert.match(result.commandLog, /^npm run env:check$/m);
  assert.match(result.commandLog, /^npm run check$/m);
  assert.match(result.commandLog, /^npm run build$/m);
  assert.equal((result.commandLog.match(/^sleep 2$/gm) ?? []).length, 2);
});

test("real preflight rejects an unapproved Node.js or npm major before installation", (t) => {
  for (const [nodeMajor, npmMajor] of [
    ["21", "10"],
    ["22", "11"],
  ]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tecpey-host-version-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(root, "package.json"), "{}\n");
    fs.writeFileSync(path.join(root, ".env.production"), "NODE_ENV=production\n");
    const commandLog = path.join(root, "commands.log");
    writeExecutable(
      path.join(bin, "node"),
      `#!/usr/bin/env bash
if [ "\${1:-}" = "-p" ]; then printf "%s\\n" "$FAKE_NODE_MAJOR"; else printf "v%s.0.0\\n" "$FAKE_NODE_MAJOR"; fi
`,
    );
    writeExecutable(
      path.join(bin, "npm"),
      `#!/usr/bin/env bash
if [ "\${1:-}" = "--version" ] || [ "\${1:-}" = "-v" ]; then printf "%s.0.0\\n" "$FAKE_NPM_MAJOR"; exit 0; fi
printf "npm %s\\n" "$*" >> "$FAKE_COMMAND_LOG"
`,
    );
    const result = spawnSync("/bin/bash", [preflightPath], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        FAKE_COMMAND_LOG: commandLog,
        FAKE_NODE_MAJOR: nodeMajor,
        FAKE_NPM_MAJOR: npmMajor,
      },
    });
    assert.equal(result.status, 1);
    assert.equal(fs.existsSync(commandLog), false, "npm install/build commands must not run");
  }
});

test("real preflight fails closed for every unavailable readiness class", async (t) => {
  for (const scenario of [
    ["service absent", { curlExitCode: 7 }],
    ["HTTP unhealthy", { curlExitCode: 22 }],
    [
      "schema outdated",
      {
        curlSuccessAfter: 1,
        healthPayload: {
          ...healthyPayload,
          health: "unhealthy",
          checks: { ...healthyPayload.checks, schema: "outdated" },
        },
      },
    ],
    [
      "Redis unready",
      {
        curlSuccessAfter: 1,
        healthPayload: {
          ...healthyPayload,
          health: "unhealthy",
          checks: { ...healthyPayload.checks, redis: "unavailable" },
        },
      },
    ],
    [
      "migration/runtime unready",
      {
        curlSuccessAfter: 1,
        healthPayload: {
          ...healthyPayload,
          health: "unhealthy",
          checks: { ...healthyPayload.checks, runtime: "starting" },
        },
      },
    ],
    [
      "wrong runtime commit",
      {
        curlSuccessAfter: 1,
        healthPayload: {
          ...healthyPayload,
          build: { commit: "b".repeat(40) },
        },
      },
    ],
  ]) {
    await t.test(scenario[0], (subtest) => {
      const result = runPreflight(subtest, scenario[1]);
      assert.equal(result.status, 1);
      assert.equal(result.curlCount, 5);
      assert.match(result.stderr, /readiness did not become healthy after 5 attempts/);
    });
  }
});

test("policy rejects revival of mutable deployment documentation", () => {
  const mutated = {
    ...sources,
    deploymentDocs: [
      ...sources.deploymentDocs,
      [
        "Injected legacy guide",
        [
          "TECPEY_IMAGE_DIGEST",
          "docker compose -f docker-compose.production.yml up -d --build",
          "curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/health",
          "sudo npm install -g pm2",
          "pm2 start ecosystem.config.cjs",
        ].join("\n"),
      ],
    ],
  };
  const findings = productionHostSupplyChainFindings(mutated).join("\n");
  assert.match(findings, /mutable global npm tooling/);
  assert.match(findings, /retired PM2 release path/);
  assert.match(findings, /mutable production image/);
  assert.match(findings, /mutable live-source deployment/);
});
