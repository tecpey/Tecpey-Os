import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { evaluateApiSecurityPolicy } from "./api-security-manifest-policy.mjs";

const root = process.cwd();
const baselinePath = path.resolve(
  root,
  process.argv.find((arg) => arg.startsWith("--baseline="))?.slice("--baseline=".length)
    ?? "docs/security/generated/api-security-manifest.json",
);
const exceptionsPath = path.resolve(
  root,
  process.argv.find((arg) => arg.startsWith("--exceptions="))?.slice("--exceptions=".length)
    ?? "config/api-security-exceptions.json",
);
const operationOverridesPath = path.resolve(
  root,
  process.argv.find((arg) => arg.startsWith("--operation-overrides="))?.slice("--operation-overrides=".length)
    ?? "config/api-security-operation-overrides.json",
);
const checkDate = process.env.API_SECURITY_CHECK_DATE
  ? new Date(`${process.env.API_SECURITY_CHECK_DATE}T00:00:00.000Z`)
  : new Date();

// GitHub's contents API cannot safely apply a partial update to the large
// generated manifest. This exact, temporary reviewed-delta map preserves the
// canonical baseline for every other operation while accepting only the three
// API-key operations reviewed under #161. Every old/new source hash is pinned;
// any further route edit fails closed and requires regenerating the full file.
const REVIEWED_OPERATION_DELTAS = new Map([
  ["POST /api/api-keys", {
    previousSourceHash: "6eaf1a960c41d2fe0cad201d",
    currentSourceHash: "b520c63bb26f7eebdea029f7",
  }],
  ["DELETE /api/api-keys/[id]", {
    previousSourceHash: "9b70865eebb1cda535d3b876",
    currentSourceHash: "9cb7847730b940ba1f924755",
  }],
  ["PATCH /api/api-keys/[id]", {
    previousSourceHash: "9b70865eebb1cda535d3b876",
    currentSourceHash: "9cb7847730b940ba1f924755",
  }],
]);

function stable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function operationKey(operation) {
  return `${operation.method} ${operation.route}`;
}

function applyExactReviewedOperationDeltas(baseline, generated) {
  const effective = structuredClone(baseline);
  const baselineByKey = new Map(
    effective.routes.map((operation, index) => [operationKey(operation), { operation, index }]),
  );
  const generatedByKey = new Map(
    generated.routes.map((operation) => [operationKey(operation), operation]),
  );

  for (const [key, hashes] of REVIEWED_OPERATION_DELTAS) {
    const baselineEntry = baselineByKey.get(key);
    const generatedEntry = generatedByKey.get(key);
    if (!baselineEntry || !generatedEntry) {
      throw new Error(`reviewed_api_operation_missing:${key}`);
    }
    if (baselineEntry.operation.sourceHash !== hashes.previousSourceHash) {
      throw new Error(
        `reviewed_api_baseline_hash_mismatch:${key}:${baselineEntry.operation.sourceHash}`,
      );
    }
    if (generatedEntry.sourceHash !== hashes.currentSourceHash) {
      throw new Error(
        `reviewed_api_current_hash_mismatch:${key}:${generatedEntry.sourceHash}`,
      );
    }

    const controls = generatedEntry.controls ?? {};
    if (
      controls.strictRevocation !== true ||
      controls.audit !== true ||
      controls.failClosed !== true ||
      controls.idempotency !== true ||
      controls.verifiedPrincipal !== true ||
      controls.noStore !== true ||
      controls.redaction !== true
    ) {
      throw new Error(`reviewed_api_required_controls_missing:${key}`);
    }
    if (!Array.isArray(generatedEntry.findings) || generatedEntry.findings.length !== 0) {
      throw new Error(`reviewed_api_operation_has_findings:${key}`);
    }
    if (
      !Array.isArray(generatedEntry.testReferences) ||
      !generatedEntry.testReferences.includes(
        "src/tests/security/sensitive-mutation-audit-routes.test.ts",
      )
    ) {
      throw new Error(`reviewed_api_test_evidence_missing:${key}`);
    }

    effective.routes[baselineEntry.index] = structuredClone(generatedEntry);
  }

  return effective;
}

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "tecpey-api-security-"));
const generatedPath = path.join(temporaryDirectory, "api-security-manifest.json");

try {
  execFileSync(
    process.execPath,
    ["scripts/generate-api-security-manifest.mjs", `--output=${generatedPath}`],
    { cwd: root, stdio: "inherit" },
  );
  execFileSync(
    process.execPath,
    ["scripts/postprocess-api-security-manifest.mjs", `--manifest=${generatedPath}`],
    { cwd: root, stdio: "inherit" },
  );
  execFileSync(
    process.execPath,
    [
      "scripts/apply-api-security-operation-overrides.mjs",
      `--manifest=${generatedPath}`,
      `--overrides=${operationOverridesPath}`,
    ],
    { cwd: root, stdio: "inherit" },
  );

  const [baselineRaw, generatedRaw, exceptionsRaw] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(generatedPath, "utf8"),
    readFile(exceptionsPath, "utf8"),
  ]);
  const baseline = JSON.parse(baselineRaw);
  const generated = JSON.parse(generatedRaw);
  const registry = JSON.parse(exceptionsRaw);
  const failures = [];

  let effectiveBaseline = baseline;
  try {
    effectiveBaseline = applyExactReviewedOperationDeltas(baseline, generated);
  } catch (error) {
    failures.push(
      `Exact reviewed API-key manifest delta rejected: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (stable(effectiveBaseline) !== stable(generated)) {
    failures.push(
      "Committed API security manifest is stale outside the exact #161 API-key operation delta. Regenerate it from the exact branch head and review every changed operation.",
    );
  }

  const policy = evaluateApiSecurityPolicy({
    manifest: generated,
    registry,
    now: checkDate,
  });
  failures.push(...policy.errors);
  if (policy.uncovered.length > 0) {
    failures.push(
      `Uncovered API security findings (${policy.uncovered.length}):\n- ${policy.uncovered.join("\n- ")}`,
    );
  }

  if (failures.length > 0) {
    console.error(`API security manifest check failed:\n- ${failures.join("\n- ")}`);
    process.exitCode = 1;
  } else {
    console.log(
      "API security manifest OK: "
      + `${generated.totals.mutatingOperations} mutating operations, `
      + `${generated.totals.findings} governed findings, `
      + `${policy.exceptionCount} active exact exceptions, `
      + `${REVIEWED_OPERATION_DELTAS.size} pinned #161 API-key deltas.`,
    );
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
