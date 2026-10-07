import fs from "node:fs";

const workflowPath = ".github/workflows/container-supply-chain.yml";
const rollbackPath = "scripts/test-container-image-rollback.sh";
const source = fs.readFileSync(workflowPath, "utf8");
const rollbackSource = fs.readFileSync(rollbackPath, "utf8");
const failures = [];

function block(sourceText, key) {
  const lines = sourceText.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${key}:`);
  if (start < 0) return "";
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function requireText(text, token, message) {
  if (!text.includes(token)) failures.push(message);
}

function reject(text, pattern, message) {
  if (pattern.test(text)) failures.push(message);
}

const recovery = block(source, "recovery");
if (!recovery) failures.push("container workflow must define recovery job");

for (const [token, message] of [
  ["packages: read", "recovery job must have read-only package-registry access"],
  ["attestations: read", "recovery job must have read-only attestation access"],
  ["GH_TOKEN: ${{ github.token }}", "rollback verification must use the scoped workflow token"],
  ["docker/login-action@dbcb813823bdd20940b903addbd779551569679f", "GHCR authentication action must remain commit-pinned"],
  ['previous_tag="ghcr.io/tecpey/tecpey-os:$PREVIOUS_SHA"', "previous image must be selected by exact base commit SHA"],
  ['docker pull "$previous_tag"', "recovery must pull the published previous image"],
  ["previous-image-digest.txt", "recovery must persist the resolved immutable previous-image digest"],
  ["previous-baked-commit.txt", "recovery must persist the artifact-baked previous commit"],
  ["TECPEY_IMMUTABLE_BUILD_COMMIT_SHA", "recovery must verify artifact-baked release identity"],
  ['test "$baked_commit" = "$ROLLBACK_RELEASE_SHA"', "recovery must fail closed on rollback-image identity mismatch"],
  ['docker tag "$previous_digest" "tecpey-previous:$ROLLBACK_RELEASE_SHA"', "rollback drill must consume the verified digest, not the mutable tag"],
]) {
  requireText(recovery, token, message);
}

for (const [token, message] of [
  ["PREVIOUS_REPO_DIGEST", "rollback drill must resolve the original GHCR RepoDigest"],
  ["gh attestation verify", "rollback drill must cryptographically verify GitHub build provenance"],
  ["oci://$PREVIOUS_REPO_DIGEST", "provenance verification must target the exact immutable rollback digest"],
  ["--bundle-from-oci", "rollback provenance must be consumed from the authenticated OCI registry"],
  ["--repo tecpey/Tecpey-Os", "rollback provenance must be scoped to the TecPey source repository"],
  ["--signer-workflow tecpey/Tecpey-Os/.github/workflows/container-supply-chain.yml", "rollback provenance must be bound to the governed supply-chain workflow"],
  ['--source-digest "$PREVIOUS_SHA"', "rollback provenance must be bound to the exact previous source SHA"],
  ["--source-ref refs/heads/main", "rollback provenance must be bound to the protected main source ref"],
  ["previous-provenance-verification.json", "rollback drill must preserve provenance verification evidence"],
  ['"provenance":"verified"', "rollback result must record successful provenance verification"],
]) {
  requireText(rollbackSource, token, message);
}

reject(
  recovery,
  /Checkout exact previous release|path:\s*previous-release|git -C previous-release|docker build[^\n]*PREVIOUS_SHA|docker build[^\n]*previous-release/,
  "recovery must never reconstruct a historical release from source or live package repositories",
);
reject(
  recovery,
  /docker pull\s+"?ghcr\.io\/tecpey\/tecpey-os:(?:latest|main)"?/,
  "recovery must never pull a mutable latest/main rollback tag",
);
reject(
  rollbackSource,
  /gh attestation verify[\s\S]{0,800}(?:\|\|\s*true|set\s+\+e)/,
  "rollback provenance verification must remain fail-closed",
);

if (failures.length) {
  console.error("Immutable rollback artifact authority failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Immutable rollback artifact authority passed.");
