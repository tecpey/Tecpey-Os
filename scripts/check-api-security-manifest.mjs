import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { evaluateApiSecurityPolicy } from "./api-security-manifest-policy.mjs";
import { applyReviewedManifestDeltas } from "./api-security-manifest-reviewed-deltas.mjs";

const root = process.cwd();
const baselinePath = path.resolve(
  root,
  process.argv.find((arg) => arg.startsWith("--baseline="))?.slice("--baseline=".length)
    ?? "docs/security/generated/api-security-manifest.json",
);
const reviewedDeltasPath = path.resolve(
  root,
  process.argv.find((arg) => arg.startsWith("--reviewed-deltas="))
    ?.slice("--reviewed-deltas=".length)
    ?? "docs/security/generated/api-security-manifest-reviewed-deltas.json",
);
const exceptionsPath = path.resolve(
  root,
  process.argv.find((arg) => arg.startsWith("--exceptions="))?.slice("--exceptions=".length)
    ?? "config/api-security-exceptions.json",
);
const operationOverridesPath = path.resolve(
  root,
  process.argv.find((arg) => arg.startsWith("--operation-overrides="))
    ?.slice("--operation-overrides=".length)
    ?? "config/api-security-operation-overrides.json",
);
const checkDate = process.env.API_SECURITY_CHECK_DATE
  ? new Date(`${process.env.API_SECURITY_CHECK_DATE}T00:00:00.000Z`)
  : new Date();

function stable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
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

  const [baselineRaw, reviewedDeltasRaw, generatedRaw, exceptionsRaw] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(reviewedDeltasPath, "utf8"),
    readFile(generatedPath, "utf8"),
    readFile(exceptionsPath, "utf8"),
  ]);
  const baseline = JSON.parse(baselineRaw);
  const reviewedDeltas = JSON.parse(reviewedDeltasRaw);
  const generated = JSON.parse(generatedRaw);
  const registry = JSON.parse(exceptionsRaw);
  const failures = [];

  let effectiveBaseline;
  let appliedDeltaCount = 0;
  try {
    const applied = applyReviewedManifestDeltas({
      baselineRaw,
      baseline,
      registry: reviewedDeltas,
    });
    effectiveBaseline = applied.manifest;
    appliedDeltaCount = applied.appliedCount;
  } catch (error) {
    failures.push(
      `Reviewed API security manifest delta validation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    effectiveBaseline = baseline;
  }

  if (stable(effectiveBaseline) !== stable(generated)) {
    failures.push(
      "Committed API security manifest plus its exact reviewed delta ledger is stale. Regenerate from the exact branch head and review every changed operation.",
    );
  }

  const policy = evaluateApiSecurityPolicy({ manifest: generated, registry, now: checkDate });
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
      + `${appliedDeltaCount} exact reviewed baseline deltas.`,
    );
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
