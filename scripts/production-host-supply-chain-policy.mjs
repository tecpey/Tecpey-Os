const RETIREMENT_SENTINEL = 'readonly HOST_DEPLOYMENT_RETIRED=1';
const RETIREMENT_EXIT = 'exit "$HOST_DEPLOYMENT_RETIRED"';
const LOCKFILE_INSTALL = "npm ci --no-audit --no-fund";
const READINESS_PROBE =
  "curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/health";
const READINESS_ATTEMPTS = "readonly READINESS_ATTEMPTS=5";
const READINESS_LOOP = "for attempt in 1 2 3 4 5; do";
const NODE_VERSION_CONTRACT = "readonly EXPECTED_NODE_MAJOR=22";
const NPM_VERSION_CONTRACT = "readonly EXPECTED_NPM_MAJOR=10";
const EXACT_RELEASE_CONTRACT = "expected_release_sha=$(git rev-parse HEAD)";
const EXACT_RUNTIME_CONTRACT = "body.build?.commit !== expected";
const COMPOSE_DATABASE_URL =
  "DATABASE_URL=postgresql://tecpey:SECRET_FROM_APPROVED_MANAGER@postgres:5432/tecpey";
const COMPOSE_REDIS_URL =
  "REDIS_URL=redis://:SECRET_FROM_APPROVED_MANAGER@redis:6379";
const PRODUCTION_VERIFICATION_LINES = [
  "#!/usr/bin/env bash",
  "set -euo pipefail",
  'cd "$(dirname "$0")"',
  "exec bash scripts/ubuntu24-preflight.sh",
];

function requireText(findings, source, expected, message) {
  if (!source.includes(expected)) findings.push(message);
}

function reject(findings, source, pattern, message) {
  if (pattern.test(source)) findings.push(message);
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
  deploymentDocs = [],
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
    requireText(
      findings,
      source,
      "TECPEY_IMAGE_DIGEST",
      `${label} must require the reviewed image digest`,
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
    }
  }

  requireText(findings, preflight, LOCKFILE_INSTALL, "Ubuntu preflight must use the exact lockfile");
  requireText(findings, preflight, "npm run env:check", "Ubuntu preflight must validate the production environment");
  requireText(findings, preflight, "npm run check", "Ubuntu preflight must run static quality gates");
  requireText(findings, preflight, "npm run build", "Ubuntu preflight must build the production candidate");
  requireText(findings, preflight, NODE_VERSION_CONTRACT, "Ubuntu preflight must verify the approved Node.js major");
  requireText(findings, preflight, NPM_VERSION_CONTRACT, "Ubuntu preflight must verify the approved npm major");
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
    /\bnpm\s+(?:install|i)\b/,
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
