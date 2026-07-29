const RETIREMENT_SENTINEL = 'readonly HOST_DEPLOYMENT_RETIRED=1';
const RETIREMENT_EXIT = 'exit "$HOST_DEPLOYMENT_RETIRED"';
const LOCKFILE_INSTALL = "npm ci --no-audit --no-fund";
const READINESS_PROBE =
  "curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/health";

function requireText(findings, source, expected, message) {
  if (!source.includes(expected)) findings.push(message);
}

function reject(findings, source, pattern, message) {
  if (pattern.test(source)) findings.push(message);
}

export function productionHostSupplyChainFindings({
  baseInstaller,
  pm2Deploy,
  preflight,
  deploymentDocs = [],
}) {
  const findings = [];
  const retiredScripts = [
    ["Ubuntu base installer", baseInstaller],
    ["PM2 deploy script", pm2Deploy],
  ];

  for (const [label, source] of retiredScripts) {
    requireText(findings, source, RETIREMENT_SENTINEL, `${label} must be explicitly retired`);
    requireText(findings, source, RETIREMENT_EXIT, `${label} must fail closed`);
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
  }

  requireText(findings, preflight, LOCKFILE_INSTALL, "Ubuntu preflight must use the exact lockfile");
  requireText(findings, preflight, "npm run env:check", "Ubuntu preflight must validate the production environment");
  requireText(findings, preflight, "npm run check", "Ubuntu preflight must run static quality gates");
  requireText(findings, preflight, "npm run build", "Ubuntu preflight must build the production candidate");
  requireText(findings, preflight, READINESS_PROBE, "Ubuntu preflight must fail on an unhealthy runtime");
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

  return findings;
}

export function assertProductionHostSupplyChain(sources) {
  const findings = productionHostSupplyChainFindings(sources);
  if (findings.length > 0) {
    throw new Error(`Production host supply-chain policy failed:\n- ${findings.join("\n- ")}`);
  }
}
