import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { evaluateApiSecurityPolicy } from "./api-security-manifest-policy.mjs";
import {
  applyReviewedManifestDeltas,
  mergeReviewedManifestDeltaRegistries,
} from "./api-security-manifest-reviewed-deltas.mjs";

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
const reviewedDeltasDirectory = path.resolve(
  root,
  process.argv.find((arg) => arg.startsWith("--reviewed-deltas-dir="))
    ?.slice("--reviewed-deltas-dir=".length)
    ?? "docs/security/generated/api-security-manifest-reviewed-deltas.d",
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

function firstDifference(expected, actual, pathLabel = "manifest") {
  if (Object.is(expected, actual)) return null;
  if (typeof expected !== typeof actual) {
    return { path: pathLabel, expected, actual };
  }
  if (expected === null || actual === null || typeof expected !== "object") {
    return { path: pathLabel, expected, actual };
  }
  if (Array.isArray(expected) !== Array.isArray(actual)) {
    return { path: pathLabel, expected, actual };
  }
  if (Array.isArray(expected)) {
    if (expected.length !== actual.length) {
      return {
        path: `${pathLabel}.length`,
        expected: expected.length,
        actual: actual.length,
      };
    }
    for (let index = 0; index < expected.length; index += 1) {
      const difference = firstDifference(
        expected[index],
        actual[index],
        `${pathLabel}[${index}]`,
      );
      if (difference) return difference;
    }
    return null;
  }

  const expectedKeys = Object.keys(expected);
  const actualKeys = Object.keys(actual);
  if (expectedKeys.length !== actualKeys.length) {
    return { path: `${pathLabel}.keys`, expected: expectedKeys, actual: actualKeys };
  }
  for (const key of expectedKeys) {
    if (!(key in actual)) {
      return { path: `${pathLabel}.${key}`, expected: expected[key], actual: "<missing>" };
    }
    const difference = firstDifference(
      expected[key],
      actual[key],
      `${pathLabel}.${key}`,
    );
    if (difference) return difference;
  }
  return null;
}

function boundedDiagnosticValue(value) {
  const encoded = JSON.stringify(value);
  return encoded.length <= 500 ? encoded : `${encoded.slice(0, 500)}…`;
}

async function readReviewedDeltaRegistry(primaryPath, directoryPath) {
  const primaryRaw = await readFile(primaryPath, "utf8");
  const primary = JSON.parse(primaryRaw);
  let names = [];

  try {
    names = (await readdir(directoryPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("ENOENT")) throw error;
  }

  const shards = [];
  let shardEntryCount = 0;
  let shardReadOnlyRouteCount = 0;
  for (const name of names) {
    const shardPath = path.join(directoryPath, name);
    const raw = await readFile(shardPath, "utf8");
    const registry = JSON.parse(raw);
    shards.push({ name, registry });
    shardEntryCount += Array.isArray(registry.entries) ? registry.entries.length : 0;
    shardReadOnlyRouteCount += Array.isArray(registry.readOnlyRoutes)
      ? registry.readOnlyRoutes.length
      : 0;
  }

  return {
    primaryRaw,
    registry: mergeReviewedManifestDeltaRegistries({ primary, shards }),
    shardCount: shards.length,
    shardEntryCount,
    shardReadOnlyRouteCount,
  };
}

function hasMethodExport(source, method) {
  return [
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`),
    new RegExp(`export\\s+const\\s+${method}\\b`),
    new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`),
  ].some((pattern) => pattern.test(source));
}

async function verifyReviewedReadOnlyRoutes(entries) {
  const failures = [];
  for (const entry of entries) {
    const expectedSourcePath = `src/app${entry.route}/route.ts`;
    if (entry.sourcePath !== expectedSourcePath) {
      failures.push(
        `Reviewed read-only route path mismatch for ${entry.route}: expected ${expectedSourcePath}, got ${entry.sourcePath}.`,
      );
      continue;
    }
    const absolute = path.resolve(root, entry.sourcePath);
    const sourceRoot = path.resolve(root, "src", "app", "api") + path.sep;
    if (!absolute.startsWith(sourceRoot)) {
      failures.push(`Reviewed read-only route escapes API root: ${entry.sourcePath}.`);
      continue;
    }
    let source;
    try {
      source = await readFile(absolute, "utf8");
    } catch {
      failures.push(`Reviewed read-only route source is missing: ${entry.sourcePath}.`);
      continue;
    }
    const sourceHash = createHash("sha256").update(source).digest("hex").slice(0, 24);
    if (sourceHash !== entry.sourceHash) {
      failures.push(
        `Reviewed read-only route hash mismatch for ${entry.route}: expected ${entry.sourceHash}, got ${sourceHash}.`,
      );
    }
    if (!hasMethodExport(source, "GET")) {
      failures.push(`Reviewed read-only route does not export GET: ${entry.sourcePath}.`);
    }
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      if (hasMethodExport(source, method)) {
        failures.push(
          `Reviewed read-only route unexpectedly exports ${method}: ${entry.sourcePath}.`,
        );
      }
    }
    if (!/getCanonicalSession\s*\(/.test(source) || !/strictRevocation\s*:\s*true/.test(source)) {
      failures.push(`Reviewed read-only route lacks strict canonical session evidence: ${entry.sourcePath}.`);
    }
    if (!/\brateLimit\s*\(/.test(source)) {
      failures.push(`Reviewed read-only route lacks rate limiting: ${entry.sourcePath}.`);
    }
    if (!/resolveTenantPrincipalContext\s*\(/.test(source)) {
      failures.push(`Reviewed read-only route lacks verified tenant/principal context: ${entry.sourcePath}.`);
    }
    if (!/Cache-Control["']\s*,\s*["']private, no-store/.test(source) || !/Vary["']\s*,\s*["']Cookie/.test(source)) {
      failures.push(`Reviewed read-only route lacks private no-store cookie variance: ${entry.sourcePath}.`);
    }
    if (!/searchParams\.keys\s*\(\)/.test(source) || !/\b400\b/.test(source)) {
      failures.push(`Reviewed read-only route does not reject all query parameters: ${entry.sourcePath}.`);
    }
  }
  return failures;
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

  const [baselineRaw, reviewed, generatedRaw, exceptionsRaw] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readReviewedDeltaRegistry(reviewedDeltasPath, reviewedDeltasDirectory),
    readFile(generatedPath, "utf8"),
    readFile(exceptionsPath, "utf8"),
  ]);
  const baseline = JSON.parse(baselineRaw);
  const generated = JSON.parse(generatedRaw);
  const registry = JSON.parse(exceptionsRaw);
  const failures = [];

  let effectiveBaseline;
  let appliedDeltaCount = 0;
  let appliedOperationDeltaCount = 0;
  let appliedReadOnlyRouteCount = 0;
  try {
    const applied = applyReviewedManifestDeltas({
      baselineRaw,
      baseline,
      registry: reviewed.registry,
    });
    effectiveBaseline = applied.manifest;
    appliedDeltaCount = applied.appliedCount;
    appliedOperationDeltaCount = applied.operationDeltaCount;
    appliedReadOnlyRouteCount = applied.readOnlyRouteCount;
    failures.push(...await verifyReviewedReadOnlyRoutes(applied.readOnlyRoutes));
  } catch (error) {
    failures.push(
      `Reviewed API security manifest delta validation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    effectiveBaseline = baseline;
  }

  if (stable(effectiveBaseline) !== stable(generated)) {
    const difference = firstDifference(effectiveBaseline, generated);
    const diagnostic = difference
      ? ` First difference at ${difference.path}: expected=${boundedDiagnosticValue(difference.expected)} actual=${boundedDiagnosticValue(difference.actual)}.`
      : "";
    failures.push(
      "Committed API security manifest plus its exact reviewed delta ledger is stale. Regenerate from the exact branch head and review every changed operation."
      + diagnostic,
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
      + `${appliedDeltaCount} exact reviewed baseline deltas `
      + `(${appliedOperationDeltaCount} operation replacements and ${appliedReadOnlyRouteCount} read-only route files; `
      + `${reviewed.shardEntryCount} operation entries and ${reviewed.shardReadOnlyRouteCount} read-only entries across ${reviewed.shardCount} additive shard files).`,
    );
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
