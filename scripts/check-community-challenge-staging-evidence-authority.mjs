import { readFile } from "node:fs/promises";

const files = {
  workflow: ".github/workflows/staging-community-challenge-scheduler-evidence.yml",
  evidence: "src/lib/ops/community-challenge-host-evidence.ts",
  collector: "src/lib/ops/community-challenge-host-collector.ts",
  database: "src/lib/ops/community-challenge-host-evidence-db.ts",
  collectCli: "scripts/collect-community-challenge-scheduler-host-evidence.ts",
  verifyCli: "scripts/verify-community-challenge-scheduler-host-evidence.ts",
  schema: "docs/operations/evidence/community-challenge-host-evidence-v1.schema.json",
  runbook: "docs/operations/COMMUNITY_CHALLENGE_STAGING_ACTIVATION.md",
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
  "ops:staging:evidence:collect",
  "ops:staging:evidence:verify",
  "actions/upload-artifact@v4",
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
  "expectedSha256",
  "installedSha256",
  "matchesExpected",
  "host_evidence_health_https_required",
  "MAX_HEALTH_BODY_BYTES",
  "migration0050Applied",
  "staging-alert-verification",
  "spool.pending",
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
  "timing",
  "contentDigest",
  "path.basename(outputFile)",
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
  "cannot target production",
  "TECPEY_HOST_EVIDENCE_KEY",
  "tecpey-staging",
  "Protected GitHub Environment",
  "Synthetic alert probe",
  "Acceptance checklist",
  "pending count is zero",
  "quarantine count is zero",
  "production remains unverified",
]) {
  requireText("runbook", invariant, `activation runbook is missing ${invariant}`);
}

for (const command of [
  '"ops:staging:evidence:collect"',
  '"ops:staging:evidence:verify"',
  '"ops:staging:evidence:check"',
  '"test:ops-staging-evidence"',
]) {
  requireText("package", command, `package command is missing ${command}`);
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
  "Community challenge staging evidence authority passed: protected self-hosted staging execution, exact-release/unit proof, privacy-minimized host evidence, read-only PostgreSQL verification, alert probe isolation and offline digest/freshness checks remain enforced.",
);
