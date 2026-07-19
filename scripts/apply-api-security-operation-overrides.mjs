import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.resolve(
  root,
  process.argv.find((arg) => arg.startsWith("--manifest="))?.slice("--manifest=".length)
    ?? "api-security-manifest.generated.json",
);
const overridesPath = path.resolve(
  root,
  process.argv.find((arg) => arg.startsWith("--overrides="))?.slice("--overrides=".length)
    ?? "config/api-security-operation-overrides.json",
);

const [manifest, registry] = await Promise.all([
  readFile(manifestPath, "utf8").then(JSON.parse),
  readFile(overridesPath, "utf8").then(JSON.parse),
]);

const methods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const classifications = new Set(["public", "authenticated", "admin", "internal"]);
const controlKeys = new Set([
  "csrf",
  "strictRevocation",
  "rateLimit",
  "rateLimitNamespace",
  "expectsBody",
  "bodySizeLimit",
  "contentTypeCheck",
  "inputParser",
  "idempotency",
  "transaction",
  "verifiedPrincipal",
  "tenantFromVerifiedContext",
  "noStore",
  "audit",
  "redaction",
  "failClosed",
  "serviceIdentity",
  "setsCookie",
]);
const requirementKeys = new Set([
  "csrf",
  "strictRevocation",
  "rateLimit",
  "bodySizeLimit",
  "idempotency",
  "verifiedPrincipal",
  "noStore",
  "audit",
  "redaction",
  "serviceIdentity",
]);

function key(route, method) {
  return `${method} ${route}`;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function validateOverride(override, index) {
  const errors = [];
  const prefix = `operations[${index}]`;
  if (!object(override)) return [`${prefix} must be an object`];
  if (typeof override.route !== "string" || !override.route.startsWith("/api/") || override.route.includes("*")) {
    errors.push(`${prefix}.route must be an exact /api path without wildcards`);
  }
  if (!methods.has(override.method)) errors.push(`${prefix}.method is invalid`);
  if (override.classification !== undefined && !classifications.has(override.classification)) {
    errors.push(`${prefix}.classification is invalid`);
  }
  if (!(override.principalSource === undefined || override.principalSource === null || typeof override.principalSource === "string")) {
    errors.push(`${prefix}.principalSource must be a string or null`);
  }
  if (!(override.tenantSource === undefined || override.tenantSource === null || typeof override.tenantSource === "string")) {
    errors.push(`${prefix}.tenantSource must be a string or null`);
  }
  for (const [field, allowed] of [
    ["controlOverrides", controlKeys],
    ["requirementOverrides", requirementKeys],
  ]) {
    if (!object(override[field])) {
      errors.push(`${prefix}.${field} must be an object`);
      continue;
    }
    for (const [name, value] of Object.entries(override[field])) {
      if (!allowed.has(name)) errors.push(`${prefix}.${field}.${name} is not allowed`);
      if (field === "requirementOverrides" && typeof value !== "boolean") {
        errors.push(`${prefix}.${field}.${name} must be boolean`);
      }
    }
  }
  if (typeof override.reason !== "string" || override.reason.trim().length < 30) {
    errors.push(`${prefix}.reason must contain at least 30 characters`);
  }
  if (typeof override.issue !== "string" || !/^(?:#\d+|https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+)$/.test(override.issue)) {
    errors.push(`${prefix}.issue must be #number or a GitHub issue URL`);
  }
  return errors;
}

function findings(entry) {
  const output = [];
  const required = entry.requirements;
  if (required.csrf && !entry.controls.csrf) output.push("required_csrf_missing");
  if (required.strictRevocation && !entry.controls.strictRevocation) output.push("required_strict_revocation_missing");
  if (required.bodySizeLimit && !entry.controls.bodySizeLimit) output.push("parsed_body_without_size_limit");
  if (required.rateLimit && !entry.controls.rateLimit) output.push("public_mutation_without_rate_limit");
  if (required.idempotency && !entry.controls.idempotency) output.push("replayable_command_without_idempotency");
  if (required.verifiedPrincipal && !entry.controls.verifiedPrincipal) output.push("missing_verified_principal_source");
  if (required.noStore && !entry.controls.noStore) output.push("private_mutation_without_explicit_no_store");
  if (required.audit && !entry.controls.audit) output.push("missing_audit_or_observability_evidence");
  if (required.redaction && !entry.controls.redaction) output.push("missing_error_redaction_evidence");
  if (required.serviceIdentity && !entry.controls.serviceIdentity) output.push("internal_route_without_service_identity_evidence");
  return output;
}

function recomputeTotals(routes, routeFiles) {
  const findingCounts = {};
  for (const entry of routes) {
    for (const finding of entry.findings) findingCounts[finding] = (findingCounts[finding] ?? 0) + 1;
  }
  return {
    routeFiles,
    mutatingOperations: routes.length,
    activeOperations: routes.filter((entry) => entry.mutationMode === "active").length,
    denyOnlyOperations: routes.filter((entry) => entry.mutationMode === "deny-only").length,
    operationsWithFindings: routes.filter((entry) => entry.findings.length > 0).length,
    findings: routes.reduce((sum, entry) => sum + entry.findings.length, 0),
    findingCounts: Object.fromEntries(
      Object.entries(findingCounts).sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

const errors = [];
if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.routes)) {
  errors.push("manifest must have schemaVersion 1 and a routes array");
}
if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.operations)) {
  errors.push("override registry must have schemaVersion 1 and an operations array");
}

const routes = new Map();
for (const entry of manifest.routes ?? []) {
  const operationKey = key(entry.route, entry.method);
  if (routes.has(operationKey)) errors.push(`duplicate manifest operation: ${operationKey}`);
  routes.set(operationKey, entry);
}

const overrideKeys = new Set();
for (const [index, override] of (registry.operations ?? []).entries()) {
  errors.push(...validateOverride(override, index));
  if (!object(override)) continue;
  const operationKey = key(override.route, override.method);
  if (overrideKeys.has(operationKey)) errors.push(`duplicate operation override: ${operationKey}`);
  overrideKeys.add(operationKey);
  if (!routes.has(operationKey)) errors.push(`stale operation override: ${operationKey}`);
}

if (errors.length > 0) {
  console.error(`API operation override validation failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

for (const override of registry.operations) {
  const entry = routes.get(key(override.route, override.method));
  if (override.classification !== undefined) entry.classification = override.classification;
  if (override.principalSource !== undefined) entry.principalSource = override.principalSource;
  if (override.tenantSource !== undefined) entry.tenantSource = override.tenantSource;
  entry.controls = { ...entry.controls, ...override.controlOverrides };
  entry.requirements = { ...entry.requirements, ...override.requirementOverrides };
  entry.operationOverride = {
    reason: override.reason.trim(),
    issue: override.issue,
  };
  entry.findings = findings(entry);
}

manifest.totals = recomputeTotals(manifest.routes, manifest.totals.routeFiles);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(
  `API operation contracts applied: ${registry.operations.length} exact overrides; `
  + `${manifest.totals.findings} findings remain.`,
);
