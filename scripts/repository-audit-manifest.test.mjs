import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import {
  generateRepositoryAuditManifest,
  validateRepositoryAuditManifest,
} from "./repository-audit-manifest.mjs";
import {
  classifyDomain,
  classifyProvenance,
  initialReviewStatus,
} from "./repository-audit-policy.mjs";

const execFileAsync = promisify(execFile);

async function git(root, ...args) {
  await execFileAsync("git", args, {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      LANG: "C",
      LC_ALL: "C",
      GIT_AUTHOR_NAME: "Audit Test",
      GIT_AUTHOR_EMAIL: "audit-test@example.invalid",
      GIT_COMMITTER_NAME: "Audit Test",
      GIT_COMMITTER_EMAIL: "audit-test@example.invalid",
    },
  });
}

async function fixtureRepository({ withSemanticEvidence = true } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tecpey-audit-manifest-"));
  await git(root, "init", "--quiet");
  await fs.mkdir(path.join(root, "src", "lib", "wallet"), { recursive: true });
  await fs.mkdir(path.join(root, "public", "charting_library"), { recursive: true });
  await fs.writeFile(path.join(root, "README.md"), "TODO appears here as prose, not an annotation\n", "utf8");
  await fs.writeFile(path.join(root, "src", "lib", "wallet", "sign.ts"), "// TODO harden\n", "utf8");
  await fs.writeFile(path.join(root, "public", "charting_library", "vendor.js"), "// TODO vendor\n", "utf8");
  await fs.writeFile(path.join(root, "asset.bin"), Buffer.from([0x00, 0xff, 0x01]));
  await git(root, "add", ".");
  await git(root, "commit", "--quiet", "-m", "fixture");
  if (withSemanticEvidence) await addSemanticEvidenceFixture(root);
  return root;
}

