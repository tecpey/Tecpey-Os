import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyReviewedManifestDeltas,
  gitBlobSha,
  mergeReviewedManifestDeltaRegistries,
} from "./api-security-manifest-reviewed-deltas.mjs";

function readOnlyRoute(overrides = {}) {
  return {
    route: "/api/community/reputation-evidence",
    sourcePath: "src/app/api/community/reputation-evidence/route.ts",
    sourceHash: "d".repeat(24),
    issue: "#230",
    owner: "community-platform",
    reason: "Reviewed authenticated evidence-only GET route with no mutation methods or client-selected identity.",
    controls: {
      classification: "authenticated",
      strictRevocation: true,
      rateLimit: true,
      verifiedPrincipal: true,
      tenantFromVerifiedContext: true,
      noStore: true,
      queryParameters: "none",
    },
    ...overrides,
  };
}

function fixture() {
  const baseline = {
    schemaVersion: 1,
    totals: { routeFiles: 1 },
    routes: [{
      route: "/api/example",
      method: "POST",
      sourceHash: "a".repeat(24),
      controls: { failClosed: false },
    }],
  };
  const baselineRaw = `${JSON.stringify(baseline, null, 2)}\n`;
  const replacement = {
    route: "/api/example",
    method: "POST",
    sourceHash: "b".repeat(24),
    controls: { failClosed: true },
  };
  const registry = {
    schemaVersion: 1,
    baselineBlobSha: gitBlobSha(baselineRaw),
    entries: [{
      route: "/api/example",
      method: "POST",
      previousSourceHash: "a".repeat(24),
      issue: "#161",
      owner: "security-platform",
      reason: "Reviewed exact operation evidence was updated transactionally.",
      replacement,
    }],
  };
  return { baseline, baselineRaw, registry, replacement };
}

describe("reviewed API security manifest delta registries", () => {
  it("merges additive operation and read-only route shards without mutation", () => {
    const value = fixture();
    const primary = { ...value.registry, entries: [], readOnlyRoutes: [] };
    const operationShard = structuredClone(value.registry);
    const routeShard = {
      schemaVersion: 1,
      baselineBlobSha: value.registry.baselineBlobSha,
      entries: [],
      readOnlyRoutes: [readOnlyRoute()],
    };
    const result = mergeReviewedManifestDeltaRegistries({
      primary,
      shards: [
        { name: "0161-example.json", registry: operationShard },
        { name: "0230-read-route.json", registry: routeShard },
      ],
    });

    assert.equal(result.entries.length, 1);
    assert.deepEqual(result.entries[0], value.registry.entries[0]);
    assert.deepEqual(result.readOnlyRoutes, routeShard.readOnlyRoutes);
    assert.equal(primary.entries.length, 0);
    assert.equal(primary.readOnlyRoutes.length, 0);
    assert.equal(operationShard.entries.length, 1);
  });

  it("accepts legacy registries with no readOnlyRoutes field", () => {
    const value = fixture();
    const result = mergeReviewedManifestDeltaRegistries({
      primary: value.registry,
      shards: [],
    });
    assert.deepEqual(result.readOnlyRoutes, []);
  });

  it("rejects a shard with a different schema", () => {
    const value = fixture();
    const shard = structuredClone(value.registry);
    shard.schemaVersion = 2;
    assert.throws(
      () => mergeReviewedManifestDeltaRegistries({
        primary: value.registry,
        shards: [{ name: "invalid-schema.json", registry: shard }],
      }),
      /shard:invalid-schema\.json_schema_invalid/,
    );
  });

  it("rejects a shard pinned to a different immutable baseline", () => {
    const value = fixture();
    const shard = structuredClone(value.registry);
    shard.baselineBlobSha = "0".repeat(40);
    assert.throws(
      () => mergeReviewedManifestDeltaRegistries({
        primary: value.registry,
        shards: [{ name: "invalid-baseline.json", registry: shard }],
      }),
      /shard_baseline_mismatch:invalid-baseline\.json/,
    );
  });

  it("rejects a shard without an exact entries array", () => {
    const value = fixture();
    const shard = structuredClone(value.registry);
    delete shard.entries;
    assert.throws(
      () => mergeReviewedManifestDeltaRegistries({
        primary: value.registry,
        shards: [{ name: "missing-entries.json", registry: shard }],
      }),
      /shard:missing-entries\.json_entries_invalid/,
    );
  });

  it("rejects a non-array readOnlyRoutes registry field", () => {
    const value = fixture();
    const shard = { ...structuredClone(value.registry), readOnlyRoutes: {} };
    assert.throws(
      () => mergeReviewedManifestDeltaRegistries({
        primary: value.registry,
        shards: [{ name: "invalid-read-routes.json", registry: shard }],
      }),
      /read_only_routes_invalid/,
    );
  });
});

