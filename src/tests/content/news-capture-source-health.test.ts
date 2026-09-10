import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  NEWS_SOURCE_REGISTRY,
  captureContinuity,
  isContinuityRisk,
  participatesInContinuity,
} from "../../lib/news-source-registry";

describe("news capture source health authority", () => {
  it("fails closed when a source has no previous head and yields zero accepted articles", () => {
    const continuity = captureContinuity({
      sourceFailed: false,
      previousHeadExists: false,
      fetchedCount: 0,
      replayedCount: 0,
    });

    assert.equal(continuity, "bootstrap_empty");
    assert.equal(isContinuityRisk(continuity), true);
  });

  it("preserves bootstrap for a first healthy capture with accepted articles", () => {
    const continuity = captureContinuity({
      sourceFailed: false,
      previousHeadExists: false,
      fetchedCount: 12,
      replayedCount: 0,
    });

    assert.equal(continuity, "bootstrap");
    assert.equal(isContinuityRisk(continuity), false);
  });

  it("requires overlap for existing sources", () => {
    assert.equal(captureContinuity({
      sourceFailed: false,
      previousHeadExists: true,
      fetchedCount: 12,
      replayedCount: 1,
    }), "proven_overlap");

    const noOverlap = captureContinuity({
      sourceFailed: false,
      previousHeadExists: true,
      fetchedCount: 12,
      replayedCount: 0,
    });
    assert.equal(noOverlap, "continuity_unproven");
    assert.equal(isContinuityRisk(noOverlap), true);
  });

  it("treats an empty existing feed and transport failure as continuity risks", () => {
    const empty = captureContinuity({
      sourceFailed: false,
      previousHeadExists: true,
      fetchedCount: 0,
      replayedCount: 0,
    });
    const failed = captureContinuity({
      sourceFailed: true,
      previousHeadExists: true,
      fetchedCount: 0,
      replayedCount: 0,
    });

    assert.equal(empty, "empty_feed");
    assert.equal(failed, "source_failed");
    assert.equal(isContinuityRisk(empty), true);
    assert.equal(isContinuityRisk(failed), true);
  });

  it("keeps required sources in the continuity quorum by default", () => {
    assert.equal(participatesInContinuity(undefined), true);
    assert.equal(participatesInContinuity("required"), true);
    assert.equal(participatesInContinuity("quarantined"), false);
  });

  it("quarantines only the proven-stale Blockworks feed", () => {
    const quarantined = NEWS_SOURCE_REGISTRY.filter((source) => source.continuityMode === "quarantined");

    assert.deepEqual(quarantined.map((source) => source.name), ["Blockworks"]);
    assert.match(
      quarantined[0].quarantineReason ?? "",
      /^upstream_feed_stale_newest_entry_2026-01-07_observed_2026-09-10$/,
    );

    for (const source of NEWS_SOURCE_REGISTRY.filter((entry) => entry.name !== "Blockworks")) {
      assert.equal(participatesInContinuity(source.continuityMode), true, source.name);
    }
  });
});
