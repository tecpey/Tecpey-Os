import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CANDIDATE_PATH =
  "docs/launch/generated/current-controlled-launch-candidate.json";
const TRUSTED_CHECKER_PATH =
  "scripts/check-exact-head-workflow-evidence-authority.mjs";
const EVIDENCE_PATH_PATTERN =
  /^docs\/launch\/generated\/exact-head-workflow-evidence-\d{8}\.json$/;

const COPIED_PATHS = [
  "docs/launch/generated/protected-staging-no-go-register-20260810.json",
  CANDIDATE_PATH,
  "docs/launch/PROTECTED_STAGING_EVIDENCE_PACKET_20260810.md",
  "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
  "package.json",
];

const REFERENCE_PATHS = COPIED_PATHS.slice(0, 3);

function requireEvidencePath(label, value) {
  if (typeof value !== "string" || !EVIDENCE_PATH_PATTERN.test(value)) {
    throw new Error(
      `${label} must match docs/launch/generated/exact-head-workflow-evidence-YYYYMMDD.json`,
    );
  }
  return value;
}

export function trustedEvidencePath(checkerSource) {
  const match = checkerSource.match(
    /\bevidence:\s*"(docs\/launch\/generated\/exact-head-workflow-evidence-\d{8}\.json)"/,
  );
  return requireEvidencePath("trusted checker evidence path", match?.[1]);
}

export function candidateEvidencePath(candidate) {
  return requireEvidencePath(
    "candidate.activeInputs.exactHeadWorkflowEvidence",
    candidate?.activeInputs?.exactHeadWorkflowEvidence,
  );
}

export async function prepareTrustedExactHeadEvidenceOverlay({
  sourceRoot = process.cwd(),
  trustedRoot,
}) {
  if (typeof trustedRoot !== "string" || trustedRoot.length === 0) {
    throw new Error("trustedRoot is required");
  }

  const source = resolve(sourceRoot);
  const trusted = resolve(trustedRoot);
  const [candidate, checkerSource] = await Promise.all([
    readFile(resolve(source, CANDIDATE_PATH), "utf8").then(JSON.parse),
    readFile(resolve(trusted, TRUSTED_CHECKER_PATH), "utf8"),
  ]);
  const candidatePath = candidateEvidencePath(candidate);
  const trustedPath = trustedEvidencePath(checkerSource);

  await mkdir(dirname(resolve(trusted, trustedPath)), { recursive: true });
  await copyFile(resolve(source, candidatePath), resolve(trusted, trustedPath));

  for (const path of COPIED_PATHS) {
    await copyFile(resolve(source, path), resolve(trusted, path));
  }

  for (const path of REFERENCE_PATHS) {
    const destination = resolve(trusted, path);
    const value = await readFile(destination, "utf8");
    if (!value.includes(candidatePath)) {
      throw new Error(`${path} does not reference ${candidatePath}`);
    }
    await writeFile(destination, value.split(candidatePath).join(trustedPath));
  }

  return { candidatePath, trustedPath };
}

async function main() {
  const trustedRootIndex = process.argv.indexOf("--trusted-root");
  const trustedRoot = process.argv[trustedRootIndex + 1];
  if (trustedRootIndex === -1 || !trustedRoot) {
    throw new Error("usage: node scripts/prepare-trusted-exact-head-evidence-overlay.mjs --trusted-root <path>");
  }
  const result = await prepareTrustedExactHeadEvidenceOverlay({ trustedRoot });
  console.log(
    `Prepared trusted exact-head evidence overlay: ${result.candidatePath} -> ${result.trustedPath}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
