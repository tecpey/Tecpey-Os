#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly SERVICE="tecpey-staging.service"
readonly RELEASE_ROOT="/srv/tecpey/releases"
readonly POLICY_REL="scripts/staging-promotion-policy.mjs"
readonly SMOKE_REL="scripts/run-staging-promotion-smoke.mjs"

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Missing required environment variable: $name" >&2
    exit 64
  fi
}

for name in   RELEASE_SHA   IMAGE_DIGEST   TECPEY_STAGING_ENV_FILE   TECPEY_STAGING_PUBLIC_BASE_URL   TECPEY_STAGING_HEALTH_URL   TECPEY_STAGING_RUN_USER   TECPEY_STAGING_RUN_GROUP   TECPEY_PROMOTION_AUTHORITY_DIR   TECPEY_PROMOTION_RESULT_FILE   TECPEY_PROMOTION_SMOKE_FILE   RUNNER_TEMP; do
  require_env "$name"
done

readonly AUTHORITY_DIR="$(cd "$TECPEY_PROMOTION_AUTHORITY_DIR" && pwd -P)"
readonly RESULT_FILE="$TECPEY_PROMOTION_RESULT_FILE"
readonly SMOKE_FILE="$TECPEY_PROMOTION_SMOKE_FILE"
readonly PREVIOUS_HEALTH_FILE="$RUNNER_TEMP/tecpey-staging-promotion-previous-health.json"
readonly POST_HEALTH_FILE="$RUNNER_TEMP/tecpey-staging-promotion-health.json"
readonly RESTORED_HEALTH_FILE="$RUNNER_TEMP/tecpey-staging-promotion-restored-health.json"
readonly BACKUP_MANIFEST_FILE="$RUNNER_TEMP/tecpey-staging-promotion-backup-manifest.json"
readonly STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
readonly ROLLBACK_DRILL="${TECPEY_STAGING_ROLLBACK_DRILL:-0}"
readonly ALLOW_DOWNGRADE="${TECPEY_STAGING_ALLOW_DOWNGRADE:-0}"
readonly ALLOW_SCHEMA_CHANGE="${TECPEY_STAGING_ALLOW_SCHEMA_CHANGE:-0}"

node --input-type=module <<'NODE'
import { pathToFileURL } from "node:url";
const authority = process.env.TECPEY_PROMOTION_AUTHORITY_DIR;
const policy = await import(pathToFileURL(`${authority}/scripts/staging-promotion-policy.mjs`));
policy.assertExactReleaseSha(process.env.RELEASE_SHA);
policy.assertStagingService("tecpey-staging.service");
policy.assertSafeStagingPublicBaseUrl(process.env.TECPEY_STAGING_PUBLIC_BASE_URL);
policy.assertSafeStagingHealthUrl(process.env.TECPEY_STAGING_HEALTH_URL);
policy.assertSafeEnvironmentFilePath(process.env.TECPEY_STAGING_ENV_FILE);
if (!/^sha256:[0-9a-f]{64}$/.test(process.env.IMAGE_DIGEST ?? "")) {
  throw new Error("staging_promotion_image_digest_invalid");
}
if (!["0", "1"].includes(process.env.TECPEY_STAGING_ROLLBACK_DRILL ?? "0")) {
  throw new Error("staging_promotion_rollback_drill_invalid");
}
if (!["0", "1"].includes(process.env.TECPEY_STAGING_ALLOW_DOWNGRADE ?? "0")) {
  throw new Error("staging_promotion_allow_downgrade_invalid");
}
if (!["0", "1"].includes(process.env.TECPEY_STAGING_ALLOW_SCHEMA_CHANGE ?? "0")) {
  throw new Error("staging_promotion_allow_schema_change_invalid");
}
NODE

