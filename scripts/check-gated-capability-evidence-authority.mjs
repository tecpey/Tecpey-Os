import { readFile, readdir } from "node:fs/promises";
import { evaluateDisabledCapabilityAttestation } from "./disabled-capability-attestation-policy.mjs";

const files = {
  evidence: "docs/launch/generated/disabled-capability-attestation-evidence-20260812.json",
  register: "docs/launch/generated/protected-staging-no-go-register-20260810.json",
  candidate: "docs/launch/generated/current-controlled-launch-candidate.json",
  candidateHuman: "docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md",
  packet: "docs/launch/PROTECTED_STAGING_EVIDENCE_PACKET_20260810.md",
  checklist: "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
  packageJson: "package.json",
};

const REQUIRED_SOURCE_FILES = [
  "README.md",
  "README.fa.md",
  "package.json",
  "server.ts",
  "scripts/generate-controlled-launch-release-packet.mjs",
  "scripts/validate-env.mjs",
  "src/data/exchangeCompare.json",
  "src/app/layout.tsx",
  "src/app/en/page.tsx",
  "src/app/en/EnglishLandingClient.tsx",
  "src/app/api/wallet/custody-status/route.ts",
  "src/components/academy/AcademySimulationWorld.tsx",
  "src/components/seo/StructuredData.tsx",
  "src/lib/feature-flags.ts",
  "src/lib/wallet/custody-launch-policy.ts",
];

const REQUIRED_ACCEPTED_BLOCKERS = ["NOG-10", "NOG-11", "NOG-12"];
const PROTECTED_STAGING_BLOCKERS = ["NOG-01", "NOG-02"];
const REQUIRED_OPEN_BLOCKERS = ["NOG-05", "NOG-07", "NOG-09"];
const EVIDENCE_PATH = files.evidence;

async function collectPublicSourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const paths = [];

  for (const entry of entries) {
    const file = `${root}/${entry.name}`;
    if (entry.isDirectory()) {
      if (file === "src/app/api") continue;
      paths.push(...(await collectPublicSourceFiles(file)));
    } else if (/\.(?:ts|tsx|mdx)$/.test(file)) {
      paths.push(file);
    }
  }

  return paths;
}

async function collectI18nMessageFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.json$/.test(entry.name))
    .map((entry) => `${root}/${entry.name}`);
}

function normalized(value) {
  return String(value).replace(/\s+/g, " ");
}

function requireEqual(failures, label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function requireArrayIncludes(failures, label, values, expected) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    failures.push(`${label} must include ${expected}`);
  }
}

function requireArrayIncludesText(failures, label, values, expected) {
  if (!Array.isArray(values) || !values.some((value) => normalized(value).includes(normalized(expected)))) {
    failures.push(`${label} must include text ${expected}`);
  }
}

function requireText(failures, label, source, token) {
  if (!normalized(source).includes(normalized(token))) {
    failures.push(`${label} is missing ${token}`);
  }
}

function rejectText(failures, label, source, token) {
  if (normalized(source).includes(normalized(token))) {
    failures.push(`${label} contains forbidden claim ${token}`);
  }
}

const source = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")])),
);

const evidence = JSON.parse(source.evidence);
const register = JSON.parse(source.register);
const candidate = JSON.parse(source.candidate);
const packageJson = JSON.parse(source.packageJson);
const failures = [];

requireEqual(failures, "evidence.schemaVersion", evidence.schemaVersion, 1);
requireEqual(failures, "evidence.evidenceClass", evidence.evidenceClass, "disabled-capability-attestation-evidence");
requireEqual(
  failures,
  "evidence.decision",
  evidence.decision,
  "NO_GO_NOG_10_11_12_ACCEPTED_LAUNCH_DISABLED_SCOPE_ONLY",
);
requireEqual(failures, "evidence.selectedSha", evidence.selectedSha, candidate.currentCandidate?.sha);
requireEqual(failures, "evidence.sourcePullRequest", evidence.sourcePullRequest, 388);
requireEqual(failures, "evidence.observedVia.provider", evidence.observedVia?.provider, "repository-local-authority");
requireEqual(
  failures,
  "package launch:gated-capability-evidence:check",
  packageJson.scripts?.["launch:gated-capability-evidence:check"],
  "node scripts/check-gated-capability-evidence-authority.mjs",
);

for (const blocker of REQUIRED_ACCEPTED_BLOCKERS) {
  requireArrayIncludes(failures, "evidence.acceptedForBlockers", evidence.acceptedForBlockers, blocker);
  const registerBlocker = register.blockers?.find((entry) => entry.id === blocker);
  requireEqual(failures, `${blocker}.status`, registerBlocker?.status, "accepted");
  requireEqual(failures, `${blocker}.executionState`, registerBlocker?.executionState, "accepted_launch_disabled_attestation");
  requireEqual(failures, `${blocker}.evidence`, registerBlocker?.evidence, EVIDENCE_PATH);
  requireArrayIncludes(
    failures,
    "register.acceptedEvidence",
    register.acceptedEvidence?.map((entry) => entry.id),
    blocker,
  );
  requireArrayIncludes(
    failures,
    "candidate.acceptedEvidence",
    candidate.acceptedEvidence?.map((entry) => entry.id),
    blocker,
  );
}

