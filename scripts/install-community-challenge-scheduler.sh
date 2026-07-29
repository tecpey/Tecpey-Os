#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
TEMPLATE_DIR="${REPO_DIR}/deploy/systemd"
DRY_RUN="${TECPEY_DRY_RUN:-0}"
APP_DIR="${TECPEY_APP_DIR:-}"
RUN_USER="${TECPEY_RUN_USER:-tecpey}"
RUN_GROUP="${TECPEY_RUN_GROUP:-${RUN_USER}}"
ENV_FILE="${TECPEY_ENV_FILE:-}"
STATE_DIR="${TECPEY_OPS_STATE_DIR:-/var/lib/tecpey/ops}"
SYSTEMD_DIR="${TECPEY_SYSTEMD_DIR:-/etc/systemd/system}"
NPM_BIN="${TECPEY_NPM_BIN:-$(command -v npm || true)}"

fail() {
  printf 'installer_error=%s\n' "$1" >&2
  exit 1
}

require_safe_token() {
  local value="$1" code="$2"
  [[ "$value" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || fail "$code"
}

require_absolute_path() {
  local value="$1" code="$2"
  [[ -n "$value" && "$value" == /* && "$value" != "/" ]] || fail "$code"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* && "$value" != *$'\t'* && "$value" != *' '* ]] || fail "$code"
}

read_env_value() {
  local name="$1"
  sed -n -E "s/^[[:space:]]*${name}=([^[:space:]]+)[[:space:]]*$/\\1/p" "$ENV_FILE" | tail -n 1
}

require_safe_token "$RUN_USER" "runtime_user_invalid"
require_safe_token "$RUN_GROUP" "runtime_group_invalid"
[[ "$RUN_USER" != "root" ]] || fail "runtime_user_root_forbidden"
require_absolute_path "$APP_DIR" "app_directory_invalid"
require_absolute_path "$ENV_FILE" "environment_file_invalid"
require_absolute_path "$STATE_DIR" "state_directory_invalid"
require_absolute_path "$SYSTEMD_DIR" "systemd_directory_invalid"
require_absolute_path "$NPM_BIN" "npm_binary_invalid"

[[ "$DRY_RUN" == "0" || "$DRY_RUN" == "1" ]] || fail "dry_run_invalid"
[[ -d "$APP_DIR" && -f "$APP_DIR/package.json" ]] || fail "app_directory_missing"
[[ -x "$NPM_BIN" ]] || fail "npm_binary_missing"
[[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || fail "environment_file_unsafe"
id "$RUN_USER" >/dev/null 2>&1 || fail "runtime_user_missing"
getent group "$RUN_GROUP" >/dev/null 2>&1 || fail "runtime_group_missing"
command -v systemd-analyze >/dev/null 2>&1 || fail "systemd_analyze_missing"
command -v sed >/dev/null 2>&1 || fail "sed_missing"

if [[ -e "$STATE_DIR" && -L "$STATE_DIR" ]]; then
  fail "state_directory_symlink_forbidden"
fi
if [[ -e "$SYSTEMD_DIR" && -L "$SYSTEMD_DIR" ]]; then
  fail "systemd_directory_symlink_forbidden"
fi

ENV_MODE="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || true)"
[[ "$ENV_MODE" =~ ^[0-7]{3,4}$ ]] || fail "environment_file_mode_unknown"
ENV_LAST3="${ENV_MODE: -3}"
ENV_GROUP_DIGIT="${ENV_LAST3:1:1}"
ENV_OTHER_DIGIT="${ENV_LAST3:2:1}"
(( ENV_OTHER_DIGIT == 0 )) || fail "environment_file_world_access_forbidden"
(( (ENV_GROUP_DIGIT & 3) == 0 )) || fail "environment_file_group_write_execute_forbidden"

DATABASE_URL_VALUE="$(read_env_value DATABASE_URL)"
ALERT_WEBHOOK_VALUE="$(read_env_value TECPEY_OPS_ALERT_WEBHOOK_URL)"
[[ -n "$DATABASE_URL_VALUE" ]] || fail "database_url_missing"
[[ "$ALERT_WEBHOOK_VALUE" == https://* ]] || fail "ops_alert_https_webhook_missing"
if [[ "$DATABASE_URL_VALUE" == *CHANGE_ME* || "$DATABASE_URL_VALUE" == *example.invalid* ]]; then
  fail "database_url_placeholder_forbidden"
fi
if [[ "$ALERT_WEBHOOK_VALUE" == *CHANGE_ME* || "$ALERT_WEBHOOK_VALUE" == *example.invalid* || "$ALERT_WEBHOOK_VALUE" == *localhost* ]]; then
  fail "ops_alert_webhook_placeholder_forbidden"
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf -- "$TMP_DIR"
}
trap cleanup EXIT

escape_sed() {
  printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'
}

render_service() {
  local source="$1" destination="$2"
  sed \
    -e "s|@@RUN_USER@@|$(escape_sed "$RUN_USER")|g" \
    -e "s|@@RUN_GROUP@@|$(escape_sed "$RUN_GROUP")|g" \
    -e "s|@@APP_DIR@@|$(escape_sed "$APP_DIR")|g" \
    -e "s|@@ENV_FILE@@|$(escape_sed "$ENV_FILE")|g" \
    -e "s|@@STATE_DIR@@|$(escape_sed "$STATE_DIR")|g" \
    -e "s|@@NPM_BIN@@|$(escape_sed "$NPM_BIN")|g" \
    "$source" > "$destination"
  if grep -Eq '@@[A-Z_]+@@' "$destination"; then
    fail "systemd_template_placeholder_unresolved"
  fi
}

render_service \
  "$TEMPLATE_DIR/tecpey-community-challenge-finalizer.service.in" \
  "$TMP_DIR/tecpey-community-challenge-finalizer.service"
render_service \
  "$TEMPLATE_DIR/tecpey-ops-alert-delivery.service.in" \
  "$TMP_DIR/tecpey-ops-alert-delivery.service"
cp "$TEMPLATE_DIR/tecpey-community-challenge-finalizer.timer" "$TMP_DIR/"
cp "$TEMPLATE_DIR/tecpey-ops-alert-delivery.timer" "$TMP_DIR/"

systemd-analyze verify \
  "$TMP_DIR/tecpey-community-challenge-finalizer.service" \
  "$TMP_DIR/tecpey-community-challenge-finalizer.timer" \
  "$TMP_DIR/tecpey-ops-alert-delivery.service" \
  "$TMP_DIR/tecpey-ops-alert-delivery.timer" >/dev/null

if [[ "$DRY_RUN" == "1" ]]; then
  printf 'dry_run=1\n'
  printf 'app_dir=%s\n' "$APP_DIR"
  printf 'runtime_identity=%s:%s\n' "$RUN_USER" "$RUN_GROUP"
  printf 'environment_file=%s\n' "$ENV_FILE"
  printf 'state_directory=%s\n' "$STATE_DIR"
  printf 'npm_binary=%s\n' "$NPM_BIN"
  printf 'unit_verification=passed\n'
  exit 0
fi

[[ "${EUID}" -eq 0 ]] || fail "root_required"
command -v systemctl >/dev/null 2>&1 || fail "systemctl_missing"
install -d -m 0755 "$SYSTEMD_DIR"
install -d -m 0700 -o "$RUN_USER" -g "$RUN_GROUP" "$STATE_DIR"
install -m 0644 "$TMP_DIR/tecpey-community-challenge-finalizer.service" "$SYSTEMD_DIR/"
install -m 0644 "$TMP_DIR/tecpey-community-challenge-finalizer.timer" "$SYSTEMD_DIR/"
install -m 0644 "$TMP_DIR/tecpey-ops-alert-delivery.service" "$SYSTEMD_DIR/"
install -m 0644 "$TMP_DIR/tecpey-ops-alert-delivery.timer" "$SYSTEMD_DIR/"

systemctl daemon-reload
systemctl enable --now tecpey-community-challenge-finalizer.timer
systemctl enable --now tecpey-ops-alert-delivery.timer
systemctl start tecpey-ops-alert-delivery.service
systemctl is-enabled --quiet tecpey-community-challenge-finalizer.timer
systemctl is-active --quiet tecpey-community-challenge-finalizer.timer
systemctl is-enabled --quiet tecpey-ops-alert-delivery.timer
systemctl is-active --quiet tecpey-ops-alert-delivery.timer

printf 'installed=1\n'
printf 'finalizer_timer=active\n'
printf 'alert_delivery_timer=active\n'
printf 'state_directory=%s\n' "$STATE_DIR"