test "$(id -un)" = "$TECPEY_STAGING_RUN_USER"
test "$(id -gn)" = "$TECPEY_STAGING_RUN_GROUP"
readonly SERVICE_USER="$(systemctl show "$SERVICE" --property=User --value)"
readonly SERVICE_GROUP="$(systemctl show "$SERVICE" --property=Group --value)"
test -n "$SERVICE_USER"
test "$SERVICE_USER" != "root"
test "$SERVICE_USER" = "$TECPEY_STAGING_RUN_USER"
if [ -n "$SERVICE_GROUP" ]; then
  test "$SERVICE_GROUP" != "root"
  test "$SERVICE_GROUP" = "$TECPEY_STAGING_RUN_GROUP"
fi
test "$(systemctl is-active "$SERVICE")" = "active"
test -d "$RELEASE_ROOT"
test ! -L "$RELEASE_ROOT"
test -w "$RELEASE_ROOT"
readonly MIN_FREE_MB="${TECPEY_STAGING_MIN_FREE_MB:-2048}"
[[ "$MIN_FREE_MB" =~ ^[1-9][0-9]*$ ]]
readonly AVAILABLE_KB="$(df -Pk "$RELEASE_ROOT" | awk 'NR==2 {print $4}')"
[[ "$AVAILABLE_KB" =~ ^[0-9]+$ ]]
if [ "$AVAILABLE_KB" -lt "$((MIN_FREE_MB * 1024))" ]; then
  echo "Insufficient staging release disk space: need at least ${MIN_FREE_MB} MiB free." >&2
  exit 1
fi

readonly CURRENT="$(systemctl show "$SERVICE" --property=WorkingDirectory --value)"
CURRENT_RELEASE_PATH="$CURRENT" node --input-type=module <<'NODE'
import { pathToFileURL } from "node:url";
const policy = await import(pathToFileURL(`${process.env.TECPEY_PROMOTION_AUTHORITY_DIR}/scripts/staging-promotion-policy.mjs`));
policy.assertReleasePath(process.env.CURRENT_RELEASE_PATH);
NODE

test -d "$CURRENT"
test ! -L "$CURRENT"
test "$(git -C "$CURRENT" rev-parse --is-inside-work-tree)" = "true"
readonly PREVIOUS_SHA="$(git -C "$CURRENT" rev-parse HEAD)"
[[ "$PREVIOUS_SHA" =~ ^[0-9a-f]{40}$ ]]
test -z "$(git -C "$CURRENT" status --porcelain --untracked-files=no)"

readonly NEXT="$RELEASE_ROOT/$RELEASE_SHA"

readonly PROTECTED_ENV_RUNNER="$AUTHORITY_DIR/scripts/run-with-protected-runtime-env.mjs"
test -f "$PROTECTED_ENV_RUNNER"

run_with_protected_env() {
  TECPEY_PROTECTED_ENV_EXPECTED_UID="$(id -u)" \
  TECPEY_PROTECTED_ENV_EXPECTED_GID="$(id -g)" \
    /usr/bin/node "$PROTECTED_ENV_RUNNER" "$TECPEY_STAGING_ENV_FILE" -- "$@"
}

