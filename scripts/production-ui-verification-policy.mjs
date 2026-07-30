import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourcePaths = {
  healthCheck: "scripts/check-health.mjs",
  runtimeSmoke: "scripts/check-ui-runtime.mjs",
  routeQa: "scripts/qa-route-check.mjs",
  staticQa: "scripts/qa-production-static.mjs",
  communityHub: "src/components/academy/community/CommunityHub.tsx",
};

export function productionUiVerificationFindings(sources) {
  const findings = [];
  const requireSource = (name, pattern, message) => {
    if (!pattern.test(sources[name] ?? "")) findings.push(`${name}: ${message}`);
  };
  const rejectSource = (name, pattern, message) => {
    if (pattern.test(sources[name] ?? "")) findings.push(`${name}: ${message}`);
  };

  requireSource(
    "healthCheck",
    /MAX_HEALTH_RESPONSE_BYTES\s*=\s*64\s*\*\s*1024/,
    "health response size must be bounded",
  );
  requireSource(
    "healthCheck",
    /redirect:\s*"error"/,
    "health redirects must fail closed",
  );
  requireSource(
    "healthCheck",
    /AbortSignal\.timeout\(10_000\)/,
    "health requests must have a fixed deadline",
  );
  requireSource(
    "healthCheck",
    /pathname\.replace\(\/\\\/\$\/,\s*""\)\s*!==\s*"\/api\/health"/,
    "the probe must target the readiness endpoint exactly",
  );
  requireSource(
    "healthCheck",
    /parsed\.search\s*\|\|\s*parsed\.hash/,
    "health URLs must reject query and fragment ambiguity",
  );
  for (const readinessContract of [
    /payload\.ok\s*!==\s*true/,
    /payload\.health\s*!==\s*"ok"/,
    /payload\.checks\?\.database\s*!==\s*"ok"/,
    /payload\.checks\?\.schema\s*!==\s*"current"/,
    /payload\.checks\?\.redis\s*!==\s*"ok"/,
    /payload\.checks\?\.runtime\s*!==\s*"ready"/,
  ]) {
    requireSource(
      "healthCheck",
      readinessContract,
      "the complete readiness payload contract must be enforced",
    );
  }
  rejectSource(
    "healthCheck",
    /await\s+response\.json\(\)/,
    "unbounded JSON parsing is forbidden",
  );

  requireSource(
    "runtimeSmoke",
    /url\.origin\s*!==\s*baseUrl/,
    "stylesheet retrieval must remain same-origin",
  );
  requireSource(
    "runtimeSmoke",
    /maxRuntimeEvidenceBytes\s*=\s*2_000_000/,
    "runtime HTML and stylesheet evidence must have a fixed size bound",
  );
  requireSource(
    "runtimeSmoke",
    /readBoundedText\(response,\s*"root HTML"\)/,
    "root HTML must use bounded streaming",
  );
  requireSource(
    "runtimeSmoke",
    /readBoundedText\(response,\s*`stylesheet \$\{url\}`\)/,
    "stylesheet evidence must use bounded streaming",
  );

  requireSource(
    "routeQa",
    /export function collectRouteQa/,
    "route discovery must expose one shared authority",
  );
  requireSource(
    "routeQa",
    /isTestSource\(file\)/,
    "test fixtures must not be interpreted as production navigation",
  );
  requireSource(
    "routeQa",
    /\\\[\\\[\\\.\\\.\\\./,
    "optional catch-all routes must be modeled",
  );
  requireSource(
    "routeQa",
    /\\\[\\\.\\\.\\\./,
    "required catch-all routes must be modeled",
  );

  requireSource(
    "staticQa",
    /import\s*\{\s*collectRouteQa\s*\}/,
    "static QA must consume the shared route authority",
  );
  requireSource(
    "staticQa",
    /isTestSource\(file\)/,
    "test fixtures must not be interpreted as production copy",
  );
  requireSource(
    "staticQa",
    /artifacts\/qa\/production-static-report\.json/,
    "runtime QA output must stay outside tracked evidence",
  );
  rejectSource(
    "staticQa",
    /docs\/internal-qa\/QA_STATIC_PRODUCTION_REPORT\.json/,
    "static QA must not overwrite tracked historical evidence",
  );
  rejectSource(
    "staticQa",
    /TODO\|FIXME/,
    "generic debt markers are not production-copy findings",
  );

  requireSource(
    "communityHub",
    /href="\/academy\/community\/leaderboards"/,
    "community leaderboard navigation must target a real route",
  );
  requireSource(
    "communityHub",
    /href="\/academy\/community\/instructor"/,
    "community instructor navigation must target a real route",
  );
  rejectSource(
    "communityHub",
    /href="\/academy\/community\/(?:leaderboard|instructors)"/,
    "known nonexistent community routes are forbidden",
  );

  return findings;
}

export function checkProductionUiVerificationRepository(root = process.cwd()) {
  const sources = Object.fromEntries(
    Object.entries(sourcePaths).map(([name, relativePath]) => [
      name,
      fs.readFileSync(path.join(root, relativePath), "utf8"),
    ]),
  );
  return productionUiVerificationFindings(sources);
}

function main() {
  const findings = checkProductionUiVerificationRepository();
  if (findings.length > 0) {
    console.error(
      "Production UI verification policy failed:\n- " + findings.join("\n- "),
    );
    process.exitCode = 1;
    return;
  }
  console.log("Production UI verification policy passed.");
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main();
}
