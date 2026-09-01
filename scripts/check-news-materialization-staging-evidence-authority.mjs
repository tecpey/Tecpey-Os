import { readFile } from "node:fs/promises";

const files = {
  workflow: ".github/workflows/staging-news-materialization-evidence.yml",
  verifier: "scripts/verify-news-materialization-last-run.ts",
  envCheck: "scripts/check-news-materialization-env.ts",
  worker: "scripts/run-news-materialization-worker.ts",
  installer: "scripts/install-news-materialization-scheduler.sh",
  service: "deploy/systemd/tecpey-news-materialization.service.in",
  timer: "deploy/systemd/tecpey-news-materialization.timer",
  contract: "docs/architecture/TECPEY_CONTENT_GROWTH_AUTOMATION_CONTRACT.md",
  staging: "docs/operations/STAGING_READINESS_EVIDENCE_CONTRACT.md",
  handoff: "docs/operations/SUPPORT_TEAM_DEPLOYMENT_HANDOFF.md",
  bundle: "scripts/create-support-deployment-bundle.sh",
  bundleVerifier: "scripts/verify-support-deployment-bundle.mjs",
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
  "release_sha:",
  "environment: staging",
  "runs-on: [self-hosted, linux, x64, tecpey-staging]",
  "ref: ${{ inputs.release_sha }}",
  "persist-credentials: false",
  "git merge-base --is-ancestor",
  "TECPEY_STAGING_APP_DIR",
  "TECPEY_STAGING_OPS_STATE_DIR",
  "TECPEY_STAGING_RUN_USER",
  "TECPEY_STAGING_RUN_GROUP",
  "tecpey-news-materialization.service",
  "tecpey-news-materialization.timer",
  "sudo systemctl start tecpey-news-materialization.service",
  "news:materialization:env-check",
  "news:materialization:last-run:verify",
  "news-materialization-last-run.json",
  "sha256sum",
  "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
  "retention-days: 7",
]) {
  requireText("workflow", invariant, `protected staging news workflow is missing ${invariant}`);
}
for (const forbidden of [
  "pull_request:",
  "push:",
  "environment: production",
  "runs-on: ubuntu-latest",
  "secrets.DATABASE_URL",
  "continue-on-error: true",
  "persist-credentials: true",
  "set -x",
]) {
  rejectText("workflow", forbidden, `protected staging news workflow contains forbidden behavior ${forbidden}`);
}

for (const invariant of [
  "NEWS_MATERIALIZATION_JOB",
  "hashOperationalEvidence",
  "validateOperationalJobRunEvidence",
  "timingSafeEqual",
  "TECPEY_NEWS_MATERIALIZATION_LAST_RUN_FILE",
  "TECPEY_NEWS_MATERIALIZATION_MAX_AGE_MS",
  "TECPEY_NEWS_MATERIALIZATION_EXPECTED_LOCALES",
  "news_materialization_last_run_sensitive_material",
  "news_materialization_last_run_not_successful",
  "news_materialization_freshness_empty",
  "evidenceSha256",
]) {
  requireText("verifier", invariant, `last-run verifier is missing ${invariant}`);
}
for (const forbidden of [
  "console.log(content)",
  "console.error(content)",
  "DATABASE_URL:",
  "eval(",
]) {
  rejectText("verifier", forbidden, `last-run verifier may expose or execute unsafe input: ${forbidden}`);
}

