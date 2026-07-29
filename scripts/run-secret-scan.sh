#!/usr/bin/env bash
set -euo pipefail

readonly GITLEAKS_VERSION="8.30.1"
readonly GITLEAKS_RELEASE_COMMIT="83d9cd684c87d95d656c1458ef04895a7f1cbd8e"
readonly GITLEAKS_LINUX_X64_SHA256="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
readonly GITLEAKS_DEFAULT_CONFIG_SHA256="e163e53b9e7e8a8511e77271e2b323ed057759542a6d988258afe3a1fa329caf"

readonly expected_sha="${TECPEY_SECRET_SCAN_SOURCE_SHA:?TECPEY_SECRET_SCAN_SOURCE_SHA is required}"
readonly artifact_dir="${TECPEY_SECRET_SCAN_ARTIFACT_DIR:-artifacts/secret-scanning}"

if [[ ! "$expected_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: expected source SHA must be a lowercase full commit SHA" >&2
  exit 2
fi
if [[ "$artifact_dir" != "artifacts/secret-scanning" ]]; then
  echo "ERROR: artifact output must remain artifacts/secret-scanning" >&2
  exit 2
fi
if [[ "$(git rev-parse HEAD)" != "$expected_sha" ]]; then
  echo "ERROR: secret scan checkout does not match the expected source SHA" >&2
  exit 2
fi
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "ERROR: secret scan refuses modified or staged tracked files" >&2
  exit 2
fi

mkdir -p "$artifact_dir"
rm -f \
  "$artifact_dir/findings.redacted.json" \
  "$artifact_dir/result.json" \
  "$artifact_dir/scan.log"

temporary_directory="$(mktemp -d)"
trap 'rm -rf -- "$temporary_directory"' EXIT

readonly archive_path="$temporary_directory/gitleaks.tar.gz"
readonly binary_path="$temporary_directory/gitleaks"
readonly config_path="$temporary_directory/gitleaks-default.toml"
readonly ignore_path="$temporary_directory/gitleaks.ignore"

curl --fail --silent --show-error --location \
  --proto '=https' --tlsv1.2 \
  "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
  --output "$archive_path"
printf '%s  %s\n' "$GITLEAKS_LINUX_X64_SHA256" "$archive_path" |
  sha256sum --check --status
tar --no-same-owner -xzf "$archive_path" -C "$temporary_directory" gitleaks
if [[ "$("$binary_path" version)" != "$GITLEAKS_VERSION" ]]; then
  echo "ERROR: downloaded Gitleaks version does not match the governed version" >&2
  exit 2
fi

curl --fail --silent --show-error --location \
  --proto '=https' --tlsv1.2 \
  "https://raw.githubusercontent.com/gitleaks/gitleaks/${GITLEAKS_RELEASE_COMMIT}/config/gitleaks.toml" \
  --output "$config_path"
printf '%s  %s\n' "$GITLEAKS_DEFAULT_CONFIG_SHA256" "$config_path" |
  sha256sum --check --status

node scripts/secret-scanning-baseline.mjs --output="$ignore_path"

readonly detector_repository="$temporary_directory/detector"
mkdir -p "$detector_repository"
git -C "$detector_repository" init --quiet
git -C "$detector_repository" config user.name "TecPey Secret Scan"
git -C "$detector_repository" config user.email "secret-scan@tecpey.invalid"
detector_tail="aB3cD4eF5gH6"
detector_tail+="iJ7kL8mN9pQ0"
detector_tail+="rS1tU2vW3xY4"
printf 'github_token = "ghp_%s"\n' "$detector_tail" > "$detector_repository/fixture.txt"
git -C "$detector_repository" add fixture.txt
git -C "$detector_repository" commit --quiet -m "detector self-test"

detector_exit=0
"$binary_path" git \
  --config "$config_path" \
  --redact \
  --no-banner \
  --no-color \
  --log-level error \
  --report-format json \
  --report-path "$temporary_directory/detector.redacted.json" \
  "$detector_repository" > "$temporary_directory/detector.log" 2>&1 ||
  detector_exit=$?
if [[ "$detector_exit" -ne 1 ]]; then
  echo "ERROR: detector self-test did not fail on its synthetic credential" >&2
  exit 2
fi
detector_rule="$(
  node - "$temporary_directory/detector.redacted.json" <<'NODE'
const fs = require("node:fs");
const findings = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (
  findings.length !== 1 ||
  findings[0].RuleID !== "github-pat" ||
  findings[0].Secret !== "REDACTED"
) {
  throw new Error("detector self-test report is not the expected redacted github-pat finding");
}
process.stdout.write(findings[0].RuleID);
NODE
)"

scan_exit=0
"$binary_path" git \
  --config "$config_path" \
  --gitleaks-ignore-path "$ignore_path" \
  --redact \
  --no-banner \
  --no-color \
  --log-level error \
  --timeout 300 \
  --report-format json \
  --report-path "$artifact_dir/findings.redacted.json" \
  --log-opts='--all' \
  . > "$artifact_dir/scan.log" 2>&1 ||
  scan_exit=$?

node scripts/write-secret-scan-evidence.mjs \
  --report="$artifact_dir/findings.redacted.json" \
  --output="$artifact_dir/result.json" \
  --source-sha="$expected_sha" \
  --source-tree="$(git rev-parse HEAD^{tree})" \
  --scan-exit-code="$scan_exit" \
  --detector-rule="$detector_rule"

exit "$scan_exit"
