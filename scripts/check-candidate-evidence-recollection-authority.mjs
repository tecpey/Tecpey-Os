import { readFile } from "node:fs/promises";
import { candidateEvidenceRecollectionFindings } from "./candidate-evidence-recollection-policy.mjs";

const paths = {
  request: "docs/launch/generated/candidate-evidence-recollection-request-20260821.json",
  promotionState: "docs/launch/generated/candidate-promotion-state-20260821.json",
};

const [request, promotionState] = await Promise.all(
  Object.values(paths).map(async (path) => JSON.parse(await readFile(path, "utf8"))),
);

const findings = candidateEvidenceRecollectionFindings({ request, promotionState });
if (findings.length) {
  console.error("Candidate evidence recollection authority failed:\n- " + findings.join("\n- "));
  process.exit(1);
}

console.log(`Candidate evidence recollection authority passed for ${request.selectedSha}; promotion remains fail-closed.`);
