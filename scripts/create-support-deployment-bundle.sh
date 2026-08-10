#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT_DIR"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to create a traceable deployment bundle." >&2
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "zip is required. Install it on the packaging machine before creating a support bundle." >&2
  exit 1
fi

RELEASE_SHA="$(git rev-parse --verify HEAD)"
if [[ ! "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Unable to resolve an exact 40-character release SHA." >&2
  exit 1
fi

GIT_STATUS="$(git status --short --untracked-files=all)"
if [ -n "$GIT_STATUS" ] && [ "${TECPEY_ALLOW_DIRTY_BUNDLE:-0}" != "1" ]; then
  echo "Refusing to create a deployment bundle from a dirty working tree." >&2
  echo "Commit/review changes first, or set TECPEY_ALLOW_DIRTY_BUNDLE=1 for a local draft bundle." >&2
  echo "$GIT_STATUS" >&2
  exit 1
fi

BUNDLE_ROOT="tecpey-deployment-${RELEASE_SHA}"
OUTPUT_DIR="${TECPEY_BUNDLE_OUTPUT_DIR:-$ROOT_DIR/artifacts/deployment-bundles}"
TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$OUTPUT_DIR"
STAGING_DIR="$TMP_DIR/$BUNDLE_ROOT"
mkdir -p "$STAGING_DIR"

tar \
  --exclude-vcs \
  --exclude='./node_modules' \
  --exclude='./.next' \
  --exclude='./dist' \
  --exclude='./.env' \
  --exclude='./.env.local' \
  --exclude='./.env.production' \
  --exclude='./.env.development.local' \
  --exclude='./.env.test.local' \
  --exclude='./artifacts/deployment-bundles' \
  --exclude='./storage/*' \
  --exclude='./*.log' \
  -cf - . | tar -xf - -C "$STAGING_DIR"

cat > "$STAGING_DIR/SUPPORT_BUNDLE_MANIFEST.txt" <<MANIFEST
TecPey support deployment bundle

Release SHA: $RELEASE_SHA
Created UTC: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Dirty working tree allowed: ${TECPEY_ALLOW_DIRTY_BUNDLE:-0}

Primary handoff:
docs/operations/SUPPORT_TEAM_DEPLOYMENT_HANDOFF.md

Deployment contracts:
DEPLOY_UBUNTU_24_PRODUCTION.md
docs/operations/PRODUCTION_DEPLOYMENT_CONTRACT.md
docs/operations/STAGING_READINESS_EVIDENCE_CONTRACT.md
docs/operations/RECOVERY_RECONCILIATION_CONTRACT.md

Operational workers included:
deploy/systemd/tecpey-news-materialization.service.in
deploy/systemd/tecpey-news-materialization.timer
scripts/install-news-materialization-scheduler.sh
scripts/check-news-materialization-env.ts

Governed brand assets included:
public/images/tecpey-logo.png
public/logo.png
docs/assets/brand/brand-assets.json

Required local secret template:
.env.production.example

Never add .env.production, access tokens, private keys, database dumps, node_modules,
.next, dist, or local logs to this bundle.
MANIFEST

if find "$STAGING_DIR" -name node_modules -print -quit | grep -q .; then
  echo "Forbidden deployment bundle content detected: node_modules" >&2
  exit 1
fi
if find "$STAGING_DIR" -name .git -print -quit | grep -q .; then
  echo "Forbidden deployment bundle content detected: .git" >&2
  exit 1
fi
for forbidden_path in \
  "$STAGING_DIR/.env.production" \
  "$STAGING_DIR/.env.local" \
  "$STAGING_DIR/.next" \
  "$STAGING_DIR/dist"
do
  if [ -e "$forbidden_path" ]; then
    echo "Forbidden deployment bundle content detected: ${forbidden_path#$STAGING_DIR/}" >&2
    exit 1
  fi
done

OUTPUT_ZIP="$OUTPUT_DIR/${BUNDLE_ROOT}.zip"
rm -f "$OUTPUT_ZIP" "$OUTPUT_ZIP.sha256"
(
  cd "$TMP_DIR"
  zip -qr "$OUTPUT_ZIP" "$BUNDLE_ROOT"
)
sha256sum "$OUTPUT_ZIP" > "$OUTPUT_ZIP.sha256"

echo "Created support deployment bundle:"
echo "$OUTPUT_ZIP"
echo "$OUTPUT_ZIP.sha256"
echo "Verify before sending:"
echo "npm run support:bundle:verify -- \"$OUTPUT_ZIP\" \"$OUTPUT_ZIP.sha256\""
