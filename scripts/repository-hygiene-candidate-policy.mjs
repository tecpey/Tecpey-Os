import { createHash } from "node:crypto";

const ALLOWED_CLASSIFICATIONS = new Set([
  "transitional",
  "live-refactor-required",
  "proven-dead",
]);

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function validateRepositoryHygieneCandidateRegistry(
  registry,
  {
    orphanCandidates,
    readFile,
    readBaselineFile,
    isBaselineAncestor,
  },
) {
  const findings = [];
  if (registry?.schemaVersion !== 1) findings.push("schemaVersion must be 1");
  const baselineCommitSha = registry?.baselineCommitSha ?? "";
  const baselineIsValid = /^[0-9a-f]{40}$/.test(baselineCommitSha);
  if (!baselineIsValid) {
    findings.push("baselineCommitSha must be a full commit SHA");
  } else if (
    typeof isBaselineAncestor !== "function" ||
    !isBaselineAncestor(baselineCommitSha)
  ) {
    findings.push("baselineCommitSha must be an ancestor of the reviewed tree");
  }
  if (registry?.completionClaim !== false) {
    findings.push("candidate classification must not claim repository-hygiene completion");
  }
  if (!Array.isArray(registry?.candidates)) {
    return [...findings, "candidates must be an array"];
  }
  if (!Array.isArray(orphanCandidates)) {
    return [...findings, "orphanCandidates must be an array"];
  }

  const paths = registry.candidates.map((candidate) => candidate?.path);
  if (new Set(paths).size !== paths.length) findings.push("candidate paths must be unique");
  if (JSON.stringify(paths) !== JSON.stringify([...paths].sort(compareStrings))) {
    findings.push("candidate paths must use deterministic bytewise ordering");
  }

  const expectedPaths = [...orphanCandidates].sort(compareStrings);
  const actualPaths = [...paths].sort(compareStrings);
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    const expected = new Set(expectedPaths);
    const actual = new Set(actualPaths);
    const missing = expectedPaths.filter((candidatePath) => !actual.has(candidatePath));
    const stale = actualPaths.filter((candidatePath) => !expected.has(candidatePath));
    if (missing.length) findings.push(`unclassified hygiene candidates: ${missing.join(", ")}`);
    if (stale.length) findings.push(`stale hygiene classifications: ${stale.join(", ")}`);
  }

  for (const candidate of registry.candidates) {
    const label = candidate?.path ?? "<missing-path>";
    const pathIsValid = typeof candidate?.path === "string" &&
      candidate.path.startsWith("src/") &&
      !candidate.path.includes("\\") &&
      !candidate.path.includes("\0") &&
      !candidate.path.split("/").includes("..");
    if (!pathIsValid) {
      findings.push(`${label}: path must be a normalized repository-relative src path`);
      continue;
    }
    if (!ALLOWED_CLASSIFICATIONS.has(candidate?.classification)) {
      findings.push(`${label}: classification is not governed`);
    }
    if (!Array.isArray(candidate?.ownerIssues) || candidate.ownerIssues.length === 0) {
      findings.push(`${label}: at least one owner issue is required`);
    } else if (candidate.ownerIssues.some((issue) => !/^#[1-9]\d*$/.test(issue))) {
      findings.push(`${label}: owner issues must use #<number> form`);
    } else if (new Set(candidate.ownerIssues).size !== candidate.ownerIssues.length) {
      findings.push(`${label}: owner issues must be unique`);
    }
    if (!Array.isArray(candidate?.evidence) || candidate.evidence.length < 2) {
      findings.push(`${label}: at least two ownership evidence statements are required`);
    } else if (candidate.evidence.some((item) => typeof item !== "string" || item.trim().length < 20)) {
      findings.push(`${label}: ownership evidence must be precise non-empty text`);
    } else if (
      new Set(candidate.evidence.map((item) => item.trim())).size !== candidate.evidence.length
    ) {
      findings.push(`${label}: ownership evidence statements must be distinct`);
    }
    if (candidate?.deletionApproved !== false) {
      if (candidate?.classification !== "proven-dead") {
        findings.push(`${label}: deletion cannot be approved outside proven-dead classification`);
      }
      findings.push(`${label}: this registry phase does not authorize deletions`);
    }
    if (!/^[0-9a-f]{64}$/.test(candidate?.reviewedBlobSha256 ?? "")) {
      findings.push(`${label}: reviewedBlobSha256 must be SHA-256`);
      continue;
    }
    try {
      const content = readFile(candidate.path);
      const actualSha = createHash("sha256").update(content).digest("hex");
      if (actualSha !== candidate.reviewedBlobSha256) {
        findings.push(`${label}: content changed after ownership review`);
      }
    } catch {
      findings.push(`${label}: reviewed candidate file is missing`);
    }
    if (baselineIsValid) {
      try {
        const baselineContent = readBaselineFile(baselineCommitSha, candidate.path);
        const baselineSha = createHash("sha256").update(baselineContent).digest("hex");
        if (baselineSha !== candidate.reviewedBlobSha256) {
          findings.push(`${label}: reviewed bytes do not match baselineCommitSha`);
        }
      } catch {
        findings.push(`${label}: reviewed candidate is missing from baselineCommitSha`);
      }
    }
  }

  return findings;
}
