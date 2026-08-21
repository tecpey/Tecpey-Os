#!/usr/bin/env bash
set -euo pipefail

echo "== TecPey governed host candidate verification =="
readonly VERIFICATION_PHASE="${1:-}"
case "$VERIFICATION_PHASE" in
  candidate|migrate|runtime) ;;
  *)
    echo "Usage: $0 candidate|migrate|runtime" >&2
    exit 64
    ;;
esac

readonly EXPECTED_NODE_MAJOR=22
readonly EXPECTED_NPM_MAJOR=10
readonly SYSTEMD_NODE_BIN=/usr/bin/node
readonly SYSTEMD_NPM_BIN=/usr/bin/npm
readonly SYSTEMD_COMMAND_PATH=/usr/bin:/bin
readonly SYSTEMD_LIVE_WORKTREE=/var/www/tecpey
if [ ! -x "$SYSTEMD_NODE_BIN" ]; then
  echo "Missing executable systemd Node.js binary: $SYSTEMD_NODE_BIN" >&2
  exit 1
fi
if [ ! -x "$SYSTEMD_NPM_BIN" ]; then
  echo "Missing executable candidate npm binary: $SYSTEMD_NPM_BIN" >&2
  exit 1
fi
"$SYSTEMD_NODE_BIN" -v
PATH="$SYSTEMD_COMMAND_PATH" "$SYSTEMD_NPM_BIN" -v
node_major=$("$SYSTEMD_NODE_BIN" -p 'process.versions.node.split(".")[0]')
npm_version=$(PATH="$SYSTEMD_COMMAND_PATH" "$SYSTEMD_NPM_BIN" --version)
npm_major=${npm_version%%.*}
if [ "$node_major" != "$EXPECTED_NODE_MAJOR" ]; then
  echo "Expected Node.js major $EXPECTED_NODE_MAJOR, received $node_major." >&2
  exit 1
fi
if [ "$npm_major" != "$EXPECTED_NPM_MAJOR" ]; then
  echo "Expected npm major $EXPECTED_NPM_MAJOR, received $npm_major." >&2
  exit 1
fi
if [ ! -f package.json ]; then echo "package.json not found. Run from project root."; exit 1; fi
if [ ! -f .env.production ]; then echo "Missing .env.production. Copy from .env.production.example first."; exit 1; fi
candidate_worktree=$(pwd -P)
if [ -d "$SYSTEMD_LIVE_WORKTREE" ]; then
  live_worktree=$(cd "$SYSTEMD_LIVE_WORKTREE" && pwd -P)
else
  live_worktree="$SYSTEMD_LIVE_WORKTREE"
fi
if [ "$VERIFICATION_PHASE" != "runtime" ] &&
  [ "$candidate_worktree" = "$live_worktree" ]; then
  echo "Refusing to build or migrate inside the live systemd working tree; use an isolated candidate checkout." >&2
  exit 1
fi

inside_git_worktree=0
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  inside_git_worktree=1
fi

read_bundle_release_sha() {
  "$SYSTEMD_NODE_BIN" -e '
    const fs = require("node:fs");
    const manifestPath = "SUPPORT_BUNDLE_MANIFEST.txt";
    if (!fs.existsSync(manifestPath)) process.exit(1);
    const manifest = fs.readFileSync(manifestPath, "utf8");
    const match = manifest.match(/^Release SHA:\s*([0-9a-f]{40})$/m);
    if (!match) process.exit(1);
    process.stdout.write(match[1]);
  '
}

if [ "$inside_git_worktree" -eq 1 ]; then
  expected_release_sha=$(git rev-parse HEAD)
else
  expected_release_sha=$(read_bundle_release_sha)
  echo "No Git metadata found; using release SHA from SUPPORT_BUNDLE_MANIFEST.txt."
  echo "The support bundle checksum must be verified before this preflight is trusted."
fi
if [[ ! "$expected_release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Unable to resolve an exact lowercase release SHA." >&2
  exit 1
fi
if [ "$inside_git_worktree" -eq 1 ] &&
  [ -n "$(git status --short --untracked-files=all)" ]; then
  echo "Candidate checkout has tracked or untracked changes; production verification is refused." >&2
  exit 1
fi

read_baked_release_sha() {
  "$SYSTEMD_NODE_BIN" -e '
    const fs = require("node:fs");
    const source = JSON.parse(fs.readFileSync(".next/required-server-files.json", "utf8"));
    const commit = source.config?.env?.TECPEY_IMMUTABLE_BUILD_COMMIT_SHA;
    if (typeof commit !== "string" || !/^[0-9a-f]{40}$/.test(commit)) process.exit(1);
    process.stdout.write(commit);
  '
}

if [ "$VERIFICATION_PHASE" = "candidate" ]; then
  PATH="$SYSTEMD_COMMAND_PATH" "$SYSTEMD_NPM_BIN" ci --no-audit --no-fund
  PATH="$SYSTEMD_COMMAND_PATH" "$SYSTEMD_NPM_BIN" run env:check
  PATH="$SYSTEMD_COMMAND_PATH" "$SYSTEMD_NPM_BIN" run check
  TECPEY_BUILD_COMMIT_SHA="$expected_release_sha" \
    PATH="$SYSTEMD_COMMAND_PATH" "$SYSTEMD_NPM_BIN" run build
  baked_release_sha=$(read_baked_release_sha)
  if [ "$baked_release_sha" != "$expected_release_sha" ]; then
    echo "Built artifact commit does not match the exact candidate checkout." >&2
    exit 1
  fi
  echo "Isolated candidate build passed for $expected_release_sha."
  exit 0
fi

baked_release_sha=$(read_baked_release_sha)
if [ "$baked_release_sha" != "$expected_release_sha" ]; then
  echo "Candidate artifact commit does not match the exact candidate checkout." >&2
  exit 1
fi

if [ "$VERIFICATION_PHASE" = "migrate" ]; then
  NODE_ENV=production "$SYSTEMD_NODE_BIN" --env-file=.env.production \
    dist/run-production-bootstrap.cjs migrate
  echo "Exact candidate migration passed for $expected_release_sha."
  exit 0
fi

readonly READINESS_ATTEMPTS=5
health_payload=$(mktemp)
trap 'rm -f "$health_payload"' EXIT
readiness_ok=0
for attempt in 1 2 3 4 5; do
  if curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/health > "$health_payload" &&
    EXPECTED_RELEASE_SHA="$baked_release_sha" "$SYSTEMD_NODE_BIN" -e '
      const fs = require("node:fs");
      const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const expected = process.env.EXPECTED_RELEASE_SHA;
      if (
        body.ok !== true ||
        body.health !== "ok" ||
        body.build?.commit !== expected ||
        body.checks?.database !== "ok" ||
        body.checks?.schema !== "current" ||
        body.checks?.redis !== "ok" ||
        body.checks?.runtime !== "ready" ||
        body.checks?.email !== "configured" ||
        !["ready", "disabled"].includes(body.checks?.requiredWorkers)
      ) process.exit(1);
    ' "$health_payload"; then
    readiness_ok=1
    break
  fi
  if [ "$attempt" -lt "$READINESS_ATTEMPTS" ]; then
    sleep 2
  fi
done
if [ "$readiness_ok" -ne 1 ]; then
  echo "Production readiness did not become healthy after $READINESS_ATTEMPTS attempts." >&2
  exit 1
fi

echo "Promoted runtime readiness passed for $expected_release_sha."
