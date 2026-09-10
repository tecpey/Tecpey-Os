import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { selectUnseenPublisherEvidenceCandidates } from "../../lib/news-capture-evidence-promotion";
import type { NewsSourceRegistryEntry } from "../../lib/news-source-registry";

function source(name: string, allowFullArticleFetch: boolean): NewsSourceRegistryEntry {
  return {
    id: name.toLowerCase(),
    name,
    feedUrl: `https://${name.toLowerCase()}.example/feed`,
    canonicalDomains: [`${name.toLowerCase()}.example`],
    category: "general_crypto",
    trustTier: "tier_2",
    firstParty: false,
    allowFullArticleFetch,
    corroborationWeight: 0.8,
  };
}

describe("capture evidence promotion selection", () => {
  it("selects only unseen, policy-allowed summary evidence", () => {
    const allowed = source("Allowed", true);
    const blocked = source("Blocked", false);
    const fullBody = `Lead ${"complete feed evidence ".repeat(80)}`;
    const items = [
      { source: allowed, articleUrl: "https://allowed.example/new", lead: "Lead", body: "Lead" },
      { source: allowed, articleUrl: "https://allowed.example/existing", lead: "Lead", body: "Lead" },
      { source: blocked, articleUrl: "https://blocked.example/new", lead: "Lead", body: "Lead" },
      { source: allowed, articleUrl: "https://allowed.example/full", lead: "Lead", body: fullBody },
    ];

    const selected = selectUnseenPublisherEvidenceCandidates({
      items,
      existingArticleUrls: new Set(["https://allowed.example/existing"]),
      limit: 8,
    });

    assert.deepEqual(selected.map((item) => item.articleUrl), ["https://allowed.example/new"]);
  });

  it("enforces the bounded per-run request ceiling", () => {
    const allowed = source("Allowed", true);
    const items = Array.from({ length: 30 }, (_, index) => ({
      source: allowed,
      articleUrl: `https://allowed.example/${index}`,
      lead: "Lead",
      body: "Lead",
    }));

    assert.equal(
      selectUnseenPublisherEvidenceCandidates({
        items,
        existingArticleUrls: new Set(),
        limit: 100,
      }).length,
      24,
    );
  });
});
