import assert from "node:assert/strict";
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

async function fixtureRepository() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tecpey-audit-manifest-"));
  await git(root, "init", "--quiet");
  await fs.mkdir(path.join(root, "src", "lib", "wallet"), { recursive: true });
  await fs.mkdir(path.join(root, "public", "charting_library"), { recursive: true });
  await fs.writeFile(path.join(root, "README.md"), "review me\n", "utf8");
  await fs.writeFile(path.join(root, "src", "lib", "wallet", "sign.ts"), "// TODO harden\n", "utf8");
  await fs.writeFile(path.join(root, "public", "charting_library", "vendor.js"), "// TODO vendor\n", "utf8");
  await fs.writeFile(path.join(root, "asset.bin"), Buffer.from([0x00, 0xff, 0x01]));
  await git(root, "add", ".");
  await git(root, "commit", "--quiet", "-m", "fixture");
  return root;
}

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
  assert.equal(first.summary.trackedPaths, 4);
  assert.equal(first.files.some((file) => file.path === "untracked.txt"), false);
  assert.equal(first.files.find((file) => file.path === "README.md").lines, 1);
  assert.equal(first.files.find((file) => file.path === "asset.bin").lines, null);
  assert.equal(first.files.find((file) => file.path.endsWith("sign.ts")).riskTier, "P0");
  assert.equal(first.files.find((file) => file.path.endsWith("sign.ts")).automatedScan.findingCounts.P3, 1);
  assert.equal(
    first.files.find((file) => file.path.endsWith("vendor.js")).automatedScan.findingCounts.P3,
    0,
  );
  assert.equal(first.files.every((file) => file.inventoryCommitSha === sourceSha), true);
  assert.equal(first.files.every((file) => file.review.reviewedCommitSha === null), true);
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

test("policy assigns explicit provenance, domains, batches and pending status", () => {
  assert.equal(classifyProvenance("package-lock.json"), "generated");
  assert.equal(classifyProvenance("public/charting_library/bundle.js"), "vendored");
  assert.equal(classifyProvenance("src/app/page.tsx"), "source");
  assert.deepEqual(classifyDomain("src/lib/wallet/keystore.ts"), {
    domain: "wallet-custody",
    riskTier: "P0",
    reviewBatch: 7,
    classificationRule: "wallet-custody",
  });
  assert.equal(classifyDomain("src/components/Button.tsx").reviewBatch, 10);
  assert.equal(initialReviewStatus({ contentKind: "text", provenance: "source" }), "semantic-review-pending");
  assert.equal(initialReviewStatus({ contentKind: "binary", provenance: "source" }), "ownership-review-pending");
});