async function addSemanticEvidenceFixture(root, overrides = {}) {
  const targetPath = "scripts/root-authority.mjs";
  const secondTargetPath = "scripts/supply-chain-authority.mjs";
  const thirdTargetPath = "scripts/ci-evidence-authority.mjs";
  const fourthTargetPath = "scripts/root-configuration-authority.mjs";
  await fs.mkdir(path.join(root, "scripts"), { recursive: true });
  await fs.writeFile(path.join(root, targetPath), "export const governed = true;\n", "utf8");
  await fs.writeFile(
    path.join(root, secondTargetPath),
    "export const runtimeGoverned = true;\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(root, thirdTargetPath),
    "export const ciEvidenceGoverned = true;\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(root, fourthTargetPath),
    "export const rootConfigurationGoverned = true;\n",
    "utf8",
  );
  await git(root, "add", ".");
  await git(root, "commit", "--quiet", "-m", "add reviewed authorities");
  const content = await fs.readFile(path.join(root, targetPath));
  const secondContent = await fs.readFile(path.join(root, secondTargetPath));
  const thirdContent = await fs.readFile(path.join(root, thirdTargetPath));
  const fourthContent = await fs.readFile(path.join(root, fourthTargetPath));
  const gitObjectId = (
    await execFileAsync("git", ["rev-parse", `HEAD:${targetPath}`], { cwd: root })
  ).stdout.trim();
  const secondGitObjectId = (
    await execFileAsync("git", ["rev-parse", `HEAD:${secondTargetPath}`], { cwd: root })
  ).stdout.trim();
  const thirdGitObjectId = (
    await execFileAsync("git", ["rev-parse", `HEAD:${thirdTargetPath}`], { cwd: root })
  ).stdout.trim();
  const fourthGitObjectId = (
    await execFileAsync("git", ["rev-parse", `HEAD:${fourthTargetPath}`], { cwd: root })
  ).stdout.trim();
  const declaration = {
    schemaVersion: 1,
    evidenceId: "batch-01a-audit-authority",
    reviewBatch: 1,
    reviewedAt: "2026-07-29",
    reviewMethod: "Complete line-addressable semantic review of one governed fixture.",
    residualRisks: [
      {
        id: "B01A-RISK-001",
        severity: "P3",
        statement: "Fixture review does not claim repository-wide completion.",
        owner: "audit-test",
        disposition: "tracked-debt",
      },
    ],
    files: [
      {
        path: targetPath,
        gitObjectId,
        sha256: createHash("sha256").update(content).digest("hex"),
        lines: 1,
        reviewedRanges: [{ startLine: 1, endLine: 1 }],
        findingDisposition: "no-confirmed-findings",
        reviewNotes: ["The single exported authority line was reviewed."],
        findings: [],
        ...overrides,
      },
    ],
  };
  const evidencePath = path.join(
    root,
    "docs",
    "audits",
    "evidence",
    "batch-01a-audit-authority.json",
  );
  const secondDeclaration = {
    schemaVersion: 1,
    evidenceId: "batch-01b-operational-workflows",
    reviewBatch: 1,
    reviewedAt: "2026-07-29",
    reviewMethod: "Complete line-addressable semantic review of a second governed fixture.",
    residualRisks: [
      {
        id: "B01B-RISK-001",
        severity: "P3",
        statement: "Second fixture review does not claim repository-wide completion.",
        owner: "audit-test",
        disposition: "tracked-debt",
      },
    ],
    files: [
      {
        path: secondTargetPath,
        gitObjectId: secondGitObjectId,
        sha256: createHash("sha256").update(secondContent).digest("hex"),
        lines: 1,
        reviewedRanges: [{ startLine: 1, endLine: 1 }],
        findingDisposition: "no-confirmed-findings",
        reviewNotes: ["The second exported authority line was reviewed."],
        findings: [],
      },
    ],
  };
  const secondEvidencePath = path.join(
    root,
    "docs",
    "audits",
    "evidence",
    "batch-01b-operational-workflows.json",
  );
  const thirdDeclaration = {
    schemaVersion: 1,
    evidenceId: "batch-01c-ci-evidence",
    reviewBatch: 1,
    reviewedAt: "2026-07-30",
    reviewMethod: "Complete line-addressable semantic review of a third governed fixture.",
    residualRisks: [
      {
        id: "B01C-RISK-001",
        severity: "P3",
        statement: "Third fixture review does not claim repository-wide completion.",
        owner: "audit-test",
        disposition: "tracked-debt",
      },
    ],
    files: [
      {
        path: thirdTargetPath,
        gitObjectId: thirdGitObjectId,
        sha256: createHash("sha256").update(thirdContent).digest("hex"),
        lines: 1,
        reviewedRanges: [{ startLine: 1, endLine: 1 }],
        findingDisposition: "no-confirmed-findings",
        reviewNotes: ["The third exported authority line was reviewed."],
        findings: [],
      },
    ],
  };
  const thirdEvidencePath = path.join(
    root,
    "docs",
    "audits",
    "evidence",
    "batch-01c-ci-evidence.json",
  );
  const fourthDeclaration = {
    schemaVersion: 1,
    evidenceId: "batch-01d-root-configuration",
    reviewBatch: 1,
    reviewedAt: "2026-07-30",
    reviewMethod: "Complete line-addressable semantic review of a fourth governed fixture.",
    residualRisks: [
      {
        id: "B01D-RISK-001",
        severity: "P3",
        statement: "Fourth fixture review does not claim repository-wide completion.",
        owner: "audit-test",
        disposition: "tracked-debt",
      },
    ],
    files: [
      {
        path: fourthTargetPath,
        gitObjectId: fourthGitObjectId,
        sha256: createHash("sha256").update(fourthContent).digest("hex"),
        lines: 1,
        reviewedRanges: [{ startLine: 1, endLine: 1 }],
        findingDisposition: "no-confirmed-findings",
        reviewNotes: ["The fourth exported authority line was reviewed."],
        findings: [],
      },
    ],
  };
  const fourthEvidencePath = path.join(
    root,
    "docs",
    "audits",
    "evidence",
    "batch-01d-root-configuration.json",
  );
  await fs.mkdir(path.dirname(evidencePath), { recursive: true });
  await fs.writeFile(evidencePath, `${JSON.stringify(declaration, null, 2)}\n`, "utf8");
  await fs.writeFile(
    secondEvidencePath,
    `${JSON.stringify(secondDeclaration, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    thirdEvidencePath,
    `${JSON.stringify(thirdDeclaration, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    fourthEvidencePath,
    `${JSON.stringify(fourthDeclaration, null, 2)}\n`,
    "utf8",
  );
  await git(root, "add", ".");
  await git(root, "commit", "--quiet", "-m", "add semantic evidence");
  return { declaration, evidencePath, targetPath };
}

test("semantic evidence rejects a finding severity that contradicts its id", async (t) => {
  const root = await fixtureRepository({ withSemanticEvidence: false });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await addSemanticEvidenceFixture(root, {
    findingDisposition: "confirmed-findings",
    findings: [{
      id: "B01A-P0-001",
      severity: "P3",
      line: 1,
      attackPath: "Contradictory evidence could mislead release consumers.",
      affectedInvariant: "Finding identifiers and severities must agree.",
      evidence: "The ID encodes P0 while severity declares P3.",
      fixOwner: "repository-supply-chain",
      verificationRequirement: "Manifest generation must fail closed.",
      disposition: "release-no-go",
      remediation: ["#156"],
    }],
  });
  const sourceSha = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await assert.rejects(
    generateRepositoryAuditManifest({
      repositoryRoot: root,
      expectedSourceSha: sourceSha,
    }),
    /severity does not match its id/,
  );
});

test("semantic evidence rejects a finding id from another evidence slice", async (t) => {
  const root = await fixtureRepository({ withSemanticEvidence: false });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await addSemanticEvidenceFixture(root, {
    findingDisposition: "confirmed-findings",
    findings: [{
      id: "B01B-P3-001",
      severity: "P3",
      line: 1,
      attackPath: "A cross-slice identifier could make evidence ownership ambiguous.",
      affectedInvariant: "Each finding must be owned by its declaring evidence slice.",
      evidence: "The Batch 01A declaration uses a Batch 01B identifier.",
      fixOwner: "repository-supply-chain",
      verificationRequirement: "Manifest generation must fail closed.",
      disposition: "tracked-debt",
      remediation: ["#156"],
    }],
  });
  const sourceSha = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await assert.rejects(
    generateRepositoryAuditManifest({
      repositoryRoot: root,
      expectedSourceSha: sourceSha,
    }),
    /finding id is not canonical/,
  );
});

test("manifest inventories the exact committed tree with deterministic evidence", async (t) => {
  const root = await fixtureRepository();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceSha = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();

  await fs.writeFile(path.join(root, "README.md"), "dirty working tree must not be inventoried\n", "utf8");
  await fs.writeFile(path.join(root, "untracked.txt"), "not tracked\n", "utf8");

  const first = await generateRepositoryAuditManifest({
    repositoryRoot: root,
    expectedSourceSha: sourceSha,
  });
  const second = await generateRepositoryAuditManifest({
    repositoryRoot: root,
    expectedSourceSha: sourceSha,
  });

  assert.deepEqual(first, second);
  assert.equal(first.summary.trackedPaths, 12);
  assert.equal(first.files.some((file) => file.path === "untracked.txt"), false);
  assert.equal(first.files.find((file) => file.path === "README.md").lines, 1);
  assert.equal(first.files.find((file) => file.path === "README.md").automatedScan.findingCounts.P3, 0);
  assert.equal(first.files.find((file) => file.path === "asset.bin").lines, null);
  assert.equal(first.files.find((file) => file.path.endsWith("sign.ts")).riskTier, "P0");
  assert.equal(first.files.find((file) => file.path.endsWith("sign.ts")).automatedScan.findingCounts.P3, 1);
  assert.equal(
    first.files.find((file) => file.path.endsWith("vendor.js")).automatedScan.findingCounts.P3,
    0,
  );
  assert.equal(first.files.every((file) => file.inventoryCommitSha === sourceSha), true);
  assert.equal(first.reviewEvidenceSets.length, 4);
  assert.equal(
    first.files.filter((file) => file.review.reviewedCommitSha !== null).length,
    4,
  );
  await validateRepositoryAuditManifest(first, { repositoryRoot: root, expectedSourceSha: sourceSha });
});

test("manifest rejects an expected SHA that is not the exact checkout", async (t) => {
  const root = await fixtureRepository();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await assert.rejects(
    generateRepositoryAuditManifest({
      repositoryRoot: root,
      expectedSourceSha: "0000000000000000000000000000000000000000",
    }),
    /Exact-head mismatch/,
  );
});

test("manifest rejects dirty or staged audit authority code", async (t) => {
  const root = await fixtureRepository();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "scripts"), { recursive: true });
  const policyPath = path.join(root, "scripts", "repository-audit-policy.mjs");
  await fs.writeFile(policyPath, "export const policyVersion = 1;\n", "utf8");
  await git(root, "add", ".");
  await git(root, "commit", "--quiet", "-m", "add audit authority fixture");

  await fs.writeFile(policyPath, "export const policyVersion = 2;\n", "utf8");
  await assert.rejects(
    generateRepositoryAuditManifest({ repositoryRoot: root }),
    /audit authority files differ from the exact committed tree/,
  );

  await git(root, "add", policyPath);
  await assert.rejects(
    generateRepositoryAuditManifest({ repositoryRoot: root }),
    /audit authority files differ from the exact committed tree/,
  );
});

