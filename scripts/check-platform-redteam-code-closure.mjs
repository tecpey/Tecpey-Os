import { readFile } from "node:fs/promises";

const REPORT_PATH = "docs/launch/PLATFORM_REDTEAM_CODE_CLOSURE_ISSUE_100_20260820.md";
const CI_PATH = ".github/workflows/ci.yml";

const REQUIRED_RELEASE_GATES = [
  "browser:persistence:check",
  "test:browser-persistence",
  "auth:check",
  "test:auth-session",
  "ai:redteam:check",
  "custody:check",
  "test:custody-gate",
  "withdrawals:check",
  "test:withdrawal-admission",
  "wallet:precision:check",
  "test:wallet-precision",
  "risk:check",
  "test:risk-enforcement",
  "audit:sensitive:check",
  "test:sensitive-mutation-audit",
  "community:reputation:check",
  "test:community-reputation",
  "community:journal-discipline:check",
  "test:community-journal-discipline",
  "redis:safety:check",
  "test:redis-safety",
  "offline:check",
  "tenant:isolation:check",
  "test:offline-sync",
  "academy:progress:check",
  "test:academy-progress",
  "crm:check",
  "test:crm-leads",
  "exchange:check",
  "test:exchange-order-authority",
  "test:exchange-reconciliation",
  "api:security:check",
  "test:api-security-manifest",
  "test:api-command-idempotency",
  "notifications:check",
  "notifications:runtime:check",
  "notifications:producers:check",
  "notifications:domain:check",
  "notifications:copy-safety:check",
  "launch:decision:check",
  "product:global-readiness:check",
  "release:coverage:check",
  "security:markers:check",
];

const EXTERNAL_ISSUES = [365, 407, 408, 409, 410, 110];
const OPEN_PROGRAM_ISSUES = [13, 20, 26, 50, 80, 82, 83, 84, 85, 106, 160, 226, 229];

const failures = [];

function requireText(label, source, expected) {
  if (!source.includes(expected)) failures.push(`${label} missing: ${expected}`);
}

function requireNormalizedText(label, source, expected) {
  const normalizedSource = source.replace(/\s+/g, " ");
  const normalizedExpected = expected.replace(/\s+/g, " ");
  if (!normalizedSource.includes(normalizedExpected)) failures.push(`${label} missing: ${expected}`);
}

const report = await readFile(REPORT_PATH, "utf8");
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const ci = await readFile(CI_PATH, "utf8");

requireText("report", report, "Authority: `platform-redteam-code-closure-v1`");
requireText("report", report, "Issue: #100");
requireText("report", report, "Decision: `CODE_FINDINGS_CLOSED_LAUNCH_REMAINS_NO_GO`");
requireText("report", report, "Closed scope: RT-01..RT-12 code findings.");
for (const boundary of ["public launch", "financial activation", "custody activation"]) {
  requireNormalizedText("report", report, boundary);
}

for (let index = 1; index <= 12; index += 1) {
  requireText("report", report, `RT-${String(index).padStart(2, "0")}`);
}

for (const issue of EXTERNAL_ISSUES) {
  requireText("report", report, `#${issue}`);
}

for (const issue of OPEN_PROGRAM_ISSUES) {
  requireText("report", report, `#${issue}`);
}

for (const forbidden of [
  "Decision: GO",
  "PUBLIC_GO",
  "FINANCIAL_GO",
  "enterprise activation approved",
  "custody activation approved",
  "real-money activation approved",
]) {
  if (report.includes(forbidden)) failures.push(`report must not claim ${forbidden}`);
}

const scripts = packageJson.scripts ?? {};
if (scripts["platform:redteam:closure:check"] !== "node scripts/check-platform-redteam-code-closure.mjs") {
  failures.push("package.json must expose platform:redteam:closure:check");
}

const releaseCheck = scripts["release:check"] ?? "";
requireText("release:check", releaseCheck, "npm run platform:redteam:closure:check");
for (const gate of REQUIRED_RELEASE_GATES) {
  requireText("release:check", releaseCheck, `npm run ${gate}`);
}

requireText("ci", ci, "npm run platform:redteam:closure:check");

if (failures.length > 0) {
  console.error("Platform red-team code closure check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Platform red-team code closure check passed: #100 code findings are closed without moving external launch gates.");