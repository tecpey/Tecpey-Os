import { readFile } from "node:fs/promises";

const files = {
  workflow: ".github/workflows/staging-community-challenge-scheduler-evidence.yml",
  evidence: "src/lib/ops/community-challenge-host-evidence.ts",
  collector: "src/lib/ops/community-challenge-host-collector.ts",
  database: "src/lib/ops/community-challenge-host-evidence-db.ts",
  collectCli: "scripts/collect-community-challenge-scheduler-host-evidence.ts",
  verifyCli: "scripts/verify-community-challenge-scheduler-host-evidence.ts",
  runtimeStub: "scripts/runtime-stubs/server-only/index.js",
  runtimePolicy: "scripts/server-only-cli-runtime-policy.test.mjs",
  schema: "docs/operations/evidence/community-challenge-host-evidence-v1.schema.json",
  runbook: "docs/operations/COMMUNITY_CHALLENGE_STAGING_ACTIVATION.md",
  contract: "docs/operations/STAGING_READINESS_EVIDENCE_CONTRACT.md",
  package: "package.json",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
  ),
);
const normalized = Object.fromEntries(
  Object.entries(source).map(([key, value]) => [key, value.replace(/\s+/g, " ")]),
);
const failures = [];

function requireText(target, token, reason) {
  if (!normalized[target].includes(token.replace(/\s+/g, " "))) {
    failures.push(`${files[target]}: ${reason}`);
  }
}

function rejectText(target, token, reason) {
  if (normalized[target].includes(token.replace(/\s+/g, " "))) {
    failures.push(`${files[target]}: ${reason}`);
  }
}

for (const invariant of [
  "workflow_dispatch:",
  "environment: staging",
  "runs-on: [self-hosted, linux, x64, tecpey-staging]",
  "ref: ${{ inputs.release_sha }}",
  "persist-credentials: false",
  "git merge-base --is-ancestor",
  "TECPEY_EVIDENCE_ENVIRONMENT: staging",
  "TECPEY_EVIDENCE_SOURCE_DIR: ${{ github.workspace }}",
  "TECPEY_STAGING_APP_DIR",
  "TECPEY_STAGING_ENV_FILE",
  "TECPEY_STAGING_OPS_STATE_DIR",
  "TECPEY_STAGING_RUN_USER",
  "TECPEY_STAGING_RUN_GROUP",
  "Configure governed alert CA trust",
  "parseSystemdEnvironmentFile",
  "NODE_EXTRA_CA_CERTS",
  "new X509Certificate",
  "GITHUB_ENV",
  "staging_alert_ca_file_unsafe",
  "governed_alert_ca=configured",
  "ops:staging:evidence:collect",
  "ops:staging:evidence:verify",
  "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
  "retention-days: 7",
]) {
  requireText("workflow", invariant, `protected staging workflow is missing ${invariant}`);
}
for (const forbidden of [
  "pull_request:",
  "push:",
  "environment: production",
  "runs-on: ubuntu-latest",
  "secrets.DATABASE_URL",
  "secrets.TECPEY_OPS_ALERT",
  "continue-on-error: true",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  "rejectUnauthorized: false",
  "--insecure",
  "persist-credentials: true",
]) {
  rejectText("workflow", forbidden, `protected workflow contains forbidden behavior ${forbidden}`);
}

for (const invariant of [
  "COMMUNITY_CHALLENGE_HOST_EVIDENCE_SCHEMA_VERSION = 1",
  "community-challenge-staging-host-evidence-v1",
  "exactKeys",
  "hashCommunityChallengeHostEvidencePayload",
  "contentDigest",
  "host_evidence_digest_mismatch",
  "host_evidence_release_mismatch",
  "host_evidence_stale",
  "host_evidence_latest_run_stale",
  "host_evidence_pending_alerts_present",
  "host_evidence_quarantine_present",
  "host_evidence_alert_probe_missing",
  "rejectSensitiveMaterial",
  "DATABASE_URL",
  "studentId",
  "tenantId",
  "principalId",
]) {
  requireText("evidence", invariant, `evidence contract is missing ${invariant}`);
}
for (const forbidden of [
  "localStorage",
  "sessionStorage",
  "Math.random",
]) {
  rejectText("evidence", forbidden, `evidence contract contains forbidden browser authority ${forbidden}`);
}

