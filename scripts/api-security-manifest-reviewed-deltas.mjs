import { createHash } from "node:crypto";

const METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ENTRY_FIELDS = new Set([
  "route",
  "method",
  "previousSourceHash",
  "issue",
  "owner",
  "reason",
  "replacement",
]);
const READ_ONLY_ROUTE_FIELDS = new Set([
  "route",
  "sourcePath",
  "sourceHash",
  "issue",
  "owner",
  "reason",
  "controls",
]);
const READ_ONLY_CONTROL_FIELDS = new Set([
  "classification",
  "strictRevocation",
  "rateLimit",
  "verifiedPrincipal",
  "tenantFromVerifiedContext",
  "noStore",
  "queryParameters",
]);

function assertExactFields(value, allowed, label) {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw new Error(`${label}_unknown_field:${field}`);
  }
  for (const field of allowed) {
    if (!(field in value)) throw new Error(`${label}_missing_field:${field}`);
  }
}

function assertRegistryShape(registry, label) {
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    throw new Error(`${label}_invalid`);
  }
  if (registry.schemaVersion !== 1) {
    throw new Error(`${label}_schema_invalid`);
  }
  if (!/^[0-9a-f]{40}$/.test(registry.baselineBlobSha ?? "")) {
    throw new Error(`${label}_baseline_sha_invalid`);
  }
  if (!Array.isArray(registry.entries)) {
    throw new Error(`${label}_entries_invalid`);
  }
  if (registry.readOnlyRoutes !== undefined && !Array.isArray(registry.readOnlyRoutes)) {
    throw new Error(`${label}_read_only_routes_invalid`);
  }
}

function readOnlyRoutes(registry) {
  return registry.readOnlyRoutes ?? [];
}

export function mergeReviewedManifestDeltaRegistries({ primary, shards = [] }) {
  assertRegistryShape(primary, "api_security_manifest_delta_registry");
  if (!Array.isArray(shards)) {
    throw new Error("api_security_manifest_delta_shards_invalid");
  }

  const entries = [...primary.entries];
  const reviewedReadOnlyRoutes = [...readOnlyRoutes(primary)];
  for (const [index, shardRecord] of shards.entries()) {
    const name = shardRecord?.name ?? `index-${index}`;
    const shard = shardRecord?.registry;
    assertRegistryShape(shard, `api_security_manifest_delta_shard:${name}`);
    if (shard.schemaVersion !== primary.schemaVersion) {
      throw new Error(`api_security_manifest_delta_shard_schema_mismatch:${name}`);
    }
    if (shard.baselineBlobSha !== primary.baselineBlobSha) {
      throw new Error(`api_security_manifest_delta_shard_baseline_mismatch:${name}`);
    }
    entries.push(...shard.entries);
    reviewedReadOnlyRoutes.push(...readOnlyRoutes(shard));
  }

  return {
    schemaVersion: primary.schemaVersion,
    baselineBlobSha: primary.baselineBlobSha,
    entries,
    readOnlyRoutes: reviewedReadOnlyRoutes,
  };
}

export function gitBlobSha(raw) {
  const bytes = Buffer.from(raw, "utf8");
  return createHash("sha1")
    .update(`blob ${bytes.byteLength}\0`)
    .update(bytes)
    .digest("hex");
}

function operationKey(route, method) {
  return `${method} ${route}`;
}

function sameOperation(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateReadOnlyRouteEntry(entry, index, seenRoutes, seenPaths) {
  const label = `api_security_read_only_route_${index}`;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`${label}_invalid`);
  }
  assertExactFields(entry, READ_ONLY_ROUTE_FIELDS, label);
  if (typeof entry.route !== "string" || !entry.route.startsWith("/api/")) {
    throw new Error(`${label}_route_invalid`);
  }
  if (
    typeof entry.sourcePath !== "string"
    || !/^src\/app\/api\/(?:[A-Za-z0-9._\-\[\]]+\/)*route\.ts$/.test(entry.sourcePath)
    || entry.sourcePath.includes("..")
  ) {
    throw new Error(`${label}_source_path_invalid`);
  }
  if (!/^[0-9a-f]{24}$/.test(entry.sourceHash)) {
    throw new Error(`${label}_source_hash_invalid`);
  }
  if (!/^#[1-9][0-9]*$/.test(entry.issue)) {
    throw new Error(`${label}_issue_invalid`);
  }
  if (typeof entry.owner !== "string" || entry.owner.trim().length < 3) {
    throw new Error(`${label}_owner_invalid`);
  }
  if (typeof entry.reason !== "string" || entry.reason.trim().length < 20) {
    throw new Error(`${label}_reason_invalid`);
  }
  if (!entry.controls || typeof entry.controls !== "object" || Array.isArray(entry.controls)) {
    throw new Error(`${label}_controls_invalid`);
  }
  assertExactFields(entry.controls, READ_ONLY_CONTROL_FIELDS, `${label}_controls`);
  if (
    entry.controls.classification !== "authenticated"
    || entry.controls.strictRevocation !== true
    || entry.controls.rateLimit !== true
    || entry.controls.verifiedPrincipal !== true
    || entry.controls.tenantFromVerifiedContext !== true
    || entry.controls.noStore !== true
    || entry.controls.queryParameters !== "none"
  ) {
    throw new Error(`${label}_controls_invalid`);
  }
  if (seenRoutes.has(entry.route)) {
    throw new Error(`${label}_duplicate_route:${entry.route}`);
  }
  if (seenPaths.has(entry.sourcePath)) {
    throw new Error(`${label}_duplicate_source:${entry.sourcePath}`);
  }
  seenRoutes.add(entry.route);
  seenPaths.add(entry.sourcePath);
}

