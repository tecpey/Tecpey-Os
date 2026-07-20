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
}

export function mergeReviewedManifestDeltaRegistries({ primary, shards = [] }) {
  assertRegistryShape(primary, "api_security_manifest_delta_registry");
  if (!Array.isArray(shards)) {
    throw new Error("api_security_manifest_delta_shards_invalid");
  }

  const entries = [...primary.entries];
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
  }

  return {
    schemaVersion: primary.schemaVersion,
    baselineBlobSha: primary.baselineBlobSha,
    entries,
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
    if (replacement.sourceHash === entry.previousSourceHash) {
      throw new Error(`api_security_manifest_delta_noop:${key}:${replacement.sourceHash}`);
    }

    effective.routes[routeIndex] = structuredClone(replacement);
  }

  return { manifest: effective, appliedCount: registry.entries.length };
}