for (const invariant of [
  "productionAcknowledged",
  "host_evidence_production_ack_required",
  "isSymbolicLink()",
  "privateRequired",
  "git",
  "rev-parse",
  "--porcelain",
  "systemctl",
  "--property=UnitFileState",
  "--property=NextElapseUSecMonotonic",
  "nextElapseMonotonic",
  "expectedSha256",
  "installedSha256",
  "matchesExpected",
  "host_evidence_health_https_required",
  "MAX_HEALTH_BODY_BYTES",
  "migration0050Applied",
  "raw.runAlertProbe ? await deps.runAlertProbe() : null",
  "const spool = {",
  "pending: await spoolCount",
  "quarantine: await spoolCount",
]) {
  requireText("collector", invariant, `host collector is missing ${invariant}`);
}
for (const forbidden of [
  "exec(",
  "eval(",
  "shell: true",
  "console.log(process.env",
  "localStorage",
  "sessionStorage",
]) {
  rejectText("collector", forbidden, `host collector contains forbidden behavior ${forbidden}`);
}

for (const invariant of [
  'import "server-only"',
  "BEGIN READ ONLY",
  "statement_timeout",
  "lock_timeout",
  "0050_operational_job_evidence.sql",
  "community-challenge-finalization",
  "host_evidence_database_unavailable",
]) {
  requireText("database", invariant, `database evidence reader is missing ${invariant}`);
}
for (const forbidden of [
  "SELECT *",
  "INSERT ",
  "UPDATE ",
  "DELETE ",
  "console.log",
  "console.error",
]) {
  rejectText("database", forbidden, `database evidence reader contains forbidden behavior ${forbidden}`);
}

for (const invariant of [
  "execFile(",
  "maxBuffer: 32 * 1024",
  "redirect: \"error\"",
  "MAX_HEALTH_BODY_BYTES",
  "TECPEY_HOST_EVIDENCE_KEY",
  "I_ACKNOWLEDGE_PRODUCTION_EVIDENCE_COLLECTION",
  "staging-alert-verification",
  "staging_verification_probe",
  'open(temporary, "wx", 0o600)',
  "await handle.sync()",
  "verifyCommunityChallengeHostEvidence",
  'createHash("sha256")',
  "JSON.stringify(evidence",
  "path.basename(outputFile)",
  "parseSystemdEnvironmentFile",
]) {
  requireText("collectCli", invariant, `collector executable is missing ${invariant}`);
}
for (const forbidden of [
  "console.log(runtime",
  "console.log(databaseUrl",
  "console.log(webhookUrl",
  "console.log(bearerToken",
  "source \"$",
  "eval(",
  "shell: true",
]) {
  rejectText("collectCli", forbidden, `collector executable may expose or execute unsafe input: ${forbidden}`);
}

for (const invariant of [
  "timingSafeEqual",
  "host_evidence_file_digest_mismatch",
  "verifyCommunityChallengeHostEvidence",
  "TECPEY_EVIDENCE_EXPECTED_ENVIRONMENT",
  "TECPEY_EVIDENCE_EXPECTED_SHA",
  "TECPEY_EVIDENCE_REQUIRE_ALERT_PROBE",
  "TECPEY_EVIDENCE_MAX_AGE_MS",
  "TECPEY_EVIDENCE_MAX_RUN_AGE_MS",
]) {
  requireText("verifyCli", invariant, `offline verifier is missing ${invariant}`);
}
for (const forbidden of [
  "console.log(content)",
  "console.error(content)",
  "eval(",
]) {
  rejectText("verifyCli", forbidden, `offline verifier contains forbidden behavior ${forbidden}`);
}

const schema = JSON.parse(source.schema);
if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
  failures.push(`${files.schema}: JSON Schema draft is not pinned`);
}
if (schema.additionalProperties !== false || schema.properties?.schemaVersion?.const !== 1) {
  failures.push(`${files.schema}: top-level exact v1 schema is not enforced`);
}
for (const required of [
  "expectedReleaseSha",
  "observedApplicationSha",
  "hostFingerprint",
  "systemd",
  "health",
  "database",
  "spool",
  "alertProbe",
  "contentDigest",
]) {
  if (!schema.required?.includes(required)) {
    failures.push(`${files.schema}: required field is missing: ${required}`);
  }
}