test("manifest fails closed instead of replacing a non-UTF-8 tracked path", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tecpey-audit-invalid-path-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await git(root, "init", "--quiet");
  const invalidPath = Buffer.concat([
    Buffer.from(root, "utf8"),
    Buffer.from([path.sep.charCodeAt(0), 0xff]),
  ]);
  await fs.writeFile(invalidPath, "invalid path encoding\n");
  await git(root, "add", ".");
  await git(root, "commit", "--quiet", "-m", "invalid path fixture");

  await assert.rejects(
    generateRepositoryAuditManifest({ repositoryRoot: root }),
    /tracked path is not valid UTF-8/,
  );
});

test("manifest verification rejects tampering or path omission", async (t) => {
  const root = await fixtureRepository();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const manifest = await generateRepositoryAuditManifest({ repositoryRoot: root });
  manifest.files.pop();
  manifest.summary.trackedPaths -= 1;
  await assert.rejects(
    validateRepositoryAuditManifest(manifest, { repositoryRoot: root }),
    /does not match the exact tracked commit/,
  );
});

test("manifest generation and verification reject a deleted configured evidence declaration", async (t) => {
  const root = await fixtureRepository();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const manifest = await generateRepositoryAuditManifest({ repositoryRoot: root });
  const evidencePath = "docs/audits/evidence/batch-01a-audit-authority.json";

  await git(root, "rm", "--quiet", evidencePath);
  await git(root, "commit", "--quiet", "-m", "delete configured semantic evidence");

  const expectedError =
    /batch-01a-audit-authority\.json is missing from the exact tracked tree/;
  await assert.rejects(
    generateRepositoryAuditManifest({ repositoryRoot: root }),
    expectedError,
  );
  await assert.rejects(
    validateRepositoryAuditManifest(manifest, { repositoryRoot: root }),
    expectedError,
  );
});

