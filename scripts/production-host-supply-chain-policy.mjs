const RETIREMENT_SENTINEL = 'readonly HOST_DEPLOYMENT_RETIRED=1';
const RETIREMENT_EXIT = 'exit "$HOST_DEPLOYMENT_RETIRED"';
const LOCKFILE_INSTALL =
  'PATH="$SYSTEMD_COMMAND_PATH" "$SYSTEMD_NPM_BIN" ci --no-audit --no-fund';
const READINESS_PROBE =
  "curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/health";
const READINESS_ATTEMPTS = "readonly READINESS_ATTEMPTS=5";
const READINESS_LOOP = "for attempt in 1 2 3 4 5; do";
const NODE_VERSION_CONTRACT = "readonly EXPECTED_NODE_MAJOR=22";
const NPM_VERSION_CONTRACT = "readonly EXPECTED_NPM_MAJOR=10";
const SYSTEMD_NODE_BINARY_CONTRACT = "readonly SYSTEMD_NODE_BIN=/usr/bin/node";
const SYSTEMD_NPM_BINARY_CONTRACT = "readonly SYSTEMD_NPM_BIN=/usr/bin/npm";
const SYSTEMD_COMMAND_PATH_CONTRACT =
  "readonly SYSTEMD_COMMAND_PATH=/usr/bin:/bin";
const SYSTEMD_EXEC_START =
  "ExecStart=/usr/bin/node dist/run-production-bootstrap.cjs server";
const VERIFICATION_PHASE_CONTRACT = 'readonly VERIFICATION_PHASE="${1:-}"';
const LIVE_WORKTREE_CONTRACT = "readonly SYSTEMD_LIVE_WORKTREE=/var/www/tecpey";
const LIVE_WORKTREE_PHASE_GUARD =
  'if [ "$VERIFICATION_PHASE" != "runtime" ] &&\n' +
  '  [ "$candidate_worktree" = "$live_worktree" ]; then';
const CLEAN_CHECKOUT_CONTRACT = "git status --short --untracked-files=all";
const EXACT_RELEASE_CONTRACT = "expected_release_sha=$(git rev-parse HEAD)";
const EXACT_RUNTIME_CONTRACT = "body.build?.commit !== expected";
const BAKED_BUILD_COMMAND =
  'PATH="$SYSTEMD_COMMAND_PATH" "$SYSTEMD_NPM_BIN" run build';
const EXACT_MIGRATION_COMMAND =
  'NODE_ENV=production "$SYSTEMD_NODE_BIN" --env-file=.env.production';
const BAKED_HEALTH_COMMIT =
  'commit: process.env.TECPEY_IMMUTABLE_BUILD_COMMIT_SHA ?? "unknown"';
const LOCAL_SOURCE_ARCHIVE_BUILD =
  "TECPEY_LOCAL_SOURCE_ARCHIVE_BUILD=1 npm run build";
const LOCAL_SOURCE_ARCHIVE_SENTINEL = "unverified-local-source-archive";
const LOCAL_SOURCE_ARCHIVE_OPT_IN =
  'process.env.TECPEY_LOCAL_SOURCE_ARCHIVE_BUILD?.trim() === "1"';
const GIT_BUILD_IDENTITY_PROBE = 'execFileSync("git", ["rev-parse", "HEAD"]';
const SYSTEMD_CANDIDATE_VERIFICATION =
  "bash scripts/ubuntu24-preflight.sh candidate";
const SYSTEMD_MIGRATION =
  "bash scripts/ubuntu24-preflight.sh migrate";
const SYSTEMD_PROMOTION = "atomic promotion";
const SYSTEMD_RESTART = "controlled service restart";
const SYSTEMD_RUNTIME_VERIFICATION =
  "bash scripts/ubuntu24-preflight.sh runtime";
const COMPOSE_DATABASE_URL =
  "DATABASE_URL=postgresql://tecpey:SECRET_FROM_APPROVED_MANAGER@postgres:5432/tecpey";
const COMPOSE_REDIS_URL =
  "REDIS_URL=redis://:SECRET_FROM_APPROVED_MANAGER@redis:6379";