for (const blocker of [...PROTECTED_STAGING_BLOCKERS, ...REQUIRED_OPEN_BLOCKERS]) {
  requireArrayIncludes(failures, "evidence.notAcceptedForBlockers", evidence.notAcceptedForBlockers, blocker);
}

const protectedStagingStatuses = PROTECTED_STAGING_BLOCKERS.map(
  (blocker) => register.blockers?.find((entry) => entry.id === blocker)?.status,
);
const protectedStagingOpen = protectedStagingStatuses.every((status) => status === "open");
const protectedStagingAccepted = protectedStagingStatuses.every((status) => status === "accepted");
if (!protectedStagingOpen && !protectedStagingAccepted) {
  failures.push(
    `NOG-01/NOG-02 statuses must transition atomically as both open or both accepted, got ${JSON.stringify(
      protectedStagingStatuses,
    )}`,
  );
}

for (const blocker of REQUIRED_OPEN_BLOCKERS) {
  const registerBlocker = register.blockers?.find((entry) => entry.id === blocker);
  requireEqual(failures, `${blocker}.status`, registerBlocker?.status, "open");
}

for (const [name, command] of [
  ["launch:disabled-capabilities:check", "node scripts/check-disabled-capability-attestation.mjs"],
  ["test:disabled-capability-attestation", "node --test scripts/disabled-capability-attestation-policy.test.mjs"],
]) {
  const guard = evidence.observedVia?.guardCommands?.find((entry) => entry.name === name);
  requireEqual(failures, `evidence guard ${name}`, guard?.command, command);
  requireEqual(failures, `evidence guard ${name} disposition`, guard?.disposition, "pass");
}

for (const invariant of [
  "real-money Exchange certification",
  "custody, deposit or withdrawal readiness",
  "public financial reward activation",
  "enterprise activation approval",
  "white-label activation approval",
]) {
  requireArrayIncludes(failures, "evidence.notAcceptedAs", evidence.notAcceptedAs, invariant);
}

for (const invariant of [
  "NOG-10 is accepted only as launch-disabled real-money Exchange scope",
  "NOG-11 is accepted only as product-disabled custody, deposit and withdrawal scope",
  "NOG-12 is accepted only as disabled enterprise, white-label and public rewards scope",
  "This evidence does not authorize real-money Exchange, custody, deposits, withdrawals, enterprise, white-label or public reward activation.",
]) {
  requireArrayIncludesText(failures, "evidence.acceptanceBoundary", evidence.acceptanceBoundary, invariant);
  requireText(failures, "packet", source.packet, invariant);
}

for (const invariant of [
  "Disabled-capability attestation evidence",
  "disabled-capability attestation for NOG-10/NOG-11/NOG-12",
  "Accepted launch-disabled scope for NOG-10/NOG-11/NOG-12",
]) {
  requireText(failures, "candidate ledger", source.candidateHuman, invariant);
}

for (const invariant of [
  EVIDENCE_PATH,
  "Accepted for controlled launch only while real-money Exchange stays launch-disabled",
  "Accepted for controlled launch only while custody, deposits and withdrawals stay product-disabled",
  "Accepted for controlled launch only while enterprise, white-label and public rewards stay disabled",
]) {
  requireText(failures, "packet", source.packet, invariant);
}

for (const invariant of [
  "Disabled-capability attestation is accepted for NOG-10/NOG-11/NOG-12",
  "Controlled launch may proceed only while these surfaces remain disabled",
]) {
  requireText(failures, "checklist", source.checklist, invariant);
}

for (const forbidden of [
  "real-money Exchange is certified",
  "custody is ready",
  "white-label activation is approved",
  "public rewards are active",
]) {
  rejectText(failures, "evidence", source.evidence, forbidden);
  rejectText(failures, "packet", source.packet, forbidden);
}

if (!packageJson.scripts?.["launch:decision:check"]?.includes("npm run launch:gated-capability-evidence:check")) {
  failures.push("package.json: launch:decision:check must enforce gated capability evidence authority");
}

const attestationFiles = [
  ...new Set([
    ...REQUIRED_SOURCE_FILES,
    ...(await collectPublicSourceFiles("src/app")),
    ...(await collectPublicSourceFiles("src/components")),
    ...(await collectI18nMessageFiles("src/i18n/messages")),
  ]),
].sort();
const attestationSources = Object.fromEntries(
  await Promise.all(attestationFiles.map(async (file) => [file, await readFile(file, "utf8")])),
);
failures.push(...evaluateDisabledCapabilityAttestation(attestationSources));

if (failures.length > 0) {
  console.error("Gated capability evidence authority failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Gated capability evidence authority passed: NOG-10, NOG-11 and NOG-12 are accepted only as launch-disabled/product-disabled controlled-launch boundaries.",
);
