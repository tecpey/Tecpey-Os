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

for name in   RELEASE_SHA   IMAGE_DIGEST   TECPEY_STAGING_ENV_FILE   TECPEY_STAGING_PUBLIC_BASE_URL   TECPEY_STAGING_RUN_USER   TECPEY_STAGING_RUN_GROUP   TECPEY_PROMOTION_AUTHORITY_DIR   TECPEY_PROMOTION_RESULT_FILE   TECPEY_PROMOTION_SMOKE_FILE; do
  require_env "$name"
done

readonly AUTHORITY_DIR="$(cd "$TECPEY_PROMOTION_AUTHORITY_DIR" && pwd -P)"
readonly RESULT_FILE="$TECPEY_PROMOTION_RESULT_FILE"
readonly SMOKE_FILE="$TECPEY_PROMOTION_SMOKE_FILE"
readonly STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
readonly ROLLBACK_DRILL="${TECPEY_STAGING_ROLLBACK_DRILL:-0}"

node --input-type=module <<'NODE'
import { pathToFileURL } from "node:url";
const authority = process.env.TECPEY_PROMOTION_AUTHORITY_DIR;
const policy = await import(pathToFileURL(`${authority}/scripts/staging-promotion-policy.mjs`));
policy.assertExactReleaseSha(process.env.RELEASE_SHA);
policy.assertStagingService("tecpey-staging.service");
policy.assertSafeStagingPublicBaseUrl(process.env.TECPEY_STAGING_PUBLIC_BASE_URL);
policy.assertSafeEnvironmentFilePath(process.env.TECPEY_STAGING_ENV_FILE);
if (!/^sha256:[0-9a-f]{64}$/.test(process.env.IMAGE_DIGEST ?? "")) {
  throw new Error("staging_promotion_image_digest_invalid");
}
if (!["0", "1"].includes(process.env.TECPEY_STAGING_ROLLBACK_DRILL ?? "0")) {
  throw new Error("staging_promotion_rollback_drill_invalid");
}
NODE

test "$(id -un)" = "$TECPEY_STAGING_RUN_USER"
test "$(id -gn)" = "$TECPEY_STAGING_RUN_GROUP"
test "$(systemctl is-active "$SERVICE")" = "active"
test -d "$RELEASE_ROOT"
test ! -L "$RELEASE_ROOT"
test -w "$RELEASE_ROOT"

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

validate_environment_file() {
  ENV_FILE="$TECPEY_STAGING_ENV_FILE" node <<'NODE'
const { lstatSync } = require("node:fs");
const value = process.env.ENV_FILE;
const stat = lstatSync(value);
if (
  stat.isSymbolicLink() ||
  !stat.isFile() ||
  stat.size < 1 ||
  stat.size > 128 * 1024 ||
  (stat.mode & 0o022) !== 0
) {
  throw new Error("staging_environment_file_unsafe");
}
NODE
}

write_result() {
  local final_disposition="$1"
  local rollback_disposition="$2"
  local completed_at
  completed_at="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
  PREVIOUS_SHA="$PREVIOUS_SHA"   TARGET_SHA="$RELEASE_SHA"   IMAGE_DIGEST="$IMAGE_DIGEST"   PUBLIC_BASE_URL="$TECPEY_STAGING_PUBLIC_BASE_URL"   STARTED_AT="$STARTED_AT"   COMPLETED_AT="$completed_at"   FINAL_DISPOSITION="$final_disposition"   ROLLBACK_DISPOSITION="$rollback_disposition"   RESULT_FILE="$RESULT_FILE"     node <<'NODE'
const { writeFileSync } = require("node:fs");
const result = {
  schemaVersion: 1,
  evidenceClass: "tecpey-staging-promotion-runtime-v1",
  environment: "staging",
  previousSha: process.env.PREVIOUS_SHA,
  targetSha: process.env.TARGET_SHA,
  imageDigest: process.env.IMAGE_DIGEST,
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
  startedAt: process.env.STARTED_AT,
  completedAt: process.env.COMPLETED_AT,
  finalDisposition: process.env.FINAL_DISPOSITION,
  rollbackDisposition: process.env.ROLLBACK_DISPOSITION,
};
writeFileSync(process.env.RESULT_FILE, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
NODE
}

run_smoke() {
  node "$AUTHORITY_DIR/$SMOKE_REL"     "$TECPEY_STAGING_PUBLIC_BASE_URL"     "$SMOKE_FILE"
}

if [ "$PREVIOUS_SHA" = "$RELEASE_SHA" ]; then
  echo "Selected release is already active; verifying without mutation."
  (
    cd "$CURRENT"
    bash scripts/ubuntu24-preflight.sh runtime
  )
  run_smoke
  write_result "verified_already_active" "not_needed"
  exit 0
fi

validate_environment_file

git -C "$CURRENT" fetch --no-tags origin main
git -C "$CURRENT" merge-base --is-ancestor "$RELEASE_SHA" origin/main
git -C "$CURRENT" cat-file -e "$RELEASE_SHA^{commit}"

if [ -e "$NEXT" ]; then
  test -d "$NEXT"
  test ! -L "$NEXT"
  test "$(git -C "$NEXT" rev-parse --is-inside-work-tree)" = "true"
  test "$(git -C "$NEXT" rev-parse HEAD)" = "$RELEASE_SHA"
  test -z "$(git -C "$NEXT" status --porcelain --untracked-files=no)"
else
  git -C "$CURRENT" worktree add --detach "$NEXT" "$RELEASE_SHA"
fi

install -m 0600 "$TECPEY_STAGING_ENV_FILE" "$NEXT/.env.production"

(
  cd "$NEXT"
  bash scripts/ubuntu24-preflight.sh candidate
  bash scripts/ubuntu24-preflight.sh migrate
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
    bash scripts/ubuntu24-preflight.sh runtime
  )
}

promote_next_runtime() {
  install_unit_bytes "$UNIT_NEXT"
  sudo systemctl daemon-reload
  verify_working_directory "$NEXT"
  sudo systemctl restart "$SERVICE"
  (
    cd "$NEXT"
    bash scripts/ubuntu24-preflight.sh runtime
  )
  run_smoke
}

MUTATION_ACTIVE=0
rollback_on_error() {
  local code=$?
  trap - ERR
  if [ "$MUTATION_ACTIVE" = "1" ]; then
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
trap - ERR
write_result "promoted" "$ROLLBACK_DISPOSITION"
echo "Staging promotion completed for $RELEASE_SHA."