const IMMUTABLE_PRODUCTION_RUNTIME =
  "node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3";
const PRODUCTION_VERIFICATION_LINES = [
  "#!/usr/bin/env bash",
  "set -euo pipefail",
  'cd "$(dirname "$0")"',
  'exec bash scripts/ubuntu24-preflight.sh "$@"',
];

function requireText(findings, source, expected, message) {
  if (!source.includes(expected)) findings.push(message);
}

function reject(findings, source, pattern, message) {
  if (pattern.test(source)) findings.push(message);
}

function yamlBlock(source, indent, key) {
  const lines = source.split(/\r?\n/);
  const prefix = " ".repeat(indent);
  const start = lines.findIndex((line) => line === `${prefix}${key}:`);
  if (start < 0) return "";

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const currentIndent = line.length - line.trimStart().length;
    if (currentIndent <= indent) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function yamlNamedStepBlock(jobSource, stepName) {
  const lines = jobSource.split(/\r?\n/);
  const header = `      - name: ${stepName}`;
  const start = lines.findIndex((line) => line === header);
  if (start < 0) return "";

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^      - name: /.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function declaredEnvironmentKeys(source, declarationName) {
  const declaration = new RegExp(
    `const\\s+${declarationName}\\s*=\\s*\\[([\\s\\S]*?)\\];`,
  ).exec(source);
  if (!declaration) return null;
  return [...declaration[1].matchAll(/['"]([A-Z][A-Z0-9_]*)['"]/g)].map(
    (match) => match[1],
  );
}

function templateEnvironmentKeys(source) {
  return [...source.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]);
}

function validateRetiredScript(findings, label, source) {
  requireText(findings, source, RETIREMENT_SENTINEL, `${label} must be explicitly retired`);
  requireText(findings, source, RETIREMENT_EXIT, `${label} must fail closed`);

  const lines = source.split(/\r?\n/).map((line) => line.trim());
  const sentinelIndex = lines.indexOf(RETIREMENT_SENTINEL);
  const exitIndex = lines.indexOf(RETIREMENT_EXIT);
  if (sentinelIndex < 0 || exitIndex < 0) return;
  if (sentinelIndex >= exitIndex) {
    findings.push(`${label} must set the retirement sentinel before exiting`);
    return;
  }

  const executableBeforeSentinel = lines
    .slice(0, sentinelIndex)
    .filter((line) => line && !line.startsWith("#") && line !== "set -euo pipefail");
  if (executableBeforeSentinel.length > 0) {
    findings.push(`${label} must not execute commands before the retirement sentinel`);
  }

  const unexpectedBeforeExit = lines
    .slice(sentinelIndex + 1, exitIndex)
    .filter((line) => line && !line.startsWith("#") && !/^echo "[^"$`\\]*" >&2$/.test(line));
  if (unexpectedBeforeExit.length > 0) {
    findings.push(`${label} may only emit diagnostics before the retirement exit`);
  }

  const dormantCommands = lines
    .slice(exitIndex + 1)
    .filter((line) => line && !line.startsWith("#"));
  if (dormantCommands.length > 0) {
    findings.push(`${label} must not retain dormant commands after the retirement exit`);
  }
}

export function productionHostSupplyChainFindings({
  baseInstaller,
  pm2Deploy,
  preflight,
  productionVerification,
  buildConfig,
  buildIdentity,
  healthRoute,
  dockerfile,
  containerWorkflow,
  environmentTemplate,
  environmentValidator,
  systemdService,
  deploymentDocs = [],
  localInstallDocs = [],
}) {
  const findings = [];
  const retiredScripts = [
    ["Ubuntu base installer", baseInstaller],
    ["PM2 deploy script", pm2Deploy],
  ];

  for (const [label, source] of retiredScripts) {
    validateRetiredScript(findings, label, source);
  }

  for (const [label, source] of [
    ...retiredScripts,
    ["Ubuntu preflight", preflight],
    ...deploymentDocs,
  ]) {
    reject(
      findings,
      source,
      /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo(?:\s+-\S+)*\s+)?(?:bash|sh)\b/,
      `${label} must not pipe remote content into a shell`,
    );
    reject(
      findings,
      source,
      /\bnpm\s+(?:i|install)\b[^\n]*(?:\s-g\b|\s--global\b)/,
      `${label} must not install mutable global npm tooling`,
    );
  }

  for (const [label, source] of deploymentDocs) {
    reject(
      findings,
      source,
      /TECPEY_LOCAL_SOURCE_ARCHIVE_BUILD/,
      `${label} must not enable the unverified local source-archive mode`,
    );
    requireText(
      findings,
      source,
      "TECPEY_IMAGE_DIGEST",
      `${label} must require the reviewed image digest`,
    );
    requireText(
      findings,
      source,
      "npm run env:check",
      `${label} must validate the complete production environment before Compose startup`,
    );
    requireText(
      findings,
      source,
      "docker compose -f docker-compose.production.yml up -d",
      `${label} must use the governed Compose release`,
    );
    requireText(
      findings,
      source,
      READINESS_PROBE,
      `${label} must require fail-closed live readiness`,
    );
    reject(
      findings,
      source,
      /\bpm2\s+(?:start|restart|reload|save|startup|status|logs)\b/i,
      `${label} must not advertise the retired PM2 release path`,
    );
    reject(
      findings,
      source,
      /\bdocker(?:-compose|\s+compose)\b[^\n]*(?:--build|\bbuild\b)|\bdocker\s+build\b/i,
      `${label} must not build a mutable production image on the host`,
    );
    reject(
      findings,
      source,
      /\b(?:npm\s+(?:install|i)\b|git\s+pull\b)/i,
      `${label} must not advertise mutable live-source deployment`,
    );
    if (label === "Ubuntu production deployment guide") {
      requireText(
        findings,
        source,
        COMPOSE_DATABASE_URL,
        `${label} must use the internal PostgreSQL service name`,
      );
      requireText(
        findings,
        source,
        COMPOSE_REDIS_URL,
        `${label} must use the internal Redis service name`,
      );
      reject(
        findings,
        source,
        /(?:DATABASE_URL|REDIS_URL)=[^\n]*@(?:127\.0\.0\.1|localhost)(?=[:/]|$)/i,
        `${label} must not use loopback connection URLs inside Compose containers`,
      );
      for (const contract of [
        "/var/www/tecpey-candidates/$EXPECTED_RELEASE_SHA",
        SYSTEMD_CANDIDATE_VERIFICATION,
        SYSTEMD_MIGRATION,
        SYSTEMD_PROMOTION,
        SYSTEMD_RESTART,
        SYSTEMD_RUNTIME_VERIFICATION,
      ]) {
        requireText(
          findings,
          source,
          contract,
          `${label} must separate isolated candidate verification from runtime promotion`,
        );
      }
      const systemdReleaseOrder = [
        SYSTEMD_CANDIDATE_VERIFICATION,
        SYSTEMD_MIGRATION,
        SYSTEMD_PROMOTION,
        SYSTEMD_RESTART,
        SYSTEMD_RUNTIME_VERIFICATION,
      ].map((contract) => source.indexOf(contract));
      if (
        systemdReleaseOrder.some((index) => index < 0) ||
        systemdReleaseOrder.some(
          (index, position) =>
            position > 0 && index <= systemdReleaseOrder[position - 1],
        )
      ) {
        findings.push(
          `${label} must migrate the exact candidate before promotion and restart`,
        );
      }
      reject(
        findings,
        source,
        /^bash scripts\/ubuntu24-preflight\.sh\s*$/m,
        `${label} must select an explicit candidate, migration or runtime verification phase`,
      );
      requireText(
        findings,
        source,
        "Replace every `REPLACE_WITH` value",
        `${label} must require replacement of every production template placeholder`,
      );
    }
  }

  const validatorRequiredKeys = declaredEnvironmentKeys(
    environmentValidator,
    "required",
  );
  if (!validatorRequiredKeys || validatorRequiredKeys.length === 0) {
    findings.push("Production environment validator must expose a governed required-key list");
  }
  const templateKeys = templateEnvironmentKeys(environmentTemplate);
  if (new Set(templateKeys).size !== templateKeys.length) {
    findings.push("Production environment template must not declare duplicate keys");
  }
  for (const key of validatorRequiredKeys ?? []) {
    if (!templateKeys.includes(key)) {
      findings.push(`Production environment template must declare required key: ${key}`);
    }
  }
  for (const key of [
    "NODE_ENV",
    "REDIS_URL",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ]) {
    if (!templateKeys.includes(key)) {
      findings.push(`Production environment template must declare runtime key: ${key}`);
    }
  }
  requireText(
    findings,
    environmentTemplate,
    "REPLACE_WITH",
    "Production environment template must retain fail-closed placeholders",
  );

  requireText(findings, preflight, LOCKFILE_INSTALL, "Ubuntu preflight must use the exact lockfile");
  requireText(findings, preflight, '"$SYSTEMD_NPM_BIN" run env:check', "Ubuntu preflight must validate the production environment");
  requireText(findings, preflight, '"$SYSTEMD_NPM_BIN" run check', "Ubuntu preflight must run static quality gates");
  requireText(findings, preflight, BAKED_BUILD_COMMAND, "Ubuntu preflight must bind the production build to the exact candidate");
  requireText(findings, preflight, EXACT_MIGRATION_COMMAND, "Ubuntu preflight must load the candidate environment for migration");
  requireText(findings, preflight, "dist/run-production-bootstrap.cjs migrate", "Ubuntu preflight must execute the compiled migration authority");
  requireText(findings, preflight, ".next/required-server-files.json", "Ubuntu preflight must read artifact-baked release metadata");
  requireText(findings, preflight, "TECPEY_IMMUTABLE_BUILD_COMMIT_SHA", "Ubuntu preflight must verify the artifact-baked commit");
  requireText(findings, preflight, NODE_VERSION_CONTRACT, "Ubuntu preflight must verify the approved Node.js major");
  requireText(findings, preflight, NPM_VERSION_CONTRACT, "Ubuntu preflight must verify the approved npm major");
  requireText(findings, preflight, SYSTEMD_NODE_BINARY_CONTRACT, "Ubuntu preflight must verify the systemd Node.js binary");
  requireText(findings, preflight, SYSTEMD_NPM_BINARY_CONTRACT, "Ubuntu preflight must use the governed candidate npm binary");
  requireText(findings, preflight, SYSTEMD_COMMAND_PATH_CONTRACT, "Ubuntu preflight must isolate npm from interactive PATH shims");
  requireText(findings, systemdService, SYSTEMD_EXEC_START, "systemd must execute the exact Node.js binary verified by preflight");
  requireText(findings, systemdService, "EnvironmentFile=/var/www/tecpey/.env.production", "systemd must load the governed production environment");
  requireText(findings, preflight, VERIFICATION_PHASE_CONTRACT, "Ubuntu preflight must require an explicit verification phase");
  requireText(findings, preflight, 'candidate|migrate|runtime) ;;', "Ubuntu preflight must separate candidate, migration and runtime verification");
  requireText(findings, preflight, LIVE_WORKTREE_CONTRACT, "Ubuntu preflight must identify the live systemd working tree");
  requireText(findings, preflight, 'candidate_worktree=$(pwd -P)', "Ubuntu preflight must resolve the physical candidate checkout");
  requireText(
    findings,
    preflight,
    LIVE_WORKTREE_PHASE_GUARD,
    "Ubuntu preflight must refuse the live worktree during candidate build and migration",
  );
  requireText(findings, preflight, CLEAN_CHECKOUT_CONTRACT, "Ubuntu preflight must reject tracked and untracked source changes");
  reject(
    findings,
    preflight,
    /git status[^\n]*--untracked-files=no/,
    "Ubuntu preflight must not hide untracked source changes",
  );
  requireText(
    findings,
    buildConfig,
    "TECPEY_IMMUTABLE_BUILD_COMMIT_SHA: immutableBuildCommit",
    "Next config must bake immutable release identity into compiled artifacts",
  );
  requireText(
    findings,
    buildIdentity,
    "TECPEY_LOCAL_SOURCE_ARCHIVE_BUILD",
    "Next config must expose an explicit local source-archive build mode",
  );
  requireText(
    findings,
    buildIdentity,
    LOCAL_SOURCE_ARCHIVE_SENTINEL,
    "Next config must label local source-archive artifacts as unverified",
  );
  const archiveOptInIndex = buildIdentity.indexOf(LOCAL_SOURCE_ARCHIVE_OPT_IN);
  const gitProbeIndex = buildIdentity.indexOf(GIT_BUILD_IDENTITY_PROBE);
  if (
    archiveOptInIndex < 0 ||
    gitProbeIndex < 0 ||
    archiveOptInIndex > gitProbeIndex
  ) {
    findings.push(
      "Next config must honor explicit local source-archive mode before Git discovery",
    );
  }
  for (const [label, source] of localInstallDocs) {
    requireText(
      findings,
      source,
      LOCAL_SOURCE_ARCHIVE_BUILD,
      `${label} must opt in explicitly when building outside a Git checkout`,
    );
    requireText(
      findings,
      source,
      LOCAL_SOURCE_ARCHIVE_SENTINEL,
      `${label} must disclose the unverified artifact identity`,
    );
    requireText(
      findings,
      source,
      "TECPEY_BUILD_COMMIT_SHA",
      `${label} must preserve the exact production build identity contract`,
    );
  }
  requireText(
    findings,
    healthRoute,
    BAKED_HEALTH_COMMIT,
    "Health must report the artifact-baked commit",
  );
  reject(
    findings,
    healthRoute,
    /NEXT_PUBLIC_GIT_COMMIT/,
    "Health must not trust a runtime-overridable public Git commit",
  );
  for (const stage of ["production-deps", "runner"]) {
    requireText(
      findings,
      dockerfile,
      `FROM ${IMMUTABLE_PRODUCTION_RUNTIME} AS ${stage}`,
      `Production ${stage} must use the exact digest-pinned minimal runtime image`,
    );
  }
  requireText(
    findings,
    dockerfile,
    "USER node",
    "Production runtime must use the image-owned non-root identity",
  );
  for (const contract of [
    "ARG TECPEY_BUILD_COMMIT_SHA",
    "ENV TECPEY_BUILD_COMMIT_SHA=$TECPEY_BUILD_COMMIT_SHA",
    "ARG NEXT_PUBLIC_SITE_URL",
    "ARG NEXT_PUBLIC_API_URL",
    "ARG NEXT_PUBLIC_API_BACKEND_URL",
    "ARG NEXT_PUBLIC_API_SOCKET_URL",
  ]) {
    requireText(
      findings,
      dockerfile,
      contract,
      `Docker must receive an exact build commit: ${contract}`,
    );
  }
  requireText(
    findings,
    environmentTemplate,
    "NEXT_PUBLIC_API_URL=https://my.tecpey.ir",
    "Production environment template must point account navigation at the dashboard host",
  );
  for (const publicBuildInput of [
    "NEXT_PUBLIC_SITE_URL=https://tecpey.ir",
    "NEXT_PUBLIC_API_URL=https://my.tecpey.ir",
    "NEXT_PUBLIC_API_BACKEND_URL=https://api.tecpey.ir",
    "NEXT_PUBLIC_API_SOCKET_URL=wss://stream.tecpey.ir",
  ]) {
    requireText(
      findings,
      containerWorkflow,
      publicBuildInput,
      `Published images must bake governed public configuration: ${publicBuildInput}`,
    );
  }
  const pullRequestTriggerStart = containerWorkflow.indexOf("  pull_request:");
  const pushTriggerStart = containerWorkflow.indexOf("  push:", pullRequestTriggerStart);
  const pullRequestTrigger =
    pullRequestTriggerStart >= 0 && pushTriggerStart > pullRequestTriggerStart
      ? containerWorkflow.slice(pullRequestTriggerStart, pushTriggerStart)
      : "";
  for (const path of [
    ".env.production.example",
    "next.config.ts",
    "scripts/resolve-build-identity.ts",
    "scripts/validate-env.mjs",
  ]) {
    requireText(
      findings,
      pullRequestTrigger,
      `- ${path}`,
      `Container workflow must run for build-identity source changes: ${path}`,
    );
  }
  for (const contract of [
    "TECPEY_BUILD_COMMIT_SHA=${{ github.event.pull_request.head.sha || github.sha }}",
    'TECPEY_BUILD_COMMIT_SHA=$CANDIDATE_SHA',
    'TECPEY_BUILD_COMMIT_SHA=$PREVIOUS_SHA',
    "TECPEY_BUILD_COMMIT_SHA=${{ github.sha }}",
  ]) {
    requireText(
      findings,
      containerWorkflow,
      contract,
      `Container workflow must bind every build to an exact commit: ${contract}`,
    );
  }
  const publishJob = yamlBlock(containerWorkflow, 2, "publish");
  const publishNeeds = publishJob
    .split(/\r?\n/)
    .filter((line) => /^    needs:/.test(line));
  if (
    publishNeeds.length !== 1 ||
    publishNeeds[0] !== "    needs: [verify, recovery]"
  ) {
    findings.push(
      "Container publication must depend on both verification and rollback/recovery evidence",
    );
  }

  const verifyJob = yamlBlock(containerWorkflow, 2, "verify");
  const vulnerabilityStep = yamlNamedStepBlock(
    verifyJob,
    "Reject HIGH or CRITICAL runtime vulnerabilities",
  );
  const ignoreUnfixed = vulnerabilityStep
    .split(/\r?\n/)
    .filter((line) => /^          ignore-unfixed:/.test(line));
  if (
    ignoreUnfixed.length !== 1 ||
    ignoreUnfixed[0] !== "          ignore-unfixed: false"
  ) {
    findings.push(
      "Container vulnerability gate must reject unfixed HIGH or CRITICAL findings",
    );
  }
  requireText(findings, preflight, EXACT_RELEASE_CONTRACT, "Ubuntu preflight must resolve the exact candidate commit");
  requireText(findings, preflight, EXACT_RUNTIME_CONTRACT, "Ubuntu preflight must bind readiness to the exact runtime commit");
  for (const readinessContract of [
    'body.health !== "ok"',
    'body.checks?.database !== "ok"',
    'body.checks?.schema !== "current"',
    'body.checks?.redis !== "ok"',
    'body.checks?.runtime !== "ready"',
  ]) {
    requireText(
      findings,
      preflight,
      readinessContract,
      `Ubuntu preflight must enforce runtime readiness contract: ${readinessContract}`,
    );
  }
  requireText(findings, preflight, READINESS_PROBE, "Ubuntu preflight must fail on an unhealthy runtime");
  requireText(findings, preflight, READINESS_ATTEMPTS, "Ubuntu preflight must bound readiness attempts");
  requireText(findings, preflight, READINESS_LOOP, "Ubuntu preflight must retry readiness deterministically");
  reject(
    findings,
    preflight,
    /(?:\bnpm|"\$SYSTEMD_NPM_BIN")\s+(?:install|i)\b/,
    "Ubuntu preflight must not bypass the lockfile with npm install",
  );
  reject(
    findings,
    preflight,
    /\|\|\s*true|process\.exit\(0\)/,
    "Ubuntu preflight must not swallow readiness failure",
  );

  const verificationLines = productionVerification
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (JSON.stringify(verificationLines) !== JSON.stringify(PRODUCTION_VERIFICATION_LINES)) {
    findings.push("Production verification must delegate exactly to the governed host preflight");
  }

  return findings;
}

export function assertProductionHostSupplyChain(sources) {
  const findings = productionHostSupplyChainFindings(sources);
  if (findings.length > 0) {
    throw new Error(`Production host supply-chain policy failed:\n- ${findings.join("\n- ")}`);
  }
}