write_result() {
  local final_disposition="$1"
  local rollback_disposition="$2"
  local completed_at
  completed_at="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
  PREVIOUS_SHA="$PREVIOUS_SHA"   TARGET_SHA="$RELEASE_SHA"   IMAGE_DIGEST="$IMAGE_DIGEST"   PUBLIC_BASE_URL="$TECPEY_STAGING_PUBLIC_BASE_URL"   STARTED_AT="$STARTED_AT"   COMPLETED_AT="$completed_at"   FINAL_DISPOSITION="$final_disposition"   ROLLBACK_DISPOSITION="$rollback_disposition"   PREVIOUS_PLAN_HASH="$PREVIOUS_PLAN_HASH"   TARGET_PLAN_HASH="$TARGET_PLAN_HASH"   MIGRATION_ROLLBACK_MODE="$MIGRATION_ROLLBACK_MODE"   MIGRATION_CLASSIFICATION_FILE="$MIGRATION_CLASSIFICATION_FILE"   RESULT_FILE="$RESULT_FILE"     node <<'NODE'
const { writeFileSync } = require("node:fs");
const { readFileSync } = require("node:fs");
const migrationClassification = JSON.parse(readFileSync(process.env.MIGRATION_CLASSIFICATION_FILE, "utf8"));
const result = {
  schemaVersion: 1,
  evidenceClass: "tecpey-staging-promotion-runtime-v1",
  environment: "staging",
  previousSha: process.env.PREVIOUS_SHA,
  targetSha: process.env.TARGET_SHA,
  supplyChainImageDigest: process.env.IMAGE_DIGEST,
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
  startedAt: process.env.STARTED_AT,
  completedAt: process.env.COMPLETED_AT,
  finalDisposition: process.env.FINAL_DISPOSITION,
  rollbackDisposition: process.env.ROLLBACK_DISPOSITION,
  previousPlanHash: process.env.PREVIOUS_PLAN_HASH,
  targetPlanHash: process.env.TARGET_PLAN_HASH,
  migrationAuthorityChanges: migrationClassification.migrationAuthorityChanges,
  migrationRollbackMode: process.env.MIGRATION_ROLLBACK_MODE,
};
writeFileSync(process.env.RESULT_FILE, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
NODE
}

run_smoke() {
  node "$AUTHORITY_DIR/$SMOKE_REL"     "$TECPEY_STAGING_PUBLIC_BASE_URL"     "$SMOKE_FILE"
}

capture_health() {
  local expected_sha="$1"
  local output_file="$2"
  curl --fail --silent --show-error --max-time 10     "$TECPEY_STAGING_HEALTH_URL" > "$output_file"
  EXPECTED_SHA="$expected_sha" HEALTH_FILE="$output_file" node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const policy = await import(pathToFileURL(`${process.env.TECPEY_PROMOTION_AUTHORITY_DIR}/scripts/staging-promotion-policy.mjs`));
const payload = JSON.parse(readFileSync(process.env.HEALTH_FILE, "utf8"));
policy.validateStagingHealth(payload, process.env.EXPECTED_SHA);
NODE
}

(
  cd "$CURRENT"
  TECPEY_PREFLIGHT_HEALTH_URL="$TECPEY_STAGING_HEALTH_URL" \
    TECPEY_PREFLIGHT_HEALTH_URL="$TECPEY_STAGING_HEALTH_URL" \
      bash scripts/ubuntu24-preflight.sh runtime
)
capture_health "$PREVIOUS_SHA" "$PREVIOUS_HEALTH_FILE"
readonly PREVIOUS_PLAN_HASH="$(HEALTH_FILE="$PREVIOUS_HEALTH_FILE" node <<'NODE'
const { readFileSync } = require("node:fs");
const payload = JSON.parse(readFileSync(process.env.HEALTH_FILE, "utf8"));
const value = payload?.migrations?.planHash;
if (!/^[0-9a-f]{64}$/.test(value ?? "")) {
  throw new Error("staging_previous_migration_plan_hash_invalid");
}
process.stdout.write(value);
NODE
)"
TARGET_PLAN_HASH="$PREVIOUS_PLAN_HASH"
MIGRATION_ROLLBACK_MODE="app_rollback_safe_no_migration_authority_change"
readonly MIGRATION_CLASSIFICATION_FILE="$RUNNER_TEMP/tecpey-staging-migration-classification.json"
printf '%s\n' '{"mode":"app_rollback_safe_no_migration_authority_change","migrationAuthorityChanges":[]}' > "$MIGRATION_CLASSIFICATION_FILE"
SCHEMA_CUTOVER_ACTIVE=0

if [ "$PREVIOUS_SHA" = "$RELEASE_SHA" ]; then
  echo "Selected release is already active; verifying without mutation."
  cp "$PREVIOUS_HEALTH_FILE" "$POST_HEALTH_FILE"
  run_smoke
  write_result "verified_already_active" "not_needed"
  exit 0
fi

run_with_protected_env /usr/bin/true

