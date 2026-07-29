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
  buildConfig: fs.readFileSync("next.config.ts", "utf8"),
  buildIdentity: fs.readFileSync("scripts/resolve-build-identity.ts", "utf8"),
  healthRoute: fs.readFileSync("src/app/api/health/route.ts", "utf8"),
  dockerfile: fs.readFileSync("Dockerfile", "utf8"),
  containerWorkflow: fs.readFileSync(".github/workflows/container-supply-chain.yml", "utf8"),
  deploymentDocs: [
    ["Ubuntu quick deployment guide", fs.readFileSync("DEPLOY_UBUNTU_24.md", "utf8")],
    [
      "Ubuntu production deployment guide",
      fs.readFileSync("DEPLOY_UBUNTU_24_PRODUCTION.md", "utf8"),
    ],
    ["Deployment entry point", fs.readFileSync("docs/Deployment.md", "utf8")],
  ],
  localInstallDocs: [
    ["Mac ZIP install guide", fs.readFileSync("INSTALL_MAC.md", "utf8")],
    ["Mac ZIP no-error install guide", fs.readFileSync("INSTALL_MAC_NO_ERROR.md", "utf8")],
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
  bakedReleaseSha = expectedReleaseSha,
  curlExitCode = 22,
  curlSuccessAfter = 0,
  gitStatusOutput = "",
  healthPayload = healthyPayload,
  liveWorktreeIsFixture = false,
  phase = "runtime",
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tecpey-host-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  fs.writeFileSync(path.join(root, ".env.production"), "NODE_ENV=production\n");
  if (phase === "runtime") {
    fs.mkdirSync(path.join(root, ".next"));
    fs.writeFileSync(
      path.join(root, ".next", "required-server-files.json"),
      `${JSON.stringify({
        config: { env: { TECPEY_IMMUTABLE_BUILD_COMMIT_SHA: bakedReleaseSha } },
      })}\n`,
    );
  }
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
if [ "$*" = "run build" ]; then
  mkdir -p .next
  printf '{"config":{"env":{"TECPEY_IMMUTABLE_BUILD_COMMIT_SHA":"%s"}}}\\n' "$FAKE_RELEASE_SHA" > .next/required-server-files.json
fi
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
  printf "%s" "$FAKE_GIT_STATUS"
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

  let executablePreflightPath = preflightPath;
  if (liveWorktreeIsFixture) {
    executablePreflightPath = path.join(root, "ubuntu24-preflight.sh");
    fs.writeFileSync(
      executablePreflightPath,
      sources.preflight.replace(
        "readonly SYSTEMD_LIVE_WORKTREE=/var/www/tecpey",
        `readonly SYSTEMD_LIVE_WORKTREE=${JSON.stringify(root)}`,
      ),
    );
  }

  const result = spawnSync("/bin/bash", [executablePreflightPath, phase], {
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
      FAKE_GIT_STATUS: gitStatusOutput,
      FAKE_NODE_MAJOR: "22",
      FAKE_NPM_MAJOR: "10",
      FAKE_RELEASE_SHA: expectedReleaseSha,
      REAL_NODE: process.execPath,
    },
  });
  return {
    ...result,
    commandLog: fs.existsSync(commandLog) ? fs.readFileSync(commandLog, "utf8") : "",
    curlCount: fs.existsSync(curlState)
      ? Number(fs.readFileSync(curlState, "utf8").trim())
      : 0,
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

test("policy rejects runtime-mutable or unbound build identity", () => {
  const mutableHealth = {
    ...sources,
    healthRoute: sources.healthRoute.replace(
      "process.env.TECPEY_IMMUTABLE_BUILD_COMMIT_SHA",
      "process.env.NEXT_PUBLIC_GIT_COMMIT",
    ),
  };
  const healthFindings = productionHostSupplyChainFindings(mutableHealth).join("\n");
  assert.match(healthFindings, /artifact-baked commit/);
  assert.match(healthFindings, /runtime-overridable public Git commit/);

  const unboundPreflight = {
    ...sources,
    preflight: sources.preflight.replace(
      'TECPEY_BUILD_COMMIT_SHA="$expected_release_sha" npm run build',
      "npm run build",
    ),
  };
  assert.match(
    productionHostSupplyChainFindings(unboundPreflight).join("\n"),
    /bind the production build to the exact candidate/,
  );

  const unboundContainer = {
    ...sources,
    containerWorkflow: sources.containerWorkflow.replace(
      "TECPEY_BUILD_COMMIT_SHA=${{ github.event.pull_request.head.sha || github.sha }}",
      "TECPEY_BUILD_COMMIT_SHA=unknown",
    ),
  };
  assert.match(
    productionHostSupplyChainFindings(unboundContainer).join("\n"),
    /bind every build to an exact commit/,
  );
});

test("source archives require an explicit local-only unverified build identity", () => {
  const missingOptIn = {
    ...sources,
    localInstallDocs: sources.localInstallDocs.map(([label, source]) => [
      label,
      source.replace("TECPEY_LOCAL_SOURCE_ARCHIVE_BUILD=1 npm run build", "npm run build"),
    ]),
  };
  assert.match(
    productionHostSupplyChainFindings(missingOptIn).join("\n"),
    /must opt in explicitly when building outside a Git checkout/,
  );

  const missingSentinel = {
    ...sources,
    buildIdentity: sources.buildIdentity.replace("unverified-local-source-archive", "unknown"),
  };
  assert.match(
    productionHostSupplyChainFindings(missingSentinel).join("\n"),
    /label local source-archive artifacts as unverified/,
  );

  const archiveModeAfterGit = {
    ...sources,
    buildIdentity: sources.buildIdentity.replace(
      /  if \(process\.env\.TECPEY_LOCAL_SOURCE_ARCHIVE_BUILD\?\.trim\(\) === "1"\) \{\n    return localSourceArchiveBuild;\n  \}\n\n/,
      "",
    ).replace(
      "  } catch {\n",
      '  } catch {\n    if (process.env.TECPEY_LOCAL_SOURCE_ARCHIVE_BUILD?.trim() === "1") {\n      return localSourceArchiveBuild;\n    }\n',
    ),
  };
  assert.match(
    productionHostSupplyChainFindings(archiveModeAfterGit).join("\n"),
    /honor explicit local source-archive mode before Git discovery/,
  );
});

test("next config builds explicitly opted-in source archives without Git metadata", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tecpey-source-archive-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  const buildIdentityUrl = new URL("./resolve-build-identity.ts", import.meta.url).href;
  const expression =
    `import(${JSON.stringify(buildIdentityUrl)}).then(({ resolveImmutableBuildCommit }) => ` +
    `process.stdout.write(resolveImmutableBuildCommit()))`;
  const baseEnv = { ...process.env };
  delete baseEnv.TECPEY_BUILD_COMMIT_SHA;

  const optedIn = spawnSync(process.execPath, ["--experimental-strip-types", "--eval", expression], {
    cwd: root,
    encoding: "utf8",
    env: { ...baseEnv, TECPEY_LOCAL_SOURCE_ARCHIVE_BUILD: "1" },
  });
  assert.equal(optedIn.status, 0, optedIn.stderr);
  assert.equal(optedIn.stdout, "unverified-local-source-archive");

  const failClosed = spawnSync(process.execPath, ["--experimental-strip-types", "--eval", expression], {
    cwd: root,
    encoding: "utf8",
    env: baseEnv,
  });
  assert.notEqual(failClosed.status, 0);
  assert.match(failClosed.stderr, /Build identity is unavailable/);
});