for (const invariant of [
  "DATABASE_URL",
  "NEWS_MATERIALIZATION_LOCALES",
  "NEWS_MATERIALIZATION_SOURCE_MODE",
  "TECPEY_OPS_STATE_DIR",
]) {
  requireText("envCheck", invariant, `environment checker is missing ${invariant}`);
}
for (const invariant of [
  "databaseEvidencePersisted",
  "lastRunPath",
  "buildNewsMaterializationFreshnessReport",
  "writeNewsMaterializationLastRun",
  "AbortSignal.timeout(NEWS_FEED_TIMEOUT_MS)",
  "readBoundedResponseText",
  "MAX_NEWS_FEED_BYTES",
]) {
  requireText("worker", invariant, `worker is missing ${invariant}`);
}
for (const invariant of [
  "set -Eeuo pipefail",
  '[[ "$RUN_USER" != "root" ]]',
  "environment_file_world_access_forbidden",
  "environment_file_unsafe",
  "state_directory_symlink_forbidden",
  "systemd-analyze verify",
  "TECPEY_DRY_RUN",
  "tecpey-news-materialization.service",
  "systemctl enable --now tecpey-news-materialization.timer",
]) {
  requireText("installer", invariant, `installer is missing ${invariant}`);
}
for (const forbidden of [
  "cat \"$ENV_FILE\"",
  "source \"$ENV_FILE\"",
  "eval ",
  "chmod 777",
  "RUN_USER=\"root\"",
  "set -x",
]) {
  rejectText("installer", forbidden, `installer contains forbidden behavior ${forbidden}`);
}
for (const invariant of [
  "ExecStartPre=@@NPM_BIN@@ run news:materialization:env-check",
  "ExecStart=@@NPM_BIN@@ run news:materialization:worker",
  "NoNewPrivileges=true",
  "ProtectSystem=strict",
  "ReadWritePaths=@@STATE_DIR@@",
]) {
  requireText("service", invariant, `systemd service is missing ${invariant}`);
}
for (const invariant of [
  "OnBootSec=2min",
  "OnUnitActiveSec=10min",
  "Persistent=true",
  "RandomizedDelaySec=45",
  "AccuracySec=20s",
  "Unit=tecpey-news-materialization.service",
]) {
  requireText("timer", invariant, `systemd timer is missing ${invariant}`);
}
rejectText("timer", "OnCalendar=", "systemd timer must use the governed activation-relative cadence");
for (const invariant of [
  "staging-news-materialization-evidence.yml",
  "news-materialization-last-run.json",
  "protected staging evidence",
]) {
  requireText("contract", invariant, `content growth contract is missing ${invariant}`);
}
for (const invariant of [
  "News materialization evidence",
  "tecpey-news-materialization.service",
  "news-materialization-last-run.json",
]) {
  requireText("staging", invariant, `staging evidence contract is missing ${invariant}`);
}
for (const invariant of [
  "Optional News Materialization Timer",
  "npm run news:materialization:install",
  "TECPEY_DRY_RUN=1",
  "TECPEY_NEWS_MATERIALIZATION_LAST_RUN_FILE",
  "news-materialization-last-run.json",
  "npm run support:bundle:verify",
  "A queued GitHub deployment alone is not accepted as staging proof.",
]) {
  requireText("handoff", invariant, `support handoff is missing ${invariant}`);
}
for (const invariant of [
  "scripts/install-news-materialization-scheduler.sh",
  "deploy/systemd/tecpey-news-materialization.service.in",
  "docs/assets/brand/brand-assets.json",
  "support:bundle:verify",
]) {
  requireText("bundle", invariant, `support bundle manifest is missing ${invariant}`);
}
for (const invariant of [
  "SUPPORT_BUNDLE_MANIFEST.txt",
  "deploy/systemd/tecpey-news-materialization.service.in",
  "scripts/install-news-materialization-scheduler.sh",
  "docs/assets/brand/brand-assets.json",
  "Never add .env.production",
]) {
  requireText("bundleVerifier", invariant, `support bundle verifier is missing ${invariant}`);
}
for (const invariant of [
  "\"news:materialization:install\"",
  "\"news:materialization:staging-evidence:check\"",
  "\"news:materialization:last-run:verify\"",
  "\"support:bundle:verify\"",
  "news:materialization:staging-evidence:check && npm run launch:decision:check",
]) {
  requireText("package", invariant, `package scripts are missing ${invariant}`);
}

if (failures.length) {
  console.error("News materialization staging evidence authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("News materialization staging evidence authority check passed.");