git -C "$CURRENT" fetch --no-tags origin main
git -C "$CURRENT" merge-base --is-ancestor "$PREVIOUS_SHA" origin/main
git -C "$CURRENT" merge-base --is-ancestor "$RELEASE_SHA" origin/main
git -C "$CURRENT" cat-file -e "$RELEASE_SHA^{commit}"

IS_DOWNGRADE=0
if ! git -C "$CURRENT" merge-base --is-ancestor "$PREVIOUS_SHA" "$RELEASE_SHA"; then
  IS_DOWNGRADE=1
  if [ "$ALLOW_DOWNGRADE" != "1" ]; then
    echo "Refusing non-monotonic staging promotion; set allow_downgrade explicitly for an intentional older-main release." >&2
    exit 1
  fi
fi

readonly CHANGED_PATHS_FILE="$RUNNER_TEMP/tecpey-staging-changed-paths.bin"
git -C "$CURRENT" diff --name-only -z "$PREVIOUS_SHA" "$RELEASE_SHA" -- > "$CHANGED_PATHS_FILE"
CHANGED_PATHS_FILE="$CHANGED_PATHS_FILE" MIGRATION_CLASSIFICATION_FILE="$MIGRATION_CLASSIFICATION_FILE" node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const policy = await import(pathToFileURL(`${process.env.TECPEY_PROMOTION_AUTHORITY_DIR}/scripts/staging-promotion-policy.mjs`));
const changedPaths = readFileSync(process.env.CHANGED_PATHS_FILE)
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
const classification = policy.classifyMigrationRollbackSafety(changedPaths);
writeFileSync(
  process.env.MIGRATION_CLASSIFICATION_FILE,
  `${JSON.stringify(classification)}\n`,
  { mode: 0o600 },
);
NODE

if [ -e "$NEXT" ]; then
  test -d "$NEXT"
  test ! -L "$NEXT"
  test "$(git -C "$NEXT" rev-parse --is-inside-work-tree)" = "true"
  test "$(git -C "$NEXT" rev-parse HEAD)" = "$RELEASE_SHA"
  test -z "$(git -C "$NEXT" status --porcelain --untracked-files=no)"
else
  git -C "$CURRENT" worktree add --detach "$NEXT" "$RELEASE_SHA"
fi

test ! -e "$NEXT/.env.production"

(
  cd "$NEXT"
  PATH=/usr/bin:/bin /usr/bin/npm ci --no-audit --no-fund
  run_with_protected_env /usr/bin/npm run env:check
  NODE_ENV=production \
  TECPEY_ENV_VALIDATION_SOURCE=process \
  TECPEY_PREFLIGHT_NPM_CI_DONE=1 \
  TECPEY_PREFLIGHT_ENV_CHECK_DONE=1 \
    bash scripts/ubuntu24-preflight.sh candidate
  test ! -e .env.production
)

TARGET_PLAN_HASH="$(cd "$NEXT" && node dist/print-database-migration-plan-hash.cjs)"
[[ "$TARGET_PLAN_HASH" =~ ^[0-9a-f]{64}$ ]]
readonly MIGRATION_AUTHORITY_CHANGE_COUNT="$(MIGRATION_CLASSIFICATION_FILE="$MIGRATION_CLASSIFICATION_FILE" node <<'NODE'
const { readFileSync } = require("node:fs");
const value = JSON.parse(readFileSync(process.env.MIGRATION_CLASSIFICATION_FILE, "utf8"));
if (!Array.isArray(value.migrationAuthorityChanges)) throw new Error("staging_migration_classification_invalid");
process.stdout.write(String(value.migrationAuthorityChanges.length));
NODE
)"
[[ "$MIGRATION_AUTHORITY_CHANGE_COUNT" =~ ^[0-9]+$ ]]
if [ "$TARGET_PLAN_HASH" = "$PREVIOUS_PLAN_HASH" ] && [ "$MIGRATION_AUTHORITY_CHANGE_COUNT" -eq 0 ]; then
  MIGRATION_ROLLBACK_MODE="app_rollback_safe_no_migration_authority_change"
