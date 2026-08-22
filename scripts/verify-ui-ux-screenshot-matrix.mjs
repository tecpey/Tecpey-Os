#!/usr/bin/env node
// QA-050 verifier — `npm run qa:screenshot-matrix:verify`.
//
// Reads a screenshot matrix evidence bundle from disk and validates it offline
// against scripts/ui-ux-screenshot-matrix-policy.mjs. Offline is the point: the
// artifact has to stand on its own after the capture run that produced it is
// gone, which is what separates evidence from a folder full of PNGs.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  REQUIRED_VIEWPORTS,
  screenshotMatrixShape,
  screenshotMatrixTargets,
} from "./screenshot-matrix-routes.mjs";
import { screenshotMatrixFindings } from "./ui-ux-screenshot-matrix-policy.mjs";

const ROOT_ARTIFACT = "ui-ux-screenshot-matrix.json";
const TRIAGE_ARTIFACT = "visual-defect-triage.json";

function argumentValue(flag, fallback) {
  const found = process.argv.find((argument) => argument.startsWith(`${flag}=`));
  return found ? found.slice(flag.length + 1) : fallback;
}

const directory = path.resolve(
  argumentValue("--evidence-dir", "artifacts/ui-ux-screenshot-matrix"),
);

// Exact-head binding is not optional, so it does not depend on the caller
// remembering to pass it. A checkout that cannot report a head fails rather
// than falling back to accepting a bundle from any commit.
function repositoryHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const expectedSha = argumentValue(
  "--expected-sha",
  process.env.TECPEY_EVIDENCE_SHA ?? repositoryHead(),
);

async function readBytes(name) {
  try {
    return await readFile(path.join(directory, name));
  } catch {
    return null;
  }
}

const failures = [];

function parse(bytes, name) {
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

if (!expectedSha) {
  failures.push(
    "no expected commit could be determined — pass --expected-sha or set " +
      "TECPEY_EVIDENCE_SHA; evidence that is not bound to an exact head is not evidence",
  );
}

const rootBytes = await readBytes(ROOT_ARTIFACT);
const root = parse(rootBytes, ROOT_ARTIFACT);
const rootDigestBytes = await readBytes(`${ROOT_ARTIFACT}.sha256`);
if (rootDigestBytes === null) failures.push(`${ROOT_ARTIFACT}.sha256 is missing from ${directory}`);
const triage = parse(await readBytes(TRIAGE_ARTIFACT), TRIAGE_ARTIFACT);

failures.push(
  ...screenshotMatrixFindings({
    root,
    rootDigest: rootDigestBytes?.toString("utf8"),
    triage,
    expectedShape: screenshotMatrixShape(),
    // The routes come from the application, not from the bundle, so a matrix
    // cannot declare its own coverage complete by listing fewer routes.
    expectedRoutes: screenshotMatrixTargets().map((target) => target.pattern),
    viewports: Object.keys(REQUIRED_VIEWPORTS),
    digestOf: (name) =>
      name === "root" && rootBytes
        ? createHash("sha256").update(rootBytes).digest("hex")
        : null,
    expectedSha,
  }),
);

if (failures.length > 0) {
  console.error("Screenshot matrix evidence (QA-050) verification failed:\n");
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  console.error(
    "\nThis artifact does not establish that every route was captured at every " +
      "viewport with its visual defects triaged. QA-050 stays blocked.",
  );
  process.exitCode = 1;
} else {
  console.log(
    `Screenshot matrix evidence (QA-050) verified: ${root.slots.length} slots across ` +
      `${root.routeCount} routes and ${root.viewports.length} viewports, every capture a ` +
      `distinct 200, zero unresolved P0/P1 visual defects, bound to ${root.sourceCommitSha}.`,
  );
}