for (const invariant of [
  "does not prove host activation",
  "STAGING_READINESS_EVIDENCE_CONTRACT.md",
  "cannot target production",
  "TECPEY_HOST_EVIDENCE_KEY",
  "tecpey-staging",
  "Protected GitHub Environment",
  "NODE_EXTRA_CA_CERTS",
  "Synthetic alert probe",
  "Acceptance checklist",
  "pending count is zero",
  "quarantine count is zero",
  "production remains unverified",
]) {
  requireText("runbook", invariant, `activation runbook is missing ${invariant}`);
}

for (const invariant of [
  "Issue: #229",
  "GitHub Environment named `staging`",
  "one exact `main` SHA",
  "Required evidence pillars",
  "Exact release identity",
  "Protected runner identity",
  "Immutable host layout",
  "Runtime health",
  "Systemd activation",
  "Database operational evidence",
  "Alert delivery evidence",
  "Privacy and digest integrity",
  "selected SHA is exact, belongs to `origin/main`, and matches the deployed app",
  "self-hosted`, `linux`, `x64`, and `tecpey-staging",
  "health endpoint reports the selected commit and healthy PostgreSQL/Redis",
  "systemd units match release-rendered templates and timers are active",
  "alert spool has zero pending and zero quarantined items",
  "required synthetic alert probe was delivered",
  "production host activation",
  "production backup, restore, or disaster-recovery execution",
  "payment-provider, custody, HSM/MPC, chain-provider, or compliance approval",
]) {
  requireText("contract", invariant, `staging readiness contract is missing ${invariant}`);
}
for (const forbidden of [
  "authorizes production deployment",
  "authorizes real-money",
  "records raw secrets",
]) {
  rejectText("contract", forbidden, `staging readiness contract contains forbidden claim ${forbidden}`);
}

for (const command of [
  '"community:challenge:finalize": "NODE_PATH=scripts/runtime-stubs node --conditions=react-server --import tsx scripts/finalize-community-journal-challenges.ts"',
  '"community:challenge:finalize:scheduled": "NODE_PATH=scripts/runtime-stubs node --conditions=react-server --import tsx scripts/run-community-challenge-finalization-scheduled.ts"',
  '"ops:alerts:deliver": "NODE_PATH=scripts/runtime-stubs node --conditions=react-server --import tsx scripts/deliver-operational-alerts.ts"',
  '"ops:staging:evidence:collect": "NODE_PATH=scripts/runtime-stubs node --conditions=react-server --import tsx scripts/collect-community-challenge-scheduler-host-evidence.ts"',
  '"ops:staging:evidence:verify"',
  '"ops:staging:evidence:check"',
  '"test:ops-staging-evidence"',
  "scripts/server-only-cli-runtime-policy.test.mjs",
]) {
  requireText("package", command, `package command is missing ${command}`);
}

for (const invariant of [
  '"use strict"',
  "Next.js keeps enforcing the real `server-only` marker",
  "module.exports = {};",
]) {
  requireText("runtimeStub", invariant, `server-only CLI runtime stub is missing ${invariant}`);
}

for (const invariant of [
  'path.join(root, "scripts", "runtime-stubs")',
  "env.NODE_PATH = runtimeNodePath",
  '"--conditions=react-server"',
  'assert.doesNotMatch(output, /MODULE_NOT_FOUND|Cannot find module/)',
  '"error":"tecpey_evidence_environment_required"',
]) {
  requireText("runtimePolicy", invariant, `server-only CLI regression guard is missing ${invariant}`);
}
for (const testFile of [
  "community-challenge-host-evidence.test.ts",
  "community-challenge-host-collector.test.ts",
  "community-challenge-host-evidence-postgres.integration.ts",
]) {
  requireText("package", testFile, `permanent host evidence test is missing ${testFile}`);
}

if (failures.length > 0) {
  console.error("Community challenge staging evidence authority failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Community challenge staging evidence authority passed: protected self-hosted staging execution, exact-release/unit proof, privacy-minimized host evidence, read-only PostgreSQL verification, alert probe isolation, offline digest/freshness checks and staging readiness boundaries remain enforced.",
);