else
  MIGRATION_ROLLBACK_MODE="forward_fix_or_restore_required"
fi

readonly MIGRATION_CUTOVER_DECISION="$(IS_DOWNGRADE="$IS_DOWNGRADE" ALLOW_SCHEMA_CHANGE="$ALLOW_SCHEMA_CHANGE" MIGRATION_ROLLBACK_MODE="$MIGRATION_ROLLBACK_MODE" node --input-type=module <<'NODE'
import { pathToFileURL } from "node:url";
const policy = await import(pathToFileURL(`${process.env.TECPEY_PROMOTION_AUTHORITY_DIR}/scripts/staging-promotion-policy.mjs`));
const decision = policy.evaluateMigrationCutover({
  isDowngrade: process.env.IS_DOWNGRADE === "1",
  allowSchemaChange: process.env.ALLOW_SCHEMA_CHANGE === "1",
  rollbackMode: process.env.MIGRATION_ROLLBACK_MODE,
});
process.stdout.write(decision);
NODE
)"

case "$MIGRATION_CUTOVER_DECISION" in
  allowed) ;;
  reject_schema_change_downgrade)
    write_result "rejected_schema_change_downgrade" "not_permitted_schema_authority_changed"
    echo "Downgrade refused because migration/schema authority differs from the active release; use verified restore or a forward fix instead of running older migration authority." >&2
    exit 1
    ;;
  require_schema_change_approval)
    write_result "rejected_unapproved_schema_change" "not_permitted_schema_authority_changed"
    echo "Schema-changing promotion requires explicit allow_schema_change approval before DDL." >&2
    exit 1
    ;;
  *)
    echo "Unexpected migration cutover decision: $MIGRATION_CUTOVER_DECISION" >&2
    exit 1
    ;;
esac

if [ "$ROLLBACK_DRILL" = "1" ] && [ "$MIGRATION_ROLLBACK_MODE" != "app_rollback_safe_no_migration_authority_change" ]; then
  write_result "rejected_schema_change_rollback_drill" "not_permitted_schema_authority_changed"
  echo "Rollback drill is forbidden because the migration plan changed; use forward-fix or verified restore authority." >&2
  exit 1
fi

schema_cutover_error() {
  local code=$?
  trap - ERR
  if [ "$SCHEMA_CUTOVER_ACTIVE" = "1" ]; then
    set +e
    sudo systemctl stop "$SERVICE"
    set -e
    write_result "halted_forward_fix_required" "not_permitted_schema_authority_changed"
    echo "Schema-changing promotion failed; staging remains stopped pending forward-fix or verified restore." >&2
  fi
  exit "$code"
}
trap schema_cutover_error ERR

if [ "$MIGRATION_ROLLBACK_MODE" = "forward_fix_or_restore_required" ]; then
  sudo systemctl stop "$SERVICE"
  SCHEMA_CUTOVER_ACTIVE=1
fi

(
  cd "$NEXT"
  run_with_protected_env /bin/bash scripts/ubuntu24-preflight.sh migrate
)

readonly FRAGMENT_PATH="$(systemctl show "$SERVICE" --property=FragmentPath --value)"
readonly DROP_IN_PATHS="$(systemctl show "$SERVICE" --property=DropInPaths --value)"

declare -a UNIT_CANDIDATES=()
[ -n "$FRAGMENT_PATH" ] && UNIT_CANDIDATES+=("$FRAGMENT_PATH")
if [ -n "$DROP_IN_PATHS" ]; then
  read -r -a dropins <<< "$DROP_IN_PATHS"
  UNIT_CANDIDATES+=("${dropins[@]}")
fi

declare -a MATCHES=()
for candidate in "${UNIT_CANDIDATES[@]}"; do
  [ -n "$candidate" ] || continue
  UNIT_PATH="$candidate" node --input-type=module <<'NODE'
