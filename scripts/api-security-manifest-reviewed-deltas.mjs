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
  if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.entries)) {
    throw new Error("api_security_manifest_delta_registry_invalid");
  }
  if (!/^[0-9a-f]{40}$/.test(registry.baselineBlobSha ?? "")) {
    throw new Error("api_security_manifest_delta_baseline_sha_invalid");
  }

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
  const seen = new Set();

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
    if (seen.has(key)) throw new Error(`api_security_manifest_delta_duplicate:${key}`);
    seen.add(key);

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

    effective.routes[routeIndex] = structuredClone(replacement);
  }

  return { manifest: effective, appliedCount: registry.entries.length };
}
