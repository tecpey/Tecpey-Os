import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  readSecretScanningBaseline,
  validateSecretScanningBaseline,
  writeGitleaksIgnoreFile,
} from "./secret-scanning-baseline.mjs";

const baseline = readSecretScanningBaseline();

function clone(value) {
  return structuredClone(value);
}

test("baseline binds exact scanner supply-chain and reviewed finding identities", () => {
  assert.equal(baseline.scanner.name, "gitleaks");
  assert.equal(baseline.scanner.version, "8.30.1");
  assert.equal(baseline.findings.length, 57);
  assert.equal(
    baseline.findings.every((finding) => finding.classification === "known-non-secret"),
    true,
  );

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "tecpey-secret-ignore-"));
  const outputPath = path.join(temporaryDirectory, "gitleaks.ignore");
  writeGitleaksIgnoreFile(baseline, outputPath);
  assert.deepEqual(
    fs.readFileSync(outputPath, "utf8").trim().split("\n"),
    baseline.findings.map((finding) => finding.findingIdentity),
  );
});

test("baseline rejects weakened, duplicate or mismatched finding authority", () => {
  const weakClassification = clone(baseline);
  weakClassification.findings[0].classification = "accepted-risk";
  assert.throws(
    () => validateSecretScanningBaseline(weakClassification),
    /known-non-secret/,
  );

  const duplicate = clone(baseline);
  duplicate.findings[1] = clone(duplicate.findings[0]);
  assert.throws(() => validateSecretScanningBaseline(duplicate), /duplicate/);

  const mismatched = clone(baseline);
  mismatched.findings[0].line += 1;
  assert.throws(() => validateSecretScanningBaseline(mismatched), /does not match/);

  const broadPath = clone(baseline);
  broadPath.findings[0].path = "../outside";
  broadPath.findings[0].findingIdentity =
    `${broadPath.findings[0].commit}:../outside:${broadPath.findings[0].ruleId}:${broadPath.findings[0].line}`;
  assert.throws(() => validateSecretScanningBaseline(broadPath), /canonical/);
});

test("baseline rejects floating scanner identity and unsorted review records", () => {
  const floatingVersion = clone(baseline);
  floatingVersion.scanner.version = "latest";
  assert.throws(() => validateSecretScanningBaseline(floatingVersion), /semantic version/);

  const shortCommit = clone(baseline);
  shortCommit.scanner.releaseCommit = "83d9cd6";
  assert.throws(() => validateSecretScanningBaseline(shortCommit), /full commit SHA/);

  const unsorted = clone(baseline);
  [unsorted.findings[0], unsorted.findings[1]] = [
    unsorted.findings[1],
    unsorted.findings[0],
  ];
  assert.throws(() => validateSecretScanningBaseline(unsorted), /sorted/);
});
