import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { TextDecoder } from "node:util";
import {
  classifyDomain,
  classifyProvenance,
  fileTypeForPath,
  initialReviewStatus,
  repositoryAuditPolicy,
} from "./repository-audit-policy.mjs";

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const SEVERITIES = ["P0", "P1", "P2", "P3"];
const AUDIT_AUTHORITY_PATHS = [
  ".github/workflows/repository-audit-manifest.yml",
  "docs/audits/evidence/batch-01a-audit-authority.json",
  "package.json",
  "scripts/check-repository-audit-authority.mjs",
  "scripts/generate-repository-audit-manifest.mjs",
  "scripts/repository-audit-manifest.mjs",
  "scripts/repository-audit-manifest.test.mjs",
  "scripts/repository-audit-policy.mjs",
  "scripts/repository-audit-workflow-policy.mjs",
  "scripts/repository-audit-workflow-policy.test.mjs",
  "scripts/verify-repository-audit-manifest.mjs",
];

function runGit(repositoryRoot, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: repositoryRoot,
      env: {
        PATH: process.env.PATH,
        LANG: "C",
        LC_ALL: "C",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `git ${args.join(" ")} failed with exit ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`,
          ),
        );
        return;
      }
      resolve(Buffer.concat(stdout));
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

function decodeUtf8(buffer, label) {
  try {
    return utf8Decoder.decode(buffer);
  } catch {
    throw new Error(`${label} is not valid UTF-8`);
  }
}

async function assertAuditAuthorityClean(repositoryRoot) {
  const status = await runGit(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "-z",
    "--",
    ...AUDIT_AUTHORITY_PATHS,
  ]);
  if (status.length > 0) {
    throw new Error(
      "Repository audit authority files differ from the exact committed tree",
    );
  }
}

function parseTree(buffer) {
  if (buffer.length === 0 || buffer.at(-1) !== 0x00) {
    throw new Error("git ls-tree output must be non-empty and NUL-terminated");
  }
  const entries = [];
  let offset = 0;
  while (offset < buffer.length) {
    const end = buffer.indexOf(0x00, offset);
    if (end < 0) throw new Error("Unterminated git ls-tree record");
    const rawEntry = buffer.subarray(offset, end);
    const tab = rawEntry.indexOf(0x09);
    if (tab < 0) throw new Error("Unexpected git ls-tree record without a path separator");
    const header = rawEntry.subarray(0, tab).toString("ascii");
    const match = /^(?<mode>\d{6}) (?<type>\S+) (?<object>[0-9a-f]+)$/.exec(header);
    if (!match?.groups) throw new Error(`Unexpected git ls-tree header: ${JSON.stringify(header)}`);
    const repositoryPath = decodeUtf8(rawEntry.subarray(tab + 1), "tracked path");
    if (
      match.groups.type !== "blob" &&
      !(match.groups.type === "commit" && match.groups.mode === "160000")
    ) {
      throw new Error(
        `Tracked path ${repositoryPath} has unsupported Git type ${match.groups.type} and mode ${match.groups.mode}`,
      );
    }
    entries.push({
      gitMode: match.groups.mode,
      objectId: match.groups.object,
      objectType: match.groups.type,
      path: repositoryPath,
    });
    offset = end + 1;
  }
  return entries;
}

function parseBatchBlobs(buffer, treeEntries) {
  const blobs = new Map();
  let offset = 0;
  for (const entry of treeEntries) {
    const lineEnd = buffer.indexOf(0x0a, offset);
    if (lineEnd < 0) throw new Error(`Missing cat-file header for ${entry.path}`);
    const header = buffer.subarray(offset, lineEnd).toString("ascii");
    const match = /^(?<object>[0-9a-f]+) blob (?<size>\d+)$/.exec(header);
    if (!match?.groups || match.groups.object !== entry.objectId) {
      throw new Error(`Unexpected cat-file header for ${entry.path}: ${header}`);
    }
    const size = Number.parseInt(match.groups.size, 10);
    const start = lineEnd + 1;
    const end = start + size;
    if (buffer[end] !== 0x0a) throw new Error(`Missing cat-file terminator for ${entry.path}`);
    blobs.set(entry.objectId, buffer.subarray(start, end));
    offset = end + 1;
  }
  if (offset !== buffer.length) throw new Error("Unexpected trailing cat-file output");
  return blobs;
}