test("manifest applies line-addressable semantic evidence to the exact reviewed blob", async (t) => {
  const root = await fixtureRepository({ withSemanticEvidence: false });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { targetPath } = await addSemanticEvidenceFixture(root);
  const sourceSha = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();

  const manifest = await generateRepositoryAuditManifest({
    repositoryRoot: root,
    expectedSourceSha: sourceSha,
  });
  const reviewed = manifest.files.find((file) => file.path === targetPath);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.reviewEvidenceSets.length, 4);
  assert.equal(manifest.reviewEvidenceSets[0].reviewedPaths, 1);
  assert.equal(manifest.reviewEvidenceSets[0].reviewedLines, 1);
  assert.equal(reviewed.review.status, "semantic-reviewed");
  assert.equal(reviewed.review.reviewedCommitSha, sourceSha);
  assert.deepEqual(reviewed.review.semanticEvidence.reviewedRanges, [
    { startLine: 1, endLine: 1 },
  ]);
  assert.equal(manifest.completionClaim, false);
  await validateRepositoryAuditManifest(manifest, {
    repositoryRoot: root,
    expectedSourceSha: sourceSha,
  });
});

test("manifest rejects stale reviewed blobs and incomplete line coverage", async (t) => {
  const staleRoot = await fixtureRepository({ withSemanticEvidence: false });
  t.after(() => fs.rm(staleRoot, { recursive: true, force: true }));
  const stale = await addSemanticEvidenceFixture(staleRoot);
  await fs.writeFile(path.join(staleRoot, stale.targetPath), "export const governed = false;\n", "utf8");
  await git(staleRoot, "add", ".");
  await git(staleRoot, "commit", "--quiet", "-m", "change reviewed authority");
  await assert.rejects(
    generateRepositoryAuditManifest({ repositoryRoot: staleRoot }),
    /Git blob changed after review/,
  );

  const gapRoot = await fixtureRepository({ withSemanticEvidence: false });
  t.after(() => fs.rm(gapRoot, { recursive: true, force: true }));
  const gap = await addSemanticEvidenceFixture(gapRoot);
  gap.declaration.files[0].reviewedRanges = [{ startLine: 1, endLine: 2 }];
  await fs.writeFile(gap.evidencePath, `${JSON.stringify(gap.declaration, null, 2)}\n`, "utf8");
  await git(gapRoot, "add", ".");
  await git(gapRoot, "commit", "--quiet", "-m", "break reviewed ranges");
  await assert.rejects(
    generateRepositoryAuditManifest({ repositoryRoot: gapRoot }),
    /reviewed ranges must be ordered, contiguous and bounded/,
  );
});

