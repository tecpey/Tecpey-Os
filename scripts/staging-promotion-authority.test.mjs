import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const workflow = readFileSync(".github/workflows/protected-staging-promotion.yml", "utf8");
const promotion = readFileSync("scripts/promote-staging-release.sh", "utf8");
const policy = readFileSync("scripts/staging-promotion-policy.mjs", "utf8");
const packageJson = readFileSync("package.json", "utf8");

function requireText(source, token, label) {
  assert.ok(source.includes(token), `${label} is missing: ${token}`);
}

test("protected staging promotion workflow preserves exact-SHA and protected-environment authority", () => {
  for (const token of [
    "workflow_dispatch:",
    "release_sha:",
    "I_APPROVE_STAGING_PROMOTION",
    "rollback_drill:",
    "allow_downgrade:",
    "allow_schema_change:",
    "permissions:",
    "contents: read",
    "packages: read",
    "attestations: read",
    "cancel-in-progress: false",
    "git merge-base --is-ancestor",
    "environment: staging",
    "runs-on: [self-hosted, linux, x64, tecpey-staging]",
    "TECPEY_STAGING_ENV_FILE",
    "TECPEY_STAGING_PUBLIC_BASE_URL",
    "TECPEY_STAGING_HEALTH_URL",
    "TECPEY_STAGING_RUN_USER",
    "TECPEY_STAGING_RUN_GROUP",
    "protected-staging-promotion-",
  ]) {
    requireText(workflow, token, "promotion workflow");
  }
  assert.doesNotMatch(
    workflow,
    /uses:\s+[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@(?![0-9a-f]{40}\b)/,
    "all external actions must be pinned to immutable commit SHAs",
  );
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/, "promotion must fail closed");
  assert.doesNotMatch(
    workflow,
    /systemctl[^\n]*(?:production|tecpey\.service)|\/var\/www\/tecpey|\/srv\/tecpey\/production/i,
    "workflow must not contain a production service/path mutation",
  );
});

test("supply verification binds signature and provenance to the main supply-chain workflow", () => {
  for (const token of [
    "ghcr.io/tecpey/tecpey-os:",
    "cosign verify",
    "container-supply-chain.yml@refs/heads/main",
    "--certificate-oidc-issuer 'https://token.actions.githubusercontent.com'",
    "gh attestation verify",
    "--repo tecpey/Tecpey-Os",
    "--signer-workflow tecpey/Tecpey-Os/.github/workflows/container-supply-chain.yml",
    "--source-ref refs/heads/main",
    '--source-digest "$RELEASE_SHA"',
    "--deny-self-hosted-runners",
  ]) {
    requireText(workflow, token, "supply verification");
  }
});

test("host promotion uses immutable release paths, existing preflight and bounded rollback", () => {
  for (const token of [
    'readonly SERVICE="tecpey-staging.service"',
    'readonly RELEASE_ROOT="/srv/tecpey/releases"',
    'systemctl show "$SERVICE" --property=WorkingDirectory --value',
    'git -C "$CURRENT" merge-base --is-ancestor "$RELEASE_SHA" origin/main',
    'git -C "$CURRENT" worktree add --detach "$NEXT" "$RELEASE_SHA"',
    'install -m 0600 "$TECPEY_STAGING_ENV_FILE" "$NEXT/.env.production"',
    "bash scripts/ubuntu24-preflight.sh candidate",
    "bash scripts/ubuntu24-preflight.sh migrate",
    "bash scripts/ubuntu24-preflight.sh runtime",
    "Expected exactly one governed staging unit file",
    'sudo systemctl daemon-reload',
    'sudo systemctl restart "$SERVICE"',
    "restore_previous_runtime",
    "run-staging-promotion-smoke.mjs",
    "completed_and_repromoted",
    "verified_already_active",
    "dist/print-database-migration-plan-hash.cjs",
    "forward_fix_or_restore_required",
    "not_permitted_schema_authority_changed",
    "TECPEY_STAGING_ALLOW_DOWNGRADE",
    "TECPEY_STAGING_ALLOW_SCHEMA_CHANGE",
    "evaluateMigrationCutover",
    "reject_schema_change_downgrade",
    "require_schema_change_approval",
    "diff --name-only -z",
    "MIGRATION_AUTHORITY_CHANGE_COUNT",
    "staging_environment_file_unsafe",
    '"$TECPEY_STAGING_HEALTH_URL"',
    "Schema-changing promotion failed; staging remains stopped",
    'sudo systemctl stop "$SERVICE"',
  ]) {
    requireText(promotion, token, "promotion script");
  }
  assert.match(
    promotion,
    /Refusing non-monotonic staging promotion/,
    "older-main promotion must require explicit downgrade intent",
  );
  assert.match(
    promotion,
    /\(stat\.mode & 0o007\) !== 0[\s\S]*\(stat\.mode & 0o030\) !== 0/,
    "environment file must reject world access and group write/execute permissions",
  );
  assert.doesNotMatch(promotion, /\brm\s+-rf\b/, "promotion must not recursively delete releases");
  assert.doesNotMatch(
    promotion,
    /tecpey-production\.service|\/srv\/tecpey\/production/i,
    "promotion script must not target production",
  );
  execFileSync("bash", ["-n", "scripts/promote-staging-release.sh"], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
});

test("promotion policy owns route matrix and production-host denial", () => {
  for (const token of [
    'STAGING_SERVICE = "tecpey-staging.service"',
    'RELEASE_ROOT = "/srv/tecpey/releases"',
    '"/academy/profile"',
    '"/en/academy/profile"',
    '"/academy/market-intelligence"',
    '"/en/academy/market-intelligence"',
    '"/academy/trading-arena"',
    '"/en/academy/trading-arena"',
    "staging_public_base_url_must_not_target_production",
    "staging_smoke_redirected_off_staging_origin",
    "staging_health_commit_mismatch",
    "staging_health_url_must_not_target_production",
    "staging_health_url_host_not_allowed",
    "classifyMigrationRollbackSafety",
    "promotion_migration_rollback_mode_mismatch",
    "evaluateMigrationCutover",
  ]) {
    requireText(policy, token, "promotion policy");
  }
});


test("production build bundles the migration plan hash probe used before DDL", () => {
  requireText(
    packageJson,
    "scripts/print-database-migration-plan-hash.ts",
    "build:server migration plan probe",
  );
  requireText(
    promotion,
    "dist/print-database-migration-plan-hash.cjs",
    "promotion migration plan probe",
  );
  assert.match(
    promotion,
    /if \[ "\$TARGET_PLAN_HASH" = "\$PREVIOUS_PLAN_HASH" \]/,
    "promotion must compare canonical plan hashes before selecting rollback mode",
  );
});
