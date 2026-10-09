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
    channel: "factual_publisher",
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
    const relations = buildStoryRelations([a, b]);
    assert.equal(relations.length, 1);
    assert.equal(relations[0].relation, "conflicting_viewpoint");
    assert.equal(buildDeterministicStoryClusters([a, b]).length, 2);
  });

  it("does not treat opposing words inside one article as a cross-source conflict", () => {
    const a = item({
      title: "SEC approved the Bitcoin ETF after previously rejecting a draft",
      lead: "The regulator approved the final application.",
    });
    const b = item({
      archiveId: "00000000-0000-4000-8000-000000000006",
      sourceName: "Publisher B",
      sourceDomain: "b.example",
      title: "Bitcoin ETF application update",
      lead: "The regulator published an application update.",
    });
    const evidence = compareStoryClusterCandidate(a, b);
    assert.deepEqual(evidence.conflictSignals, []);
  });

  it("keeps deterministic clustering from transitive chain-merging", () => {
    const a = item({
      title: "Bitcoin ETF approval regulator",
      lead: "The regulator approved the Bitcoin ETF.",
    });
    const b = item({
      archiveId: "00000000-0000-4000-8000-000000000007",
      sourceName: "Publisher B",
      sourceDomain: "b.example",
      title: "Bitcoin ETF approval regulator today",
      lead: "The regulator approved the Bitcoin ETF today.",
      publishedAt: "2026-10-04T11:00:00.000Z",
    });
    const c = item({
      archiveId: "00000000-0000-4000-8000-000000000008",
      sourceName: "Publisher C",
      sourceDomain: "c.example",
      title: "Bitcoin ETF regulator filing today",
      lead: "A Bitcoin ETF regulator filing was published today.",
      publishedAt: "2026-10-04T12:00:00.000Z",
    });
    const clusters = buildDeterministicStoryClusters([a, b, c]);
    assert.equal(clusters.length, 2);
    assert.deepEqual(
      clusters.map((cluster) => cluster.members.length).sort(),
      [1, 2],
    );
  });

  it("keeps a same-entity story candidate across a calendar-day boundary", () => {
    const a = item({
      publishedAt: "2026-10-04T23:30:00.000Z",
    });
    const b = item({
      archiveId: "00000000-0000-4000-8000-000000000009",
      sourceName: "Publisher B",
      sourceDomain: "b.example",
      title: "SEC approves Bitcoin ETF application today",
      lead: "Bitcoin ETF application approved by the regulator.",
      publishedAt: "2026-10-05T01:00:00.000Z",
    });
    const evidence = compareStoryClusterCandidate(a, b);
    assert.equal(evidence.decision, "merge");
    assert.equal(evidence.sharedEntityCount, 2);
  });

  it("does not count syndication under one publisher identity as independent sources", () => {
    const a = item({
      sourceName: "CoinDesk",
      sourceDomain: "coindesk.com",
      articleUrl: "https://www.coindesk.com/story-a",
    });
    const b = item({
      archiveId: "00000000-0000-4000-8000-000000000011",
      sourceName: "CoinDesk",
      sourceDomain: "www.coindesk.com",
      articleUrl: "https://www.coindesk.com/story-b",
      title: "SEC approves Bitcoin ETF application today",
    });
    const clusters = buildDeterministicStoryClusters([a, b]);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].independentSourceCount, 1);
    assert.equal(clusters[0].factualSourceCount, 1);
  });

  it("keeps social evidence in a separate channel from factual publisher evidence", () => {
    const factual = item();
    const social = item({
      archiveId: "00000000-0000-4000-8000-000000000005",
      sourceName: "X",
      sourceDomain: "x.com",
      articleUrl: "https://x.com/example/status/5",
      channel: "social_x",
      title: "SEC approves Bitcoin ETF application today",
      lead: "A social post claims the Bitcoin ETF was approved.",
    });
    const evidence = compareStoryClusterCandidate(factual, social);
    assert.equal(evidence.sourceChannel, "factual_publisher");
    assert.equal(evidence.decision, "preserve_distinct");
    assert.equal(buildDeterministicStoryClusters([factual, social]).length, 2);

    const socialDuplicate = { ...social, archiveId: "00000000-0000-4000-8000-000000000010", articleUrl: "https://x.com/example/status/10" };
    assert.equal(compareStoryClusterCandidate(social, socialDuplicate).decision, "merge");
  });

  it("does not use embedding evidence as a decision authority", () => {
    const evidence = compareStoryClusterCandidate(
      item(),
      item({
        archiveId: "00000000-0000-4000-8000-000000000004",
        title: "SEC approves Bitcoin ETF application today",
      }),
      { provider: "multilingual-embedding-v1", score: 0.99, usedForDecision: false },
    );
    assert.equal(evidence.embeddingEvidence.score, 0.99);
    assert.equal(evidence.embeddingEvidence.usedForDecision, false);
    assert.equal(evidence.decision, "merge");
  });
});