test("manifest inventories a tracked gitlink without requiring submodule object content", async (t) => {
  const root = await fixtureRepository();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const referencedCommit = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await git(
    root,
    "update-index",
    "--add",
    "--cacheinfo",
    `160000,${referencedCommit},vendor/component`,
  );
  await git(root, "commit", "--quiet", "-m", "track gitlink");

  const manifest = await generateRepositoryAuditManifest({ repositoryRoot: root });
  const gitlink = manifest.files.find((file) => file.path === "vendor/component");
  assert.deepEqual(
    {
      gitMode: gitlink.gitMode,
      gitObjectId: gitlink.gitObjectId,
      gitObjectType: gitlink.gitObjectType,
      fileType: gitlink.fileType,
      bytes: gitlink.bytes,
      lines: gitlink.lines,
      contentKind: gitlink.contentKind,
      provenance: gitlink.provenance,
      scanStatus: gitlink.automatedScan.status,
      reviewStatus: gitlink.review.status,
    },
    {
      gitMode: "160000",
      gitObjectId: referencedCommit,
      gitObjectType: "commit",
      fileType: "gitlink",
      bytes: 0,
      lines: null,
      contentKind: "gitlink",
      provenance: "vendored",
      scanStatus: "not-applicable-gitlink",
      reviewStatus: "ownership-review-pending",
    },
  );
});