export function applyReviewedManifestDeltas({ baselineRaw, baseline, registry }) {
  assertRegistryShape(registry, "api_security_manifest_delta_registry");

  const actualBaselineSha = gitBlobSha(baselineRaw);
  if (actualBaselineSha !== registry.baselineBlobSha) {
    throw new Error(
      `api_security_manifest_delta_baseline_mismatch:${registry.baselineBlobSha}:${actualBaselineSha}`,
    );
  }
  if (!baseline || !Array.isArray(baseline.routes)) {
    throw new Error("api_security_manifest_delta_baseline_invalid");
  }

  const effective = structuredClone(baseline);

  for (const [index, entry] of registry.entries.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`api_security_manifest_delta_entry_invalid:${index}`);
    }
    assertExactFields(entry, ENTRY_FIELDS, `api_security_manifest_delta_entry_${index}`);

    if (typeof entry.route !== "string" || !entry.route.startsWith("/api/")) {
      throw new Error(`api_security_manifest_delta_route_invalid:${index}`);
    }
    if (!METHODS.has(entry.method)) {
      throw new Error(`api_security_manifest_delta_method_invalid:${index}`);
    }
    if (!/^[0-9a-f]{24}$/.test(entry.previousSourceHash)) {
      throw new Error(`api_security_manifest_delta_previous_hash_invalid:${index}`);
    }
    if (!/^#[1-9][0-9]*$/.test(entry.issue)) {
      throw new Error(`api_security_manifest_delta_issue_invalid:${index}`);
    }
    if (typeof entry.owner !== "string" || entry.owner.trim().length < 3) {
      throw new Error(`api_security_manifest_delta_owner_invalid:${index}`);
    }
    if (typeof entry.reason !== "string" || entry.reason.trim().length < 20) {
      throw new Error(`api_security_manifest_delta_reason_invalid:${index}`);
    }

    const key = operationKey(entry.route, entry.method);
    const matchingIndexes = effective.routes
      .map((route, routeIndex) => ({ route, routeIndex }))
      .filter(({ route }) => route.route === entry.route && route.method === entry.method)
      .map(({ routeIndex }) => routeIndex);
    if (matchingIndexes.length !== 1) {
      throw new Error(`api_security_manifest_delta_target_count:${key}:${matchingIndexes.length}`);
    }

    const routeIndex = matchingIndexes[0];
    const current = effective.routes[routeIndex];
    if (current.sourceHash !== entry.previousSourceHash) {
      throw new Error(
        `api_security_manifest_delta_previous_hash_mismatch:${key}:${entry.previousSourceHash}:${current.sourceHash}`,
      );
    }

    const replacement = entry.replacement;
    if (!replacement || typeof replacement !== "object" || Array.isArray(replacement)) {
      throw new Error(`api_security_manifest_delta_replacement_invalid:${key}`);
    }
    if (replacement.route !== entry.route || replacement.method !== entry.method) {
      throw new Error(`api_security_manifest_delta_replacement_target_mismatch:${key}`);
    }
    if (!/^[0-9a-f]{24}$/.test(replacement.sourceHash ?? "")) {
      throw new Error(`api_security_manifest_delta_replacement_hash_invalid:${key}`);
    }
    if (sameOperation(current, replacement)) {
      throw new Error(`api_security_manifest_delta_noop:${key}:${replacement.sourceHash}`);
    }

    effective.routes[routeIndex] = structuredClone(replacement);
  }

  const reviewedReadOnlyRoutes = readOnlyRoutes(registry);
  const seenRoutes = new Set();
  const seenPaths = new Set();
  for (const [index, entry] of reviewedReadOnlyRoutes.entries()) {
    validateReadOnlyRouteEntry(entry, index, seenRoutes, seenPaths);
  }
  if (reviewedReadOnlyRoutes.length > 0) {
    if (!effective.totals || !Number.isSafeInteger(effective.totals.routeFiles)) {
      throw new Error("api_security_manifest_route_file_total_invalid");
    }
    effective.totals.routeFiles += reviewedReadOnlyRoutes.length;
  }

  return {
    manifest: effective,
    appliedCount: registry.entries.length + reviewedReadOnlyRoutes.length,
    operationDeltaCount: registry.entries.length,
    readOnlyRouteCount: reviewedReadOnlyRoutes.length,
    readOnlyRoutes: structuredClone(reviewedReadOnlyRoutes),
  };
}
