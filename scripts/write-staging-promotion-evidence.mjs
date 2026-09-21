import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildPromotionEvidence } from "./staging-promotion-policy.mjs";

const {
  TECPEY_PROMOTION_SMOKE_FILE: smokeFile,
  TECPEY_PROMOTION_RESULT_FILE: resultFile,
  TECPEY_PROMOTION_EVIDENCE_FILE: evidenceFile,
} = process.env;

for (const [name, value] of [
  ["smoke_file", smokeFile],
  ["result_file", resultFile],
  ["evidence_file", evidenceFile],
]) {
  if (!value || !path.isAbsolute(value)) {
    throw new Error(`staging_promotion_${name}_must_be_absolute`);
  }
}

const smoke = JSON.parse(await readFile(smokeFile, "utf8"));
const result = JSON.parse(await readFile(resultFile, "utf8"));
if (!["promoted", "verified_already_active"].includes(result.finalDisposition)) {
  throw new Error("staging_promotion_result_not_accepted");
}

const evidence = buildPromotionEvidence({
  previousSha: result.previousSha,
  targetSha: result.targetSha,
  imageDigest: result.imageDigest,
  publicBaseUrl: result.publicBaseUrl,
  smokeResults: smoke.results,
  startedAt: result.startedAt,
  completedAt: result.completedAt,
  rollback: { disposition: result.rollbackDisposition },
  operation: result.finalDisposition,
});

const content = `${JSON.stringify(evidence, null, 2)}\n`;
await writeFile(evidenceFile, content, { mode: 0o600 });
await writeFile(
  `${evidenceFile}.sha256`,
  `${createHash("sha256").update(content).digest("hex")}  ${path.basename(evidenceFile)}\n`,
  { mode: 0o600 },
);

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    evidenceClass: evidence.evidenceClass,
    targetSha: evidence.targetSha,
    rollbackDisposition: evidence.rollback.disposition,
  })}\n`,
);