test("source archive opt-in takes precedence over an enclosing Git worktree", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tecpey-nested-source-archive-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (args) =>
    spawnSync("git", args, {
      cwd: root,
      encoding: "utf8",
      env: process.env,
    });
  assert.equal(git(["init", "--quiet"]).status, 0);
  assert.equal(git(["config", "user.email", "test@example.invalid"]).status, 0);
  assert.equal(git(["config", "user.name", "Tecpey Test"]).status, 0);
  fs.writeFileSync(path.join(root, "parent-repository.txt"), "parent\n");
  assert.equal(git(["add", "parent-repository.txt"]).status, 0);
  assert.equal(git(["commit", "--quiet", "-m", "test parent"]).status, 0);

  const archive = path.join(root, "extracted-archive");
  fs.mkdirSync(archive);
  fs.writeFileSync(path.join(archive, "package.json"), "{}\n");
  const buildIdentityUrl = new URL("./resolve-build-identity.ts", import.meta.url).href;
  const expression =
    `import(${JSON.stringify(buildIdentityUrl)}).then(({ resolveImmutableBuildCommit }) => ` +
    `process.stdout.write(resolveImmutableBuildCommit()))`;
  const env = { ...process.env, TECPEY_LOCAL_SOURCE_ARCHIVE_BUILD: "1" };
  delete env.TECPEY_BUILD_COMMIT_SHA;

  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--eval", expression],
    {
      cwd: archive,
      encoding: "utf8",
      env,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "unverified-local-source-archive");
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

test("real preflight separates isolated candidate build from promoted runtime verification", async (t) => {
  await t.test("candidate", (subtest) => {
    const result = runPreflight(subtest, { phase: "candidate" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.curlCount, 0);
    assert.match(result.commandLog, /^npm ci --no-audit --no-fund$/m);
    assert.match(result.commandLog, /^npm run env:check$/m);
    assert.match(result.commandLog, /^npm run check$/m);
    assert.match(result.commandLog, /^npm run build$/m);
  });

  await t.test("runtime", (subtest) => {
    const result = runPreflight(subtest, { phase: "runtime", curlSuccessAfter: 3 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.curlCount, 3);
    assert.doesNotMatch(result.commandLog, /^npm /m);
    assert.equal((result.commandLog.match(/^sleep 2$/gm) ?? []).length, 2);
  });
});

test("promoted live worktree permits runtime checks but refuses candidate builds", async (t) => {
  await t.test("candidate", (subtest) => {
    const result = runPreflight(subtest, {
      phase: "candidate",
      liveWorktreeIsFixture: true,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Refusing to verify inside the live systemd working tree/);
    assert.doesNotMatch(result.commandLog, /^npm /m);
  });

  await t.test("runtime", (subtest) => {
    const result = runPreflight(subtest, {
      phase: "runtime",
      liveWorktreeIsFixture: true,
      curlSuccessAfter: 1,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.curlCount, 1);
    assert.doesNotMatch(result.commandLog, /^npm /m);
  });
});

test("policy requires the live-worktree refusal to be candidate-only", () => {
  const mutated = {
    ...sources,
    preflight: sources.preflight.replace(
      'if [ "$VERIFICATION_PHASE" = "candidate" ] &&\n  ',
      "if ",
    ),
  };
  assert.match(
    productionHostSupplyChainFindings(mutated).join("\n"),
    /refuse the live worktree only during candidate verification/,
  );
});

test("real preflight rejects untracked candidate source before install or build", (t) => {
  const result = runPreflight(t, {
    phase: "candidate",
    gitStatusOutput: "?? src/unreviewed-route.ts\n",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /tracked or untracked changes/);
  assert.doesNotMatch(result.commandLog, /^npm /m);
});

test("real runtime verification rejects artifact metadata from another commit before probing", (t) => {
  const result = runPreflight(t, {
    phase: "runtime",
    bakedReleaseSha: "b".repeat(40),
    curlSuccessAfter: 1,
  });
  assert.equal(result.status, 1);
  assert.equal(result.curlCount, 0);
  assert.match(result.stderr, /artifact commit does not match/);
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
    const result = spawnSync("/bin/bash", [preflightPath, "candidate"], {
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

test("policy rejects local source-archive mode in production deployment guidance", () => {
  const mutated = {
    ...sources,
    deploymentDocs: sources.deploymentDocs.map(([label, source], index) => [
      label,
      index === 0 ? `${source}\nTECPEY_LOCAL_SOURCE_ARCHIVE_BUILD=1 npm run build\n` : source,
    ]),
  };
  assert.match(
    productionHostSupplyChainFindings(mutated).join("\n"),
    /must not enable the unverified local source-archive mode/,
  );
});

test("policy rejects loopback database or Redis URLs in the Compose guide", () => {
  const productionGuideIndex = sources.deploymentDocs.findIndex(
    ([label]) => label === "Ubuntu production deployment guide",
  );
  assert.notEqual(productionGuideIndex, -1);

  for (const [serviceName, loopback] of [
    ["postgres", "127.0.0.1"],
    ["redis", "localhost"],
  ]) {
    const deploymentDocs = sources.deploymentDocs.map(([label, source], index) => [
      label,
      index === productionGuideIndex
        ? source.replace(`@${serviceName}:`, `@${loopback}:`)
        : source,
    ]);
    const findings = productionHostSupplyChainFindings({
      ...sources,
      deploymentDocs,
    }).join("\n");
    assert.match(findings, /must use the internal (?:PostgreSQL|Redis) service name/);
    assert.match(findings, /must not use loopback connection URLs inside Compose containers/);
  }
});

test("policy rejects hidden untracked changes or live-tree verification guidance", () => {
  const hiddenUntracked = {
    ...sources,
    preflight: sources.preflight.replace(
      "git status --short --untracked-files=all",
      "git status --short --untracked-files=no",
    ),
  };
  const preflightFindings = productionHostSupplyChainFindings(hiddenUntracked).join("\n");
  assert.match(preflightFindings, /reject tracked and untracked source changes/);
  assert.match(preflightFindings, /must not hide untracked source changes/);

  const deploymentDocs = sources.deploymentDocs.map(([label, source]) => [
    label,
    label === "Ubuntu production deployment guide"
      ? source
          .replace("/var/www/tecpey-candidates/$EXPECTED_RELEASE_SHA", "/var/www/tecpey")
          .replace("bash scripts/ubuntu24-preflight.sh candidate", "bash scripts/ubuntu24-preflight.sh")
      : source,
  ]);
  const docFindings = productionHostSupplyChainFindings({
    ...sources,
    deploymentDocs,
  }).join("\n");
  assert.match(docFindings, /separate isolated candidate verification from runtime promotion/);
  assert.match(docFindings, /select an explicit candidate or runtime verification phase/);
});