import { pathToFileURL } from "node:url";
const policy = await import(pathToFileURL(`${process.env.TECPEY_PROMOTION_AUTHORITY_DIR}/scripts/staging-promotion-policy.mjs`));
policy.assertSafeSystemdMutationPath(process.env.UNIT_PATH);
NODE
  test -f "$candidate"
  test ! -L "$candidate"
  if grep -Fq -- "$CURRENT" "$candidate"; then
    MATCHES+=("$candidate")
  fi
done

if [ "${#MATCHES[@]}" -ne 1 ]; then
  echo "Expected exactly one governed staging unit file containing the active release path; found ${#MATCHES[@]}." >&2
  exit 1
fi

readonly TARGET_UNIT="${MATCHES[0]}"
readonly UNIT_BACKUP="$RUNNER_TEMP/tecpey-staging-unit.previous"
readonly UNIT_NEXT="$RUNNER_TEMP/tecpey-staging-unit.next"
cp "$TARGET_UNIT" "$UNIT_BACKUP"

TARGET_UNIT="$TARGET_UNIT" CURRENT_RELEASE_PATH="$CURRENT" NEXT_RELEASE_PATH="$NEXT" OUTPUT_UNIT="$UNIT_NEXT"   node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const policy = await import(pathToFileURL(`${process.env.TECPEY_PROMOTION_AUTHORITY_DIR}/scripts/staging-promotion-policy.mjs`));
policy.assertSafeSystemdMutationPath(process.env.TARGET_UNIT);
const current = policy.assertReleasePath(process.env.CURRENT_RELEASE_PATH);
const next = policy.assertReleasePath(process.env.NEXT_RELEASE_PATH, process.env.RELEASE_SHA);
const source = readFileSync(process.env.TARGET_UNIT, "utf8");
const rendered = policy.replaceReleasePathInUnit(source, current, next);
writeFileSync(process.env.OUTPUT_UNIT, rendered, { mode: 0o600 });
NODE