function contentKindForBlob(blob) {
  if (blob.includes(0)) return "binary";
  try {
    utf8Decoder.decode(blob);
    return "text";
  } catch {
    return "binary";
  }
}

function debtAnnotationPattern(repositoryPath) {
  const extension = repositoryPath.split(".").at(-1)?.toLowerCase();
  if (["md", "mdx", "html", "htm", "svg"].includes(extension)) {
    return /^\s*<!--\s*(?:TODO|FIXME|HACK)\b/;
  }
  if (["sh", "bash", "zsh", "yml", "yaml", "py", "rb", "toml", "conf"].includes(extension)) {
    return /^\s*#\s*(?:TODO|FIXME|HACK)\b/;
  }
  if (
    [
      "c",
      "cc",
      "cpp",
      "css",
      "cjs",
      "go",
      "java",
      "js",
      "jsx",
      "mjs",
      "rs",
      "scss",
      "ts",
      "tsx",
    ].includes(extension)
  ) {
    return /^\s*(?:\/\/|\/\*+|\*)\s*(?:TODO|FIXME|HACK)\b/;
  }
  return null;
}

function lineCount(text) {
  if (text.length === 0) return 0;
  const breaks = text.match(/\r\n|\r|\n/g)?.length ?? 0;
  return breaks + (/(?:\r\n|\r|\n)$/.test(text) ? 0 : 1);
}

function scanText(text, provenance, repositoryPath) {
  const findings = [];
  const lines = text.split(/\r\n|\r|\n/);
  const debtPattern = debtAnnotationPattern(repositoryPath);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^(?:<<<<<<< .+|=======|>>>>>>> .+)$/.test(line)) {
      findings.push({
        severity: "P1",
        ruleId: "unresolved-merge-conflict",
        line: index + 1,
      });
    }
    if (provenance === "source" && debtPattern?.test(line)) {
      findings.push({
        severity: "P3",
        ruleId: "standalone-review-debt-annotation",
        line: index + 1,
      });
    }
  }
  return findings;
}

