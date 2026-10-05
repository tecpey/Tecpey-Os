#!/usr/bin/env bash
set -Eeuo pipefail

CANDIDATE_IMAGE="${1:?candidate image is required}"
PREVIOUS_IMAGE="${2:?previous image is required}"
CONTAINER="tecpey-issue-163-rollback"
EVIDENCE_DIR="${TECPEY_RECOVERY_EVIDENCE_DIR:-artifacts/container-recovery}"
PORT=4321

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

probe_image() {
  local image="$1"
  local marker="$2"
  docker run -d --name "$CONTAINER" -p "127.0.0.1:$PORT:3000" --entrypoint node "$image" \
    -e "require('node:http').createServer((_,res)=>res.end('$marker')).listen(3000,'0.0.0.0')" >/dev/null
  for _ in $(seq 1 20); do
    if response="$(curl --fail --silent --show-error "http://127.0.0.1:$PORT")"; then
      test "$response" = "$marker"
      docker rm -f "$CONTAINER" >/dev/null
      return 0
    fi
    sleep 0.25
  done
  echo "rollback_error=${marker}_image_never_served" >&2
  return 1
}

mkdir -p "$EVIDENCE_DIR"
CANDIDATE_ID="$(docker image inspect --format '{{.Id}}' "$CANDIDATE_IMAGE")"
PREVIOUS_ID="$(docker image inspect --format '{{.Id}}' "$PREVIOUS_IMAGE")"
test "$CANDIDATE_ID" != "$PREVIOUS_ID"

PREVIOUS_SHA="${PREVIOUS_IMAGE##*:}"
printf '%s\n' "$PREVIOUS_SHA" | grep -Eq '^[0-9a-f]{40}$'
PREVIOUS_REPO_DIGEST="$(
  docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$PREVIOUS_IMAGE" \
    | grep -E '^ghcr\.io/tecpey/tecpey-os@sha256:[0-9a-f]{64}$' \
    | sed -n '1p'
)"
test -n "$PREVIOUS_REPO_DIGEST"
command -v gh >/dev/null

gh attestation verify "oci://$PREVIOUS_REPO_DIGEST" \
  --repo tecpey/Tecpey-Os \
  --bundle-from-oci \
  --signer-workflow tecpey/Tecpey-Os/.github/workflows/container-supply-chain.yml \
  --source-digest "$PREVIOUS_SHA" \
  --source-ref refs/heads/main \
  --format json > "$EVIDENCE_DIR/previous-provenance-verification.json"

probe_image "$CANDIDATE_IMAGE" candidate
probe_image "$PREVIOUS_IMAGE" previous

printf '%s\n' "$CANDIDATE_ID" > "$EVIDENCE_DIR/candidate-image-id.txt"
printf '%s\n' "$PREVIOUS_ID" > "$EVIDENCE_DIR/previous-image-id.txt"
printf '%s\n' "$PREVIOUS_REPO_DIGEST" > "$EVIDENCE_DIR/previous-provenance-subject.txt"
printf '{"environment":"ephemeral-staging","candidate":"served","rollback":"previous-release-served","provenance":"verified"}\n' > "$EVIDENCE_DIR/rollback-result.json"