readonly PREVIOUS_UNIT_DIGEST="sha256:$(sha256sum "$UNIT_BACKUP" | awk '{print $1}')"
readonly TARGET_UNIT_DIGEST="sha256:$(sha256sum "$UNIT_NEXT" | awk '{print $1}')"
TARGET_UNIT="$TARGET_UNIT" PREVIOUS_RELEASE_PATH="$CURRENT" TARGET_RELEASE_PATH="$NEXT" PREVIOUS_UNIT_DIGEST="$PREVIOUS_UNIT_DIGEST" TARGET_UNIT_DIGEST="$TARGET_UNIT_DIGEST" BACKUP_MANIFEST_FILE="$BACKUP_MANIFEST_FILE"   node --input-type=module <<'NODE'
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const policy = await import(pathToFileURL(`${process.env.TECPEY_PROMOTION_AUTHORITY_DIR}/scripts/staging-promotion-policy.mjs`));
policy.assertReleasePath(process.env.PREVIOUS_RELEASE_PATH);
policy.assertReleasePath(process.env.TARGET_RELEASE_PATH, process.env.RELEASE_SHA);
policy.assertSafeSystemdMutationPath(process.env.TARGET_UNIT);
for (const value of [process.env.PREVIOUS_UNIT_DIGEST, process.env.TARGET_UNIT_DIGEST]) {
  if (!/^sha256:[0-9a-f]{64}$/.test(value ?? "")) throw new Error("staging_unit_digest_invalid");
}
const manifest = {
  schemaVersion: 1,
  evidenceClass: "tecpey-staging-promotion-backup-v1",
  previousReleasePath: process.env.PREVIOUS_RELEASE_PATH,
  targetReleasePath: process.env.TARGET_RELEASE_PATH,
  unitPath: process.env.TARGET_UNIT,
  previousUnitDigest: process.env.PREVIOUS_UNIT_DIGEST,
  targetUnitDigest: process.env.TARGET_UNIT_DIGEST,
};
writeFileSync(process.env.BACKUP_MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
NODE

readonly UNIT_UID="$(stat -c %u "$TARGET_UNIT")"
readonly UNIT_GID="$(stat -c %g "$TARGET_UNIT")"
readonly UNIT_MODE="$(stat -c %a "$TARGET_UNIT")"

install_unit_bytes() {
  local source_file="$1"
  local temp_target="${TARGET_UNIT}.tecpey-next.$$"
  sudo install -o "$UNIT_UID" -g "$UNIT_GID" -m "$UNIT_MODE" "$source_file" "$temp_target"
  sudo mv -f "$temp_target" "$TARGET_UNIT"
}

verify_working_directory() {
  local expected="$1"
  test "$(systemctl show "$SERVICE" --property=WorkingDirectory --value)" = "$expected"
}

restore_previous_runtime() {
  echo "Restoring previous staging runtime: $PREVIOUS_SHA"
  install_unit_bytes "$UNIT_BACKUP"
  sudo systemctl daemon-reload
  verify_working_directory "$CURRENT"
  sudo systemctl restart "$SERVICE"
  (
    cd "$CURRENT"
    TECPEY_PREFLIGHT_HEALTH_URL="$TECPEY_STAGING_HEALTH_URL" \
      bash scripts/ubuntu24-preflight.sh runtime
  )
  capture_health "$PREVIOUS_SHA" "$RESTORED_HEALTH_FILE"
}

promote_next_runtime() {
  install_unit_bytes "$UNIT_NEXT"
  sudo systemctl daemon-reload
  verify_working_directory "$NEXT"
  sudo systemctl restart "$SERVICE"
  (
    cd "$NEXT"
    TECPEY_PREFLIGHT_HEALTH_URL="$TECPEY_STAGING_HEALTH_URL" \
      bash scripts/ubuntu24-preflight.sh runtime
  )
  capture_health "$RELEASE_SHA" "$POST_HEALTH_FILE"
  run_smoke
}

MUTATION_ACTIVE=0
rollback_on_error() {
  local code=$?
  trap - ERR
  if [ "$MIGRATION_ROLLBACK_MODE" = "forward_fix_or_restore_required" ]; then
    set +e
    sudo systemctl stop "$SERVICE"
    set -e
    write_result "halted_forward_fix_required" "not_permitted_schema_authority_changed"
    echo "Target failed after a schema-plan change; previous app rollback is forbidden. Staging is stopped pending forward-fix or verified restore." >&2
  elif [ "$MUTATION_ACTIVE" = "1" ]; then
    set +e
    restore_previous_runtime
    local rollback_code=$?
    set -e
    if [ "$rollback_code" -eq 0 ]; then
      write_result "rolled_back_after_failure" "completed"
    else
      write_result "rollback_failed" "armed"
      echo "Automatic staging rollback failed; operator intervention is required." >&2
    fi
  fi
  exit "$code"
}
trap rollback_on_error ERR

MUTATION_ACTIVE=1
promote_next_runtime

ROLLBACK_DISPOSITION="not_needed"
if [ "$ROLLBACK_DRILL" = "1" ]; then
  echo "Executing protected rollback drill before final re-promotion."
  trap - ERR

  if ! restore_previous_runtime; then
    echo "Rollback drill could not prove the previous runtime; attempting to restore the target runtime." >&2
    if promote_next_runtime; then
      write_result "rollback_drill_failed_target_restored" "armed"
    else
      write_result "rollback_drill_failed_runtime_unhealthy" "armed"
    fi
    exit 1
  fi

  if ! promote_next_runtime; then
    echo "Rollback drill proved the previous runtime, but target re-promotion failed; restoring previous runtime." >&2
    if restore_previous_runtime; then
      write_result "rolled_back_after_drill_repromotion_failure" "completed"
    else
      write_result "rollback_failed_after_drill_repromotion_failure" "armed"
    fi
    exit 1
  fi

  trap rollback_on_error ERR
  ROLLBACK_DISPOSITION="completed_and_repromoted"
fi

MUTATION_ACTIVE=0
SCHEMA_CUTOVER_ACTIVE=0
trap - ERR
write_result "promoted" "$ROLLBACK_DISPOSITION"
echo "Staging promotion completed for $RELEASE_SHA."