function findingCounts(findings) {
  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

function comparePaths(left, right) {
  if (left.path < right.path) return -1;
  if (left.path > right.path) return 1;
  return 0;
}

function increment(target, key, amount = 1) {
  target[key] = (target[key] ?? 0) + amount;
}

function summarize(files) {
  const summary = {
    trackedPaths: files.length,
    bytes: 0,
    lines: 0,
    contentKinds: {},
    provenance: {},
    reviewStatuses: {},
    riskTiers: {},
    reviewBatches: {},
    domains: {},
    automatedFindingCounts: Object.fromEntries(SEVERITIES.map((severity) => [severity, 0])),
  };

  for (const file of files) {
    summary.bytes += file.bytes;
    summary.lines += file.lines ?? 0;
    increment(summary.contentKinds, file.contentKind);
    increment(summary.provenance, file.provenance);
    increment(summary.reviewStatuses, file.review.status);
    increment(summary.riskTiers, file.riskTier);
    increment(summary.reviewBatches, String(file.reviewBatch));
    increment(summary.domains, file.domain);
    for (const severity of SEVERITIES) {
      summary.automatedFindingCounts[severity] += file.automatedScan.findingCounts[severity];
    }
  }
  return summary;
}

function requireEvidence(condition, message) {
  if (!condition) throw new Error(`Repository review evidence is invalid: ${message}`);
}

function validateReviewedRanges(ranges, lines, repositoryPath) {
  requireEvidence(Array.isArray(ranges) && ranges.length > 0, `${repositoryPath} has no reviewed ranges`);
  requireEvidence(Number.isInteger(lines) && lines > 0, `${repositoryPath} is not reviewable text`);
  let nextLine = 1;
  for (const range of ranges) {
    requireEvidence(
      range &&
        Object.keys(range).sort().join(",") === "endLine,startLine" &&
        Number.isInteger(range.startLine) &&
        Number.isInteger(range.endLine),
      `${repositoryPath} has a malformed reviewed range`,
    );
    requireEvidence(
      range.startLine === nextLine && range.endLine >= range.startLine && range.endLine <= lines,
      `${repositoryPath} reviewed ranges must be ordered, contiguous and bounded`,
    );
    nextLine = range.endLine + 1;
  }
  requireEvidence(nextLine === lines + 1, `${repositoryPath} reviewed ranges do not cover every line`);
}

function validateFinding(finding, repositoryPath, lines) {
  requireEvidence(finding && typeof finding === "object", `${repositoryPath} has a malformed finding`);
  requireEvidence(
    /^B01A-P[0-3]-\d{3}$/.test(finding.id),
    `${repositoryPath} finding id is not canonical`,
  );
  requireEvidence(SEVERITIES.includes(finding.severity), `${repositoryPath} finding severity is invalid`);
  requireEvidence(
    finding.id.split("-")[1] === finding.severity,
    `${repositoryPath} finding ${finding.id} severity does not match its id`,
  );
  requireEvidence(
    Number.isInteger(finding.line) && finding.line >= 1 && finding.line <= lines,
    `${repositoryPath} finding line is outside the reviewed file`,
  );
  for (const field of [
    "attackPath",
    "affectedInvariant",
    "evidence",
    "fixOwner",
    "verificationRequirement",
  ]) {
    requireEvidence(
      typeof finding[field] === "string" && finding[field].trim().length > 0,
      `${repositoryPath} finding ${finding.id} is missing ${field}`,
    );
  }
  requireEvidence(
    ["remediated", "tracked-debt", "release-no-go"].includes(finding.disposition),
    `${repositoryPath} finding ${finding.id} has an invalid disposition`,
  );
  requireEvidence(
    Array.isArray(finding.remediation) &&
      finding.remediation.length > 0 &&
      finding.remediation.every((link) => typeof link === "string" && link.length > 0),
    `${repositoryPath} finding ${finding.id} has no remediation reference`,
  );
}

function applySemanticReviewEvidence(files, blobs, sourceCommitSha) {
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const findingIds = new Set();
  const reviewedPaths = new Set();
  const residualRiskIds = new Set();
  const evidenceSets = [];

  for (const declarationPath of repositoryAuditPolicy.reviewEvidencePaths) {
    const declarationFile = filesByPath.get(declarationPath);
    if (!declarationFile) continue;
    requireEvidence(
      declarationFile.contentKind === "text" && declarationFile.gitObjectType === "blob",
      `${declarationPath} must be a textual Git blob`,
    );
    const declaration = JSON.parse(
      decodeUtf8(blobs.get(declarationFile.gitObjectId), declarationPath),
    );
    requireEvidence(declaration.schemaVersion === 1, `${declarationPath} schemaVersion must be 1`);
    requireEvidence(
      /^batch-01a-[a-z0-9-]+$/.test(declaration.evidenceId),
      `${declarationPath} evidenceId is invalid`,
    );
    requireEvidence(
      declarationPath.endsWith(`/${declaration.evidenceId}.json`),
      `${declarationPath} does not match its evidenceId`,
    );
    requireEvidence(declaration.reviewBatch === 1, `${declarationPath} must describe Batch 1`);
    requireEvidence(
      typeof declaration.reviewedAt === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(declaration.reviewedAt),
      `${declarationPath} reviewedAt is invalid`,
    );
    requireEvidence(
      typeof declaration.reviewMethod === "string" && declaration.reviewMethod.length > 0,
      `${declarationPath} reviewMethod is required`,
    );
    requireEvidence(
      Array.isArray(declaration.residualRisks) && declaration.residualRisks.length > 0,
      `${declarationPath} must state residual risk`,
    );
    for (const risk of declaration.residualRisks) {
      requireEvidence(
        risk &&
          /^B01A-RISK-\d{3}$/.test(risk.id) &&
          !residualRiskIds.has(risk.id),
        `${declarationPath} has a duplicate or invalid residual-risk id`,
      );
      residualRiskIds.add(risk.id);
      requireEvidence(SEVERITIES.includes(risk.severity), `${risk.id} severity is invalid`);
      requireEvidence(
        typeof risk.statement === "string" && risk.statement.length > 0,
        `${risk.id} statement is required`,
      );
      requireEvidence(
        typeof risk.owner === "string" && risk.owner.length > 0,
        `${risk.id} owner is required`,
      );
      requireEvidence(
        ["tracked-debt", "release-no-go"].includes(risk.disposition),
        `${risk.id} disposition is invalid`,
      );
    }
    requireEvidence(
      Array.isArray(declaration.files) && declaration.files.length > 0,
      `${declarationPath} has no reviewed files`,
    );

    let previousPath = "";
    let reviewedLines = 0;
    let findings = 0;
    for (const entry of declaration.files) {
      requireEvidence(
        typeof entry.path === "string" && entry.path > previousPath,
        `${declarationPath} reviewed paths must be unique and sorted`,
      );
      previousPath = entry.path;
      requireEvidence(!reviewedPaths.has(entry.path), `${entry.path} is reviewed more than once`);
      const target = filesByPath.get(entry.path);
      requireEvidence(target, `${entry.path} is not in the exact tracked tree`);
      requireEvidence(
        target.contentKind === "text" && target.provenance === "source",
        `${entry.path} is not source text eligible for semantic review`,
      );
      requireEvidence(target.reviewBatch === declaration.reviewBatch, `${entry.path} is in the wrong batch`);
      requireEvidence(target.gitObjectId === entry.gitObjectId, `${entry.path} Git blob changed after review`);
      requireEvidence(target.sha256 === entry.sha256, `${entry.path} digest changed after review`);
      requireEvidence(target.lines === entry.lines, `${entry.path} line count changed after review`);
      validateReviewedRanges(entry.reviewedRanges, target.lines, entry.path);
      requireEvidence(
        Array.isArray(entry.reviewNotes) &&
          entry.reviewNotes.length > 0 &&
          entry.reviewNotes.every((note) => typeof note === "string" && note.length > 0),
        `${entry.path} requires semantic review notes`,
      );
      requireEvidence(Array.isArray(entry.findings), `${entry.path} findings must be an array`);
      for (const finding of entry.findings) {
        validateFinding(finding, entry.path, target.lines);
        requireEvidence(!findingIds.has(finding.id), `finding id ${finding.id} is duplicated`);
        findingIds.add(finding.id);
      }
      requireEvidence(
        ["no-confirmed-findings", "confirmed-findings-recorded"].includes(entry.findingDisposition),
        `${entry.path} finding disposition is invalid`,
      );
      requireEvidence(
        (entry.findings.length === 0) === (entry.findingDisposition === "no-confirmed-findings"),
        `${entry.path} finding disposition contradicts its findings`,
      );

      target.review = {
        status: "semantic-reviewed",
        semanticEvidence: {
          evidenceId: declaration.evidenceId,
          declarationPath,
          reviewedRanges: entry.reviewedRanges,
          reviewNotes: entry.reviewNotes,
          findingDisposition: entry.findingDisposition,
          findings: entry.findings,
        },
        remediation: [...new Set(entry.findings.flatMap((finding) => finding.remediation))],
        reviewedCommitSha: sourceCommitSha,
      };
      reviewedPaths.add(entry.path);
      reviewedLines += target.lines;
      findings += entry.findings.length;
    }

    evidenceSets.push({
      evidenceId: declaration.evidenceId,
      declarationPath,
      reviewBatch: declaration.reviewBatch,
      reviewedAt: declaration.reviewedAt,
      reviewMethod: declaration.reviewMethod,
      reviewedPaths: declaration.files.length,
      reviewedLines,
      findings,
      residualRisks: declaration.residualRisks,
      reviewedCommitSha: sourceCommitSha,
    });
  }
  return evidenceSets;
}

export async function generateRepositoryAuditManifest({
  repositoryRoot = process.cwd(),
  expectedSourceSha = process.env.TECPEY_AUDIT_SOURCE_SHA,
} = {}) {
  await assertAuditAuthorityClean(repositoryRoot);
  const sourceCommitSha = (await runGit(repositoryRoot, ["rev-parse", "HEAD^{commit}"]))
    .toString("ascii")
    .trim();
  if (expectedSourceSha && expectedSourceSha !== sourceCommitSha) {
    throw new Error(`Exact-head mismatch: expected ${expectedSourceSha}, checked out ${sourceCommitSha}`);
  }

  const committedAt = (await runGit(repositoryRoot, ["show", "-s", "--format=%cI", sourceCommitSha]))
    .toString("utf8")
    .trim();
  const treeBuffer = await runGit(repositoryRoot, [
    "ls-tree",
    "-r",
    "-z",
    "--full-tree",
    sourceCommitSha,
  ]);
  const treeEntries = parseTree(treeBuffer).sort(comparePaths);
  const blobEntries = treeEntries.filter((entry) => entry.objectType === "blob");
  const batchInput = Buffer.from(blobEntries.map((entry) => `${entry.objectId}\n`).join(""), "ascii");
  const blobBuffer = await runGit(repositoryRoot, ["cat-file", "--batch"], { input: batchInput });
  const blobs = parseBatchBlobs(blobBuffer, blobEntries);

  const files = treeEntries.map((entry) => {
    const isGitlink = entry.objectType === "commit";
    const blob = isGitlink ? null : blobs.get(entry.objectId);
    const contentKind = isGitlink ? "gitlink" : contentKindForBlob(blob);
    const provenance = isGitlink ? "vendored" : classifyProvenance(entry.path);
    const domain = classifyDomain(entry.path);
    const text = contentKind === "text" ? decodeUtf8(blob, entry.path) : null;
    const findings = text === null ? [] : scanText(text, provenance, entry.path);
    const digestInput = isGitlink
      ? Buffer.from(`gitlink\0${entry.objectId}`, "ascii")
      : blob;
    return {
      path: entry.path,
      gitMode: entry.gitMode,
      gitObjectId: entry.objectId,
      gitObjectType: entry.objectType,
      fileType: fileTypeForPath(entry.path, entry.gitMode),
      bytes: isGitlink ? 0 : blob.length,
      lines: text === null ? null : lineCount(text),
      sha256: createHash("sha256").update(digestInput).digest("hex"),
      contentKind,
      provenance,
      domain: domain.domain,
      riskTier: domain.riskTier,
      reviewBatch: domain.reviewBatch,
      classificationRule: domain.classificationRule,
      automatedScan: {
        status: isGitlink
          ? "not-applicable-gitlink"
          : text === null
            ? "not-applicable-binary"
            : "completed",
        findingCounts: findingCounts(findings),
        findings,
      },
      review: {
        status: initialReviewStatus({ contentKind, provenance }),
        semanticEvidence: null,
        remediation: [],
        reviewedCommitSha: null,
      },
      inventoryCommitSha: sourceCommitSha,
    };
  });
  const reviewEvidenceSets = applySemanticReviewEvidence(files, blobs, sourceCommitSha);

  return {
    schemaVersion: 2,
    policyVersion: repositoryAuditPolicy.version,
    sourceCommitSha,
    sourceCommittedAt: committedAt,
    completionClaim: false,
    summary: summarize(files),
    reviewEvidenceSets,
    reviewBatches: repositoryAuditPolicy.reviewBatches,
    files,
  };
}

export async function validateRepositoryAuditManifest(
  manifest,
  {
    repositoryRoot = process.cwd(),
    expectedSourceSha = process.env.TECPEY_AUDIT_SOURCE_SHA,
  } = {},
) {
  const expected = await generateRepositoryAuditManifest({ repositoryRoot, expectedSourceSha });
  const actualJson = `${JSON.stringify(manifest, null, 2)}\n`;
  const expectedJson = `${JSON.stringify(expected, null, 2)}\n`;
  if (actualJson !== expectedJson) {
    throw new Error(
      "Repository audit manifest does not match the exact tracked commit; regenerate it from the unchanged checkout",
    );
  }
  if (manifest.completionClaim !== false) {
    throw new Error("A partial repository audit must not claim repository-wide review completion");
  }
  return manifest.summary;
}
