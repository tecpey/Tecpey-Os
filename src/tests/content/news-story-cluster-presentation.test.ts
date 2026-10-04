import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  selectPublicStoryClusterRepresentatives,
  type NewsArchivePresentationItem,
} from "../../services/news/archive-presentation-authority";

function item(overrides: Partial<NewsArchivePresentationItem> = {}): NewsArchivePresentationItem {
  return {
    archiveId: "00000000-0000-4000-8000-000000000001",
    sourceName: "Publisher A",
    sourceDomain: "a.example",
    articleUrl: "https://a.example/story",
    newsUrl: null,
    sourceLanguage: "en",
    sourceTitle: "Bitcoin ETF approved",
    sourceLead: "The regulator approved the application.",
    publishedAt: "2026-10-04T10:00:00.000Z",
    fetchedAt: "2026-10-04T10:05:00.000Z",
    day: "2026-10-04",
    contentHash: "hash-a",
    taxonomy: { coinSymbols: ["BTC"], coinSlugs: ["bitcoin"], toolSlugs: [], topicTags: ["regulation"], searchIntents: [], entityTags: [], keywords: [] },
    locale: "en",
    displayTitle: "Bitcoin ETF approved",
    displayLead: "The regulator approved the application.",
    displayBody: "The regulator approved the application.",
    translationStatus: "completed",
    translationProvider: null,
    translationModel: null,
    sourceCoverage: "feed_full",
    translationPending: false,
    publicSummaryAllowed: true,
    persianEditorialAllowed: true,
    thumbnailUrl: null,
    thumbnailAlt: "Bitcoin ETF approved",
    thumbnailPolicy: "official_attribution",
    thumbnailAttributionRequired: false,
    storyClusterId: null,
    storyClusterMembership: null,
    storyClusterMemberCount: null,
    storyClusterIndependentSourceCount: null,
    ...overrides,
  };
}

describe("public story cluster presentation authority", () => {
  it("emits one representative for corroborating duplicates while preserving cluster metadata", () => {
    const older = item({
      archiveId: "00000000-0000-4000-8000-000000000001",
      fetchedAt: "2026-10-04T10:05:00.000Z",
      storyClusterId: "cluster-1",
      storyClusterMembership: "canonical",
      storyClusterMemberCount: 3,
      storyClusterIndependentSourceCount: 2,
    });
    const newer = item({
      archiveId: "00000000-0000-4000-8000-000000000002",
      sourceName: "Publisher B",
      sourceDomain: "b.example",
      articleUrl: "https://b.example/story",
      fetchedAt: "2026-10-04T10:07:00.000Z",
      storyClusterId: "cluster-1",
      storyClusterMembership: "corroborating",
      storyClusterMemberCount: 3,
      storyClusterIndependentSourceCount: 2,
    });
    const unrelated = item({
      archiveId: "00000000-0000-4000-8000-000000000003",
      articleUrl: "https://c.example/other",
    });

    const result = selectPublicStoryClusterRepresentatives([older, newer, unrelated]);
    assert.equal(result.length, 2);
    assert.equal(result[0].storyClusterId, "cluster-1");
    assert.equal(result[0].archiveId, newer.archiveId);
    assert.equal(result[0].storyClusterIndependentSourceCount, 2);
    assert.equal(result[1].storyClusterId, null);
  });

  it("keeps conflicting and distinct viewpoints separate because they have different cluster IDs", () => {
    const conflicting = item({
      archiveId: "00000000-0000-4000-8000-000000000004",
      storyClusterId: "cluster-a",
      storyClusterMembership: "canonical",
      storyClusterMemberCount: 1,
      storyClusterIndependentSourceCount: 1,
    });
    const opposing = item({
      archiveId: "00000000-0000-4000-8000-000000000005",
      articleUrl: "https://b.example/conflict",
      storyClusterId: "cluster-b",
      storyClusterMembership: "canonical",
      storyClusterMemberCount: 1,
      storyClusterIndependentSourceCount: 1,
    });

    const result = selectPublicStoryClusterRepresentatives([conflicting, opposing]);
    assert.equal(result.length, 2);
  });

  it("is deterministic when fetch timestamps tie", () => {
    const a = item({
      archiveId: "00000000-0000-4000-8000-000000000006",
      storyClusterId: "cluster-tie",
      storyClusterMembership: "corroborating",
    });
    const b = item({
      archiveId: "00000000-0000-4000-8000-000000000007",
      storyClusterId: "cluster-tie",
      storyClusterMembership: "corroborating",
    });
    const result = selectPublicStoryClusterRepresentatives([b, a]);
    assert.equal(result[0].archiveId, a.archiveId);
  });
});
