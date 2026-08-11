import { readFile } from "node:fs/promises";

const files = {
  workflow: ".github/workflows/protected-staging-env-evidence.yml",
  collectCli: "scripts/collect-protected-staging-env-evidence.mjs",
  verifyCli: "scripts/verify-protected-staging-env-evidence.mjs",
  runbook: "docs/operations/PROTECTED_STAGING_ACTIVATION_ENV_EVIDENCE_RUNBOOK_20260810.md",
  request: "docs/launch/generated/protected-staging-env-evidence-request-20260810.json",
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
  "TECPEY_STAGING_ENV_EVIDENCE_EXPECTED_SHA: ${{ inputs.release_sha }}",
  "TECPEY_STAGING_ENV_EVIDENCE_SOURCE: ${{ inputs.environment_source }}",
  "TECPEY_STAGING_ENV_EVIDENCE_OUTPUT: ${{ runner.temp }}/tecpey-staging-env-evidence.json",
  "ops:staging:env-evidence:collect",
  "ops:staging:env-evidence:verify",
  "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
  "retention-days: 7",
]) {
  requireText("workflow", invariant, `protected env workflow is missing ${invariant}`);
}
for (const forbidden of [
  "pull_request:",
  "push:",
  "environment: production",
  "runs-on: ubuntu-latest",
  "secrets.DATABASE_URL",
  "secrets.TECPEY_",
  "continue-on-error: true",
  "persist-credentials: true",
  "cat \"$TECPEY_STAGING_ENV_FILE\"",
  "printenv",
]) {
  rejectText("workflow", forbidden, `protected env workflow contains forbidden behavior ${forbidden}`);
}

for (const invariant of [
  "protected-staging-env-evidence-v1",
  "protected_host_env_file",
  "service_manager_preloaded_environment",
  "parseProtectedEnvFile",
  "execFile(",
  "maxBuffer: MAX_OUTPUT_BYTES",
  "failingKeyNamesOnly",
  "rawOutputCaptured: false",
  "rawValuesUploaded: false",
  "credentialBearingUrlsUploaded: false",
  "hostIdentifiersUploaded: false",
  "createHash(\"sha256\")",
  "open(temporary, \"wx\", 0o600)",
]) {
  requireText("collectCli", invariant, `collector is missing ${invariant}`);
}
for (const forbidden of [
  "console.log(process.env",
  "console.log(result.commandResult.output)",
  "console.error(result.commandResult.output)",
  "shell: true",
  "eval(",
  "source \"$",
]) {
  rejectText("collectCli", forbidden, `collector may expose or execute unsafe input: ${forbidden}`);
}

for (const invariant of [
  "timingSafeEqual",
  "protected_staging_env_evidence_digest_mismatch",
  "protected_staging_env_evidence_sensitive_material",
  "protected_staging_env_evidence_not_accepted",
  "protected_staging_env_evidence_failures_present",
  "TECPEY_STAGING_ENV_EVIDENCE_EXPECTED_SHA",
]) {
  requireText("verifyCli", invariant, `verifier is missing ${invariant}`);
}
for (const forbidden of [
  "console.log(content)",
  "console.error(content)",
  "eval(",
]) {
  rejectText("verifyCli", forbidden, `verifier contains forbidden behavior ${forbidden}`);
}

for (const invariant of [
  "Workflow: Protected Staging Env Evidence",
  "environment_source",
  "tecpey-staging-env-evidence.json",
  "tecpey-staging-env-evidence.json.sha256",
  "tecpey-staging-env-evidence-verification.json",
]) {
  requireText("runbook", invariant, `runbook is missing executable NOG-02 workflow guidance: ${invariant}`);
}
for (const invariant of [
  "\"workflowName\": \"Protected Staging Env Evidence\"",
  "\"environment_source\": \"protected_host_env_file\"",
  "\"tecpey-staging-env-evidence.json\"",
  "\"tecpey-staging-env-evidence.json.sha256\"",
  "\"tecpey-staging-env-evidence-verification.json\"",
]) {
  requireText("request", invariant, `generated request is missing machine-readable env evidence detail: ${invariant}`);
}
for (const invariant of [
  "\"ops:staging:env-evidence:collect\"",
  "\"ops:staging:env-evidence:verify\"",
  "\"ops:staging:env-evidence:check\"",
]) {
  requireText("package", invariant, `package scripts are missing ${invariant}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Protected staging env evidence authority passed.");
}
