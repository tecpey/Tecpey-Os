import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NEWS_STORY_CLUSTER_POLICY_VERSION,
  buildDeterministicStoryClusters,
  buildStoryRelations,
  compareStoryClusterCandidate,
  type StoryClusterCandidate,
} from "../../lib/news-story-cluster-authority";

function item(overrides: Partial<StoryClusterCandidate> = {}): StoryClusterCandidate {
  return {
    archiveId: "00000000-0000-4000-8000-000000000001",
    sourceName: "Publisher A",
    sourceDomain: "a.example",
    articleUrl: "https://a.example/story",
    title: "SEC approves Bitcoin ETF application",
    lead: "The regulator approved a Bitcoin ETF application today.",
    publishedAt: "2026-10-04T10:00:00.000Z",
    taxonomy: {
      coinSymbols: ["BTC"],
      coinSlugs: ["bitcoin"],
      toolSlugs: [],
      topicTags: ["regulation"],
      searchIntents: [],
      entityTags: ["coin:btc", "topic:regulation"],
      keywords: ["BTC", "bitcoin"],
    },
    ...overrides,
  };
}

describe("news story cluster authority", () => {
  it("merges deterministic near-duplicates only with shared entity and bounded time", () => {
    const a = item();
    const b = item({
      archiveId: "00000000-0000-4000-8000-000000000002",
      sourceName: "Publisher B",
      sourceDomain: "b.example",
      articleUrl: "https://b.example/story",
      title: "SEC approves Bitcoin ETF application today",
      lead: "Bitcoin ETF application approved by the regulator.",
      publishedAt: "2026-10-04T11:00:00.000Z",
    });
    const evidence = compareStoryClusterCandidate(a, b);
    assert.equal(evidence.policyVersion, NEWS_STORY_CLUSTER_POLICY_VERSION);
    assert.equal(evidence.decision, "merge");
    assert.equal(evidence.embeddingEvidence.usedForDecision, false);
    assert.equal(evidence.sourceIndependent, true);

    const clusters = buildDeterministicStoryClusters([b, a]);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].members.length, 2);
    assert.equal(clusters[0].independentSourceCount, 2);
  });

  it("keeps materially conflicting viewpoints distinct", () => {
    const a = item({
      title: "SEC approves Bitcoin ETF application",
      lead: "The regulator approved the application.",
    });
    const b = item({
      archiveId: "00000000-0000-4000-8000-000000000003",
      sourceName: "Publisher B",
      sourceDomain: "b.example",
      title: "SEC rejects Bitcoin ETF application",
      lead: "The regulator rejected the application.",
    });
    const evidence = compareStoryClusterCandidate(a, b);
    assert.equal(evidence.decision, "preserve_distinct");
    assert.ok(evidence.conflictSignals.length > 0);
    assert.equal(buildDeterministicStoryClusters([a, b]).length, 2);
  });

  it("does not use embedding evidence as a decision authority", () => {
    const evidence = compareStoryClusterCandidate(
      item(),
      item({
        archiveId: "00000000-0000-4000-8000-000000000004",
        title: "Bitcoin ETF approval reported by regulator",
      }),
      { provider: "multilingual-embedding-v1", score: 0.99, usedForDecision: false },
    );
    assert.equal(evidence.embeddingEvidence.score, 0.99);
    assert.equal(evidence.embeddingEvidence.usedForDecision, false);
    assert.equal(evidence.decision, "merge");
  });
});
