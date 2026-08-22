#!/usr/bin/env node
// QA-050 collector — assembles the per-viewport shards written by
// tests/e2e/specs/ui-ux-screenshot-matrix.spec.mjs into the artifact set the
// control names, then digests them.
//
// Same shape as the QA-051 collector, and for the same reason: Playwright runs
// each project in its own process, so every project writing the same file is a
// race. Each writes one shard and this merges them once, afterwards.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REQUIRED_VIEWPORTS, screenshotMatrixShape } from "./screenshot-matrix-routes.mjs";

function argumentValue(flag, fallback) {
  const found = process.argv.find((argument) => argument.startsWith(`${flag}=`));
  return found ? found.slice(flag.length + 1) : fallback;
}

const directory = path.resolve(argumentValue("--evidence-dir", "artifacts/ui-ux-screenshot-matrix"));
const shardDirectory = path.join(directory, "shards");

function headSha() {
  const provided = argumentValue("--source-sha", process.env.TECPEY_EVIDENCE_SHA);
  if (provided) return provided.trim();
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

let shardNames;
try {
  shardNames = readdirSync(shardDirectory).filter((name) => name.endsWith(".json"));
} catch {
  fail(
    `No shards in ${shardDirectory}. Run the screenshot matrix spec first — this ` +
      "script assembles evidence, it does not produce it.",
  );
}

const slots = [];
const seenViewports = new Set();
const runIds = new Set();
const shardShas = new Set();

for (const name of shardNames.sort()) {
  const shard = JSON.parse(readFileSync(path.join(shardDirectory, name), "utf8"));
  seenViewports.add(shard.viewport);
  runIds.add(shard.runId ?? "(none)");
  shardShas.add(shard.sourceCommitSha ?? "(none)");
  slots.push(...(shard.slots ?? []));
}

// A shard left behind by an earlier, partial run must not be folded into a
// later bundle: the result would look complete while describing no run that
// actually happened.
if (runIds.size > 1) {
  fail(
    `Shards come from ${runIds.size} different runs (${[...runIds].join(", ")}). ` +
      "A bundle assembled from more than one run describes no run that happened. " +
      `Clear ${shardDirectory} and re-run the screenshot matrix spec.`,
  );
}
const [runId] = [...runIds];
if (runId === "(none)" || String(runId).startsWith("unbound-")) {
  fail(
    "Shards carry no shared run identifier. The spec was run outside " +
      "tests/e2e/run-public-e2e.mjs, which is what binds the projects into one run.",
  );
}
if (shardShas.size > 1) {
  fail(`Shards name ${shardShas.size} different commits (${[...shardShas].join(", ")}).`);
}

const missing = Object.keys(REQUIRED_VIEWPORTS).filter((viewport) => !seenViewports.has(viewport));
if (missing.length > 0) {
  fail(
    `Shards are missing for: ${missing.join(", ")}. QA-050 requires all four ` +
      "RTL/LTR desktop and mobile viewports; a partial matrix is not the control.",
  );
}

mkdirSync(directory, { recursive: true });

const shape = screenshotMatrixShape();
const root = {
  schemaVersion: 1,
  evidenceClass: "ui-ux-screenshot-matrix-v1",
  generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
  sourceCommitSha: headSha(),
  routeCount: shape.routeCount,
  requiredSlots: shape.requiredSlots,
  viewports: Object.keys(REQUIRED_VIEWPORTS),
  slots: slots.sort((left, right) =>
    `${left.route}@${left.viewport}`.localeCompare(`${right.route}@${right.viewport}`),
  ),
};

const rootBytes = Buffer.from(`${JSON.stringify(root, null, 2)}\n`, "utf8");
writeFileSync(path.join(directory, "ui-ux-screenshot-matrix.json"), rootBytes);
writeFileSync(
  path.join(directory, "ui-ux-screenshot-matrix.json.sha256"),
  `${createHash("sha256").update(rootBytes).digest("hex")}  ui-ux-screenshot-matrix.json\n`,
  "utf8",
);

console.log(
  `Screenshot matrix assembled in ${directory}: ${slots.length} of ` +
    `${shape.requiredSlots} slots across ${seenViewports.size} viewports. ` +
    "The image archives and visual-defect-triage.json are produced by the capture " +
    "run and reviewed separately; this bundle records what was photographed.",
);
