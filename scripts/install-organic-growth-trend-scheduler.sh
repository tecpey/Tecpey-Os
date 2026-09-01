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
SYSTEMD_DIR="${TECPEY_SYSTEMD_DIR:-/etc/systemd/system}"
NPM_BIN="${TECPEY_NPM_BIN:-$(command -v npm || true)}"

fail() { printf 'installer_error=%s\n' "$1" >&2; exit 1; }
require_safe_token() {
  local value="$1" code="$2"
  [[ "$value" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || fail "$code"
}
require_absolute_path() {
  local value="$1" code="$2"
  [[ -n "$value" && "$value" == /* && "$value" != "/" ]] || fail "$code"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* && "$value" != *$'\t'* && "$value" != *' '* ]] || fail "$code"
}

require_safe_token "$RUN_USER" "runtime_user_invalid"
require_safe_token "$RUN_GROUP" "runtime_group_invalid"
[[ "$RUN_USER" != "root" ]] || fail "runtime_user_root_forbidden"
require_absolute_path "$APP_DIR" "app_directory_invalid"
require_absolute_path "$ENV_FILE" "environment_file_invalid"
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
[[ ! -e "$SYSTEMD_DIR" || ! -L "$SYSTEMD_DIR" ]] || fail "systemd_directory_symlink_forbidden"

ENV_MODE="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || true)"
[[ "$ENV_MODE" =~ ^[0-7]{3,4}$ ]] || fail "environment_file_mode_unknown"
ENV_LAST3="${ENV_MODE: -3}"
ENV_GROUP_DIGIT="${ENV_LAST3:1:1}"
ENV_OTHER_DIGIT="${ENV_LAST3:2:1}"
(( ENV_OTHER_DIGIT == 0 )) || fail "environment_file_world_access_forbidden"
(( (ENV_GROUP_DIGIT & 3) == 0 )) || fail "environment_file_group_write_execute_forbidden"

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf -- "$TMP_DIR"; }
trap cleanup EXIT
escape_sed() { printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'; }
sed \
  -e "s|@@RUN_USER@@|$(escape_sed "$RUN_USER")|g" \
  -e "s|@@RUN_GROUP@@|$(escape_sed "$RUN_GROUP")|g" \
  -e "s|@@APP_DIR@@|$(escape_sed "$APP_DIR")|g" \
  -e "s|@@ENV_FILE@@|$(escape_sed "$ENV_FILE")|g" \
  -e "s|@@NPM_BIN@@|$(escape_sed "$NPM_BIN")|g" \
  "$TEMPLATE_DIR/tecpey-organic-growth-trend.service.in" > "$TMP_DIR/tecpey-organic-growth-trend.service"
cp "$TEMPLATE_DIR/tecpey-organic-growth-trend.timer" "$TMP_DIR/"
if grep -Eq '@@[A-Z_]+@@' "$TMP_DIR/tecpey-organic-growth-trend.service"; then
  fail "systemd_template_placeholder_unresolved"
fi
systemd-analyze verify "$TMP_DIR/tecpey-organic-growth-trend.service" "$TMP_DIR/tecpey-organic-growth-trend.timer" >/dev/null

if [[ "$DRY_RUN" == "1" ]]; then
  printf 'dry_run=1\n'
  printf 'app_dir=%s\n' "$APP_DIR"
  printf 'runtime_identity=%s:%s\n' "$RUN_USER" "$RUN_GROUP"
  printf 'environment_file=%s\n' "$ENV_FILE"
  printf 'npm_binary=%s\n' "$NPM_BIN"
  printf 'unit_verification=passed\n'
  exit 0
fi

[[ "${EUID}" -eq 0 ]] || fail "root_required"
command -v systemctl >/dev/null 2>&1 || fail "systemctl_missing"
install -d -m 0755 "$SYSTEMD_DIR"
install -m 0644 "$TMP_DIR/tecpey-organic-growth-trend.service" "$SYSTEMD_DIR/"
install -m 0644 "$TMP_DIR/tecpey-organic-growth-trend.timer" "$SYSTEMD_DIR/"
systemctl daemon-reload
systemctl enable --now tecpey-organic-growth-trend.timer
systemctl is-enabled --quiet tecpey-organic-growth-trend.timer
systemctl is-active --quiet tecpey-organic-growth-trend.timer
printf 'installed=1\n'
printf 'growth_trend_timer=active\n'
