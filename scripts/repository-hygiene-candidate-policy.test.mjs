import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { validateRepositoryHygieneCandidateRegistry } from "./repository-hygiene-candidate-policy.mjs";

const registry = JSON.parse(
  fs.readFileSync("config/repository-hygiene-candidate-ownership.json", "utf8"),
);
const hygiene = JSON.parse(
  execFileSync(process.execPath, ["scripts/audit-repository-hygiene.mjs", "--json"], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  }),
);
const options = {
  orphanCandidates: hygiene.orphanCandidates,
  readFile: (repositoryPath) => fs.readFileSync(repositoryPath),
};

function cloneRegistry() {
  return structuredClone(registry);
}

test("current hygiene candidates have exact content-bound ownership review", () => {
  assert.deepEqual(
    validateRepositoryHygieneCandidateRegistry(registry, options),
    [],
  );
});

test("policy rejects a newly unclassified candidate", () => {
  const findings = validateRepositoryHygieneCandidateRegistry(registry, {
    ...options,
    orphanCandidates: [...options.orphanCandidates, "src/unclassified.ts"],
  });
  assert.match(findings.join("\n"), /unclassified hygiene candidates: src\/unclassified\.ts/);
});

test("policy rejects duplicate or stale registry paths", () => {
  const changed = cloneRegistry();
  changed.candidates[1].path = changed.candidates[0].path;
  const findings = validateRepositoryHygieneCandidateRegistry(changed, options).join("\n");
  assert.match(findings, /candidate paths must be unique/);
  assert.match(findings, /unclassified hygiene candidates/);
});

test("policy rejects content drift after ownership review", () => {
  const changed = cloneRegistry();
  changed.candidates[0].reviewedBlobSha256 = "0".repeat(64);
  assert.match(
    validateRepositoryHygieneCandidateRegistry(changed, options).join("\n"),
    /content changed after ownership review/,
  );
});

test("policy never authorizes deletion for transitional or live candidates", () => {
  const changed = cloneRegistry();
  changed.candidates[0].deletionApproved = true;
  const findings = validateRepositoryHygieneCandidateRegistry(changed, options).join("\n");
  assert.match(findings, /deletion cannot be approved outside proven-dead/);
  assert.match(findings, /does not authorize deletions/);
});
