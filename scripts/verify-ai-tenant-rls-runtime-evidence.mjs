import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateAiTenantRlsRuntimeEvidence } from "./ai-tenant-rls-runtime-evidence-policy.mjs";

const evidencePath =
  process.argv[2] ??
  process.env.TECPEY_AI_RLS_EVIDENCE_FILE ??
  "artifacts/ai-tenant-rls-runtime-evidence/ai-tenant-rls-runtime-evidence.json";
const digestPath =
  process.argv[3] ??
  process.env.TECPEY_AI_RLS_EVIDENCE_DIGEST_FILE ??
  `${evidencePath}.sha256`;
const expectedSha =
  process.argv[4] ?? process.env.TECPEY_AI_RLS_EVIDENCE_EXPECTED_SHA ?? null;
const expectedTreeSha =
  process.argv[5] ??
  process.env.TECPEY_AI_RLS_EVIDENCE_EXPECTED_TREE_SHA ??
  null;

async function boundedRead(filePath, maximumBytes) {
  const bytes = await readFile(filePath);
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) {
    throw new Error(`${path.basename(filePath)}_size_invalid`);
  }
  return bytes;
}

async function main() {
  const evidenceBytes = await boundedRead(evidencePath, 512 * 1024);
  const digestBytes = await boundedRead(digestPath, 512);
  const digest = createHash("sha256").update(evidenceBytes).digest("hex");
  const expectedDigestLine = `${digest}  ${path.basename(evidencePath)}\n`;
  if (digestBytes.toString("utf8") !== expectedDigestLine) {
    throw new Error("ai_tenant_rls_evidence_detached_digest_invalid");
  }

  let evidence;
  try {
    evidence = JSON.parse(evidenceBytes.toString("utf8"));
  } catch {
    throw new Error("ai_tenant_rls_evidence_json_invalid");
  }
  const findings = validateAiTenantRlsRuntimeEvidence(evidence, {
    expectedSha,
    expectedTreeSha,
  });
  if (findings.length > 0) {
    throw new Error(
      `ai_tenant_rls_evidence_invalid:${findings.join("|")}`,
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      status: "verified",
      authority: evidence.authority,
      sourceSha: evidence.source.commitSha,
      sourceTree: evidence.source.treeSha,
      runUrl: evidence.execution.runUrl,
      postgresVersion: evidence.postgres.serverVersion,
      rlsTables: evidence.postgres.rlsTables.length,
      tests: evidence.tests.tests,
      skipped: evidence.tests.skipped,
      sha256: digest,
    })}\n`,
  );
}

void main().catch((error) => {
  console.error(
    `[verify-ai-tenant-rls-runtime-evidence] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
