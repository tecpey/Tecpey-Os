import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyReviewedManifestDeltas,
  gitBlobSha,
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
