import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateMentorRiveAcceptance,
  verifyMentorRiveArtifacts,
} from "./mentor-rive-acceptance-policy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_EVIDENCE =
  "docs/mentor/acceptance/accepted/tecpey-mentor-rive-acceptance.v1.json";
const MANIFEST = "docs/mentor/rig/tecpey-mentor-rig-manifest.v1.json";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function runMentorRiveAcceptanceCheck({
  evidencePath = DEFAULT_EVIDENCE,
  rootDir = ROOT,
} = {}) {
  const resolvedEvidence = path.resolve(rootDir, evidencePath);
  const [document, manifest] = await Promise.all([
    readJson(resolvedEvidence),
    readJson(path.join(rootDir, MANIFEST)),
  ]);
  const policy = evaluateMentorRiveAcceptance(document, manifest);
  const artifacts = await verifyMentorRiveArtifacts(document, manifest, rootDir);
  return {
    ok: policy.ok && artifacts.ok,
    evidencePath: path.relative(rootDir, resolvedEvidence),
    stage: policy.stage,
    requiredCounts: policy.requiredCounts,
    errors: [...policy.errors, ...artifacts.errors],
  };
}

async function runCli() {
  const argument = process.argv.slice(2).find((value) => !value.startsWith("--"));
  const asJson = process.argv.includes("--json");
  try {
    const result = await runMentorRiveAcceptanceCheck({
      evidencePath: argument || DEFAULT_EVIDENCE,
    });
    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.ok) {
      console.log(`Rive Mentor ${result.stage} gate: ACCEPTED`);
    } else {
      console.error(`Rive Mentor ${result.stage ?? "unknown"} gate: BLOCKED`);
      for (const error of result.errors) console.error(`- ${error}`);
    }
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    const message =
      error?.code === "ENOENT"
        ? `Acceptance evidence is missing: ${argument || DEFAULT_EVIDENCE}`
        : error instanceof Error
          ? error.message
          : String(error);
    if (asJson) {
      console.log(JSON.stringify({ ok: false, errors: [message] }, null, 2));
    } else {
      console.error(`Rive Mentor gate: BLOCKED\n- ${message}`);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await runCli();