describe("reviewed API security manifest deltas", () => {
  it("applies one exact reviewed replacement without mutating the baseline", () => {
    const value = fixture();
    const result = applyReviewedManifestDeltas(value);
    assert.equal(result.appliedCount, 1);
    assert.equal(result.operationDeltaCount, 1);
    assert.equal(result.readOnlyRouteCount, 0);
    assert.deepEqual(result.manifest.routes[0], value.replacement);
    assert.equal(value.baseline.routes[0].sourceHash, "a".repeat(24));
    assert.equal(value.baseline.totals.routeFiles, 1);
  });

  it("applies one exact additive read-only route and increments only routeFiles", () => {
    const value = fixture();
    const route = readOnlyRoute();
    value.registry.readOnlyRoutes = [route];

    const result = applyReviewedManifestDeltas(value);
    assert.equal(result.appliedCount, 2);
    assert.equal(result.operationDeltaCount, 1);
    assert.equal(result.readOnlyRouteCount, 1);
    assert.deepEqual(result.readOnlyRoutes, [route]);
    assert.equal(result.manifest.totals.routeFiles, 2);
    assert.equal(value.baseline.totals.routeFiles, 1);
  });

  it("applies an ordered chain for the same operation when every hash link is exact", () => {
    const value = fixture();
    const finalReplacement = {
      route: "/api/example",
      method: "POST",
      sourceHash: "c".repeat(24),
      controls: { failClosed: true, transaction: true },
    };
    value.registry.entries.push({
      route: "/api/example",
      method: "POST",
      previousSourceHash: "b".repeat(24),
      issue: "#183",
      owner: "security-platform",
      reason: "A later reviewed authority slice advanced this exact operation again.",
      replacement: finalReplacement,
    });

    const result = applyReviewedManifestDeltas(value);
    assert.equal(result.appliedCount, 2);
    assert.deepEqual(result.manifest.routes[0], finalReplacement);
    assert.equal(value.baseline.routes[0].sourceHash, "a".repeat(24));
  });

  it("applies a delegated-only contract change while the route source hash stays fixed", () => {
    const value = fixture();
    value.baseline.routes[0].delegatedSourceHash = "d".repeat(24);
    value.baselineRaw = `${JSON.stringify(value.baseline, null, 2)}\n`;
    value.registry.baselineBlobSha = gitBlobSha(value.baselineRaw);
    value.registry.entries[0].replacement = {
      ...structuredClone(value.baseline.routes[0]),
      delegatedSourceHash: "e".repeat(24),
      controls: { failClosed: true },
    };

    const result = applyReviewedManifestDeltas(value);
    assert.equal(result.manifest.routes[0].sourceHash, "a".repeat(24));
    assert.equal(result.manifest.routes[0].delegatedSourceHash, "e".repeat(24));
  });

  it("rejects duplicate reviewed read-only routes and source paths", () => {
    const value = fixture();
    value.registry.readOnlyRoutes = [readOnlyRoute(), readOnlyRoute()];
    assert.throws(
      () => applyReviewedManifestDeltas(value),
      /duplicate_route/,
    );

    const second = fixture();
    second.registry.readOnlyRoutes = [
      readOnlyRoute(),
      readOnlyRoute({ route: "/api/community/other" }),
    ];
    assert.throws(
      () => applyReviewedManifestDeltas(second),
      /duplicate_source/,
    );
  });

  it("rejects weakened or unknown read-only route controls", () => {
    const weakened = fixture();
    weakened.registry.readOnlyRoutes = [readOnlyRoute({
      controls: {
        ...readOnlyRoute().controls,
        strictRevocation: false,
      },
    })];
    assert.throws(
      () => applyReviewedManifestDeltas(weakened),
      /controls_invalid/,
    );

    const unknown = fixture();
    unknown.registry.readOnlyRoutes = [readOnlyRoute({ extra: true })];
    assert.throws(
      () => applyReviewedManifestDeltas(unknown),
      /unknown_field:extra/,
    );
  });

  it("rejects a read-only route when routeFiles authority is absent", () => {
    const value = fixture();
    delete value.baseline.totals;
    value.baselineRaw = `${JSON.stringify(value.baseline, null, 2)}\n`;
    value.registry.baselineBlobSha = gitBlobSha(value.baselineRaw);
    value.registry.readOnlyRoutes = [readOnlyRoute()];
    assert.throws(
      () => applyReviewedManifestDeltas(value),
      /route_file_total_invalid/,
    );
  });

  it("rejects a different baseline blob", () => {
    const value = fixture();
    value.registry.baselineBlobSha = "0".repeat(40);
    assert.throws(() => applyReviewedManifestDeltas(value), /baseline_mismatch/);
  });

  it("rejects stale previous source evidence", () => {
    const value = fixture();
    value.registry.entries[0].previousSourceHash = "c".repeat(24);
    assert.throws(() => applyReviewedManifestDeltas(value), /previous_hash_mismatch/);
  });

  it("rejects a repeated operation that does not continue the exact hash chain", () => {
    const value = fixture();
    value.registry.entries.push(structuredClone(value.registry.entries[0]));
    assert.throws(() => applyReviewedManifestDeltas(value), /previous_hash_mismatch/);
  });

  it("rejects a structurally exact no-op ledger entry", () => {
    const value = fixture();
    value.registry.entries[0].replacement = structuredClone(value.baseline.routes[0]);
    assert.throws(() => applyReviewedManifestDeltas(value), /delta_noop/);
  });

  it("rejects a replacement aimed at another operation", () => {
    const value = fixture();
    value.registry.entries[0].replacement.route = "/api/other";
    assert.throws(() => applyReviewedManifestDeltas(value), /replacement_target_mismatch/);
  });
});
