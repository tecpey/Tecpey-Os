import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyReviewedManifestDeltas,
  gitBlobSha,
  mergeReviewedManifestDeltaRegistries,
} from "./api-security-manifest-reviewed-deltas.mjs";

function fixture() {
  const baseline = {
    schemaVersion: 1,
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
  it("merges additive shard entries without mutating the primary registry", () => {
    const value = fixture();
    const primary = { ...value.registry, entries: [] };
    const shard = structuredClone(value.registry);
    const result = mergeReviewedManifestDeltaRegistries({
      primary,
      shards: [{ name: "0161-example.json", registry: shard }],
    });

    assert.equal(result.entries.length, 1);
    assert.deepEqual(result.entries[0], value.registry.entries[0]);
    assert.equal(primary.entries.length, 0);
    assert.equal(shard.entries.length, 1);
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
});

describe("reviewed API security manifest deltas", () => {
  it("applies one exact reviewed replacement without mutating the baseline", () => {
    const value = fixture();
    const result = applyReviewedManifestDeltas(value);
    assert.equal(result.appliedCount, 1);
    assert.deepEqual(result.manifest.routes[0], value.replacement);
    assert.equal(value.baseline.routes[0].sourceHash, "a".repeat(24));
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

  it("rejects duplicate operation deltas", () => {
    const value = fixture();
    value.registry.entries.push(structuredClone(value.registry.entries[0]));
    assert.throws(() => applyReviewedManifestDeltas(value), /duplicate/);
  });

  it("rejects a replacement aimed at another operation", () => {
    const value = fixture();
    value.registry.entries[0].replacement.route = "/api/other";
    assert.throws(() => applyReviewedManifestDeltas(value), /replacement_target_mismatch/);
  });
});
