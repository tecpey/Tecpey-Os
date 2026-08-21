import { readdir, readFile } from "node:fs/promises";
import {
  ACTIVE_RECOLLECTION_FILES,
  candidateEvidenceRecollectionFileSelectionFindings,
  candidateEvidenceRecollectionFindings,
} from "./candidate-evidence-recollection-policy.mjs";

const generatedDir = "docs/launch/generated";
const paths = {
  request: `${generatedDir}/${ACTIVE_RECOLLECTION_FILES.request}`,
  promotionState: `${generatedDir}/${ACTIVE_RECOLLECTION_FILES.promotionState}`,
};

const findings = [];

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    findings.push(`${path}: JSON read/parse failed: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

const [generatedFilenames, request, promotionState] = await Promise.all([
  readdir(generatedDir),
  readJson(paths.request),
  readJson(paths.promotionState),
]);

findings.push(...candidateEvidenceRecollectionFileSelectionFindings(generatedFilenames));
findings.push(...candidateEvidenceRecollectionFindings({ request, promotionState }));

if (findings.length) {
  console.error("Candidate evidence recollection authority failed:\n- " + findings.join("\n- "));
  process.exit(1);
}

console.log(
  `Candidate evidence recollection authority passed for ${request.selectedSha}; promotion remains fail-closed.`,
);
