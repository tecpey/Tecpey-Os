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

export async function generateRepositoryAuditManifest({
  repositoryRoot = process.cwd(),
  expectedSourceSha = process.env.TECPEY_AUDIT_SOURCE_SHA,
} = {}) {
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

  return {
    schemaVersion: 1,
    policyVersion: repositoryAuditPolicy.version,
    sourceCommitSha,
    sourceCommittedAt: committedAt,
    completionClaim: false,
    summary: summarize(files),
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
    throw new Error("Batch 0 inventory must not claim repository-wide review completion");
  }
  if (manifest.files.some((file) => file.review.reviewedCommitSha !== null)) {
    throw new Error("Batch 0 cannot publish semantic review SHAs before review evidence exists");
  }
  return manifest.summary;
}
