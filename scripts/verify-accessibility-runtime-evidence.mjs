#!/usr/bin/env node
// QA-051 verifier — `npm run qa:a11y-runtime:verify`.
//
// Reads an accessibility runtime evidence bundle from disk and validates it
// offline against scripts/accessibility-runtime-evidence-policy.mjs. Offline is
// the point: the artifact has to stand on its own after the browser run that
// produced it is gone, which is what separates evidence from a green CI badge.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  REQUIRED_CHECKS,
  accessibilityRuntimeEvidenceFindings,
} from "./accessibility-runtime-evidence-policy.mjs";

const ROOT_ARTIFACT = "accessibility-runtime-evidence.json";

function argumentValue(flag, fallback) {
  const found = process.argv.find((argument) => argument.startsWith(`${flag}=`));
  return found ? found.slice(flag.length + 1) : fallback;
}

const directory = path.resolve(
  argumentValue("--evidence-dir", "artifacts/accessibility-runtime"),
);
const expectedSha = argumentValue("--expected-sha", process.env.TECPEY_EVIDENCE_SHA ?? null);

async function readBytes(name) {
  try {
    return await readFile(path.join(directory, name));
  } catch {
    return null;
  }
}

function parse(bytes, name, failures) {
  if (bytes === null) {
    failures.push(`${name} is missing from ${directory}`);
    return null;
  }
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    failures.push(`${name} is not valid JSON: ${error.message}`);
    return null;
  }
}

const failures = [];

const rootBytes = await readBytes(ROOT_ARTIFACT);
const root = parse(rootBytes, ROOT_ARTIFACT, failures);
const rootDigestBytes = await readBytes(`${ROOT_ARTIFACT}.sha256`);
if (rootDigestBytes === null) failures.push(`${ROOT_ARTIFACT}.sha256 is missing from ${directory}`);

const reportBytes = {};
const reports = {};
for (const [name, artifact] of Object.entries(REQUIRED_CHECKS)) {
  const bytes = await readBytes(artifact);
  reportBytes[name] = bytes;
  reports[name] = bytes === null ? null : parse(bytes, artifact, failures);
}

const digests = new Map();
if (rootBytes) digests.set("root", createHash("sha256").update(rootBytes).digest("hex"));
for (const [name, bytes] of Object.entries(reportBytes)) {
  if (bytes) digests.set(name, createHash("sha256").update(bytes).digest("hex"));
}

failures.push(
  ...accessibilityRuntimeEvidenceFindings({
    root,
    rootDigest: rootDigestBytes?.toString("utf8"),
    reports,
    digestOf: (name) => digests.get(name) ?? null,
    expectedSha,
  }),
);

if (failures.length > 0) {
  console.error("Accessibility runtime evidence (QA-051) verification failed:\n");
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  console.error(
    "\nThis artifact does not establish that the runtime accessibility checks ran " +
      "across every required viewport. QA-051 stays blocked.",
  );
  process.exitCode = 1;
} else {
  const surfaces = root.checks.axe.surfaces;
  console.log(
    `Accessibility runtime evidence (QA-051) verified: ${surfaces} surface checks across ` +
      `${root.viewports.length} viewports, five checks recorded, zero critical or serious violations, ` +
      `bound to ${root.sourceCommitSha}.`,
  );
}