test("policy assigns explicit provenance, domains, batches and pending status", () => {
  assert.equal(classifyProvenance("package-lock.json"), "generated");
  assert.equal(
    classifyProvenance("docs/security/generated/api-security-manifest.json"),
    "generated",
  );
  assert.equal(
    classifyProvenance("docs/security/generated/tenant-principal-isolation-inventory.json"),
    "generated",
  );
  assert.equal(
    classifyProvenance("docs/internal-qa/QA_STATIC_PRODUCTION_REPORT.json"),
    "generated",
  );
  assert.equal(
    classifyProvenance("docs/security/generated/api-security-manifest-reviewed-deltas.json"),
    "source",
  );
  assert.equal(classifyProvenance("public/charting_library/bundle.js"), "vendored");
  assert.equal(classifyProvenance("src/app/page.tsx"), "source");
  assert.deepEqual(classifyDomain("src/lib/wallet/keystore.ts"), {
    domain: "wallet-custody",
    riskTier: "P0",
    reviewBatch: 7,
    classificationRule: "wallet-custody",
  });
  assert.deepEqual(classifyDomain("src/lib/trading/engine.ts"), {
    domain: "exchange-ledger",
    riskTier: "P0",
    reviewBatch: 6,
    classificationRule: "exchange-ledger",
  });
  assert.equal(classifyDomain("src/lib/offline-sync-authority.ts").reviewBatch, 2);
  assert.equal(classifyDomain("src/lib/catalog/repository.ts").reviewBatch, 2);
  assert.equal(classifyDomain(".github/workflows/repository-audit-manifest.yml").reviewBatch, 1);
  assert.deepEqual(classifyDomain("scripts/audit-repository-hygiene.mjs"), {
    domain: "repository-supply-chain",
    riskTier: "P1",
    reviewBatch: 1,
    classificationRule: "repository-supply-chain",
  });
  assert.equal(classifyDomain("scripts/repository-audit-manifest.mjs").reviewBatch, 1);
  assert.deepEqual(classifyDomain("scripts/ci-workflow-policy.test.mjs"), {
    domain: "repository-supply-chain",
    riskTier: "P1",
    reviewBatch: 1,
    classificationRule: "repository-supply-chain",
  });
  assert.equal(classifyDomain("src/lib/compliance/ofac.ts").reviewBatch, 3);
  assert.deepEqual(classifyDomain("config/api-security-exceptions.json"), {
    domain: "authentication-admin-security",
    riskTier: "P1",
    reviewBatch: 3,
    classificationRule: "authentication-admin-security",
  });
  assert.deepEqual(classifyDomain("config/api-security-operation-overrides.json"), {
    domain: "authentication-admin-security",
    riskTier: "P1",
    reviewBatch: 3,
    classificationRule: "authentication-admin-security",
  });
  assert.equal(classifyDomain("src/data/academyPath.ts").reviewBatch, 4);
  assert.equal(classifyDomain("src/lib/trading-dna.ts").reviewBatch, 5);
  assert.equal(classifyDomain("src/lib/coaching-engine.ts").reviewBatch, 8);
  assert.equal(classifyDomain("src/lib/notifications/policy.ts").reviewBatch, 9);
  assert.equal(classifyDomain("src/components/Button.tsx").reviewBatch, 10);
  assert.equal(classifyDomain("src/hooks/useLiveTicker.ts").reviewBatch, 10);
  assert.equal(classifyDomain("src/i18n/messages/fa.json").reviewBatch, 10);
  assert.deepEqual(classifyDomain("src/lib/entity.ts"), {
    domain: "product-ui",
    riskTier: "P2",
    reviewBatch: 10,
    classificationRule: "product-ui-prefix",
  });
  assert.equal(classifyDomain("src/lib/ops/operational-job-evidence.ts").reviewBatch, 11);
  assert.deepEqual(classifyDomain("server.ts"), {
    domain: "operations-runtime",
    riskTier: "P1",
    reviewBatch: 11,
    classificationRule: "operations-runtime",
  });
  assert.deepEqual(classifyDomain("VERIFY_PRODUCTION.sh"), {
    domain: "operations-runtime",
    riskTier: "P1",
    reviewBatch: 11,
    classificationRule: "operations-runtime",
  });
  assert.deepEqual(classifyDomain("src/lib/platform-config.ts"), {
    domain: "platform-core",
    riskTier: "P1",
    reviewBatch: 1,
    classificationRule: "platform-core-explicit",
  });
  assert.throws(
    () => classifyDomain("src/lib/new-unclassified-module.ts"),
    /no explicit audit domain policy/,
  );
  assert.equal(initialReviewStatus({ contentKind: "text", provenance: "source" }), "semantic-review-pending");
  assert.equal(initialReviewStatus({ contentKind: "binary", provenance: "source" }), "ownership-review-pending");
});
