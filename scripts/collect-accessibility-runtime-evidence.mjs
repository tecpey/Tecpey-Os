#!/usr/bin/env node
// QA-051 collector — assembles the per-viewport shards written by
// tests/e2e/specs/academy-arena-mentor-accessibility.spec.mjs into the artifact
// set the control names, then digests them.
//
// Kept separate from the browser run on purpose. Playwright executes each
// project in its own process, so having every project write the same files is a
// race; each writes one shard and this merges them once, afterwards.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { REQUIRED_CHECKS, REQUIRED_VIEWPORTS } from "./accessibility-runtime-evidence-policy.mjs";

function argumentValue(flag, fallback) {
  const found = process.argv.find((argument) => argument.startsWith(`${flag}=`));
  return found ? found.slice(flag.length + 1) : fallback;
}

const directory = path.resolve(argumentValue("--evidence-dir", "artifacts/accessibility-runtime"));
const shardDirectory = path.join(directory, "shards");

function headSha() {
  const provided = argumentValue("--source-sha", process.env.TECPEY_EVIDENCE_SHA);
  if (provided) return provided.trim();
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

let shardNames;
try {
  shardNames = readdirSync(shardDirectory).filter((name) => name.endsWith(".json"));
} catch {
  console.error(
    `No shards in ${shardDirectory}. Run the accessibility spec first — this script ` +
      "assembles evidence, it does not produce it.",
  );
  process.exit(1);
}

const merged = Object.fromEntries(Object.keys(REQUIRED_CHECKS).map((name) => [name, []]));
const seenViewports = new Set();
const runIds = new Set();
const shardShas = new Set();

for (const name of shardNames.sort()) {
  const shard = JSON.parse(readFileSync(path.join(shardDirectory, name), "utf8"));
  seenViewports.add(shard.viewport);
  runIds.add(shard.runId ?? "(none)");
  shardShas.add(shard.sourceCommitSha ?? "(none)");
  for (const check of Object.keys(REQUIRED_CHECKS)) {
    merged[check].push(...(shard.records?.[check] ?? []));
  }
}

// The shard directory is not cleared between runs. A rerun that dies before one
// project finishes leaves that project's previous shard behind, and merging it
// with the new ones would produce a complete-looking bundle for a matrix that
// never completed — then stamp it with the current commit. Every shard has to
// name the same run.
if (runIds.size > 1) {
  console.error(
    `Shards come from ${runIds.size} different runs (${[...runIds].join(", ")}). ` +
      "A bundle assembled from more than one run describes no run that happened. " +
      `Clear ${shardDirectory} and re-run the accessibility spec.`,
  );
  process.exit(1);
}

const [runId] = [...runIds];
if (runId === "(none)" || runId.startsWith("unbound-")) {
  console.error(
    "Shards carry no shared run identifier. The spec was run outside " +
      "tests/e2e/run-public-e2e.mjs, which is what binds the four projects into " +
      "one run, so these shards cannot be shown to describe a single matrix.",
  );
  process.exit(1);
}

if (shardShas.size > 1) {
  console.error(
    `Shards name ${shardShas.size} different commits (${[...shardShas].join(", ")}).`,
  );
  process.exit(1);
}

// The commit the bundle claims has to be the commit the checks actually ran at.
// Shards agreeing with each other is not enough: four shards from an older run,
// collected after checking out a newer commit, would be stamped with the new
// head and become an exact-head bundle the verifier accepts.
const sourceCommitSha = headSha();
const [shardSha] = [...shardShas];
if (shardSha === "(none)") {
  console.error(
    "Shards do not record the commit they were captured at. Set TECPEY_EVIDENCE_SHA " +
      "for the run; a bundle cannot be bound to a head the run never saw.",
  );
  process.exit(1);
}
if (shardSha !== sourceCommitSha) {
  console.error(
    `Shards were captured at ${shardSha} but HEAD is ${sourceCommitSha}. ` +
      "Re-run the accessibility spec at this commit rather than relabelling older shards.",
  );
  process.exit(1);
}

// Fail here rather than emit a bundle the verifier will reject: a partial run is
// a fact about the run, and it should surface where it happened.
const missing = REQUIRED_VIEWPORTS.filter((viewport) => !seenViewports.has(viewport));
if (missing.length > 0) {
  console.error(
    `Shards are missing for: ${missing.join(", ")}. QA-051 requires all four ` +
      "RTL/LTR desktop and mobile projects; a partial matrix is not the control.",
  );
  process.exit(1);
}

mkdirSync(directory, { recursive: true });

const digests = {};
for (const [check, artifact] of Object.entries(REQUIRED_CHECKS)) {
  const bytes = Buffer.from(`${JSON.stringify(merged[check], null, 2)}\n`, "utf8");
  writeFileSync(path.join(directory, artifact), bytes);
  digests[check] = createHash("sha256").update(bytes).digest("hex");
}

const root = {
  schemaVersion: 1,
  evidenceClass: "accessibility-runtime-evidence-v1",
  generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
  sourceCommitSha,
  viewports: [...REQUIRED_VIEWPORTS],
  checks: Object.fromEntries(
    Object.entries(REQUIRED_CHECKS).map(([check, artifact]) => [
      check,
      {
        artifact,
        sha256: digests[check],
        surfaces: merged[check].length,
        ...(check === "axe"
          ? {
              criticalOrSerious: merged.axe.reduce(
                (total, record) => total + (Number(record.criticalOrSeriousCount) || 0),
                0,
              ),
            }
          : {}),
      },
    ]),
  ),
};

const rootBytes = Buffer.from(`${JSON.stringify(root, null, 2)}\n`, "utf8");
writeFileSync(path.join(directory, "accessibility-runtime-evidence.json"), rootBytes);
writeFileSync(
  path.join(directory, "accessibility-runtime-evidence.json.sha256"),
  `${createHash("sha256").update(rootBytes).digest("hex")}  accessibility-runtime-evidence.json\n`,
  "utf8",
);

console.log(
  `Accessibility runtime evidence assembled in ${directory}: ` +
    `${merged.axe.length} surface checks across ${seenViewports.size} viewports, ` +
    `${root.checks.axe.criticalOrSerious} critical or serious violations.`,
);
