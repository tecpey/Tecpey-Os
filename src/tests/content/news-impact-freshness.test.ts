import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterCurrentNewsImpactItems,
  filterGovernedNewsImpactItems,
} from "../../lib/news-impact-history-authority";
import type { NewsImpactHistoryItem } from "../../lib/news-impact-history";

const base: NewsImpactHistoryItem = {
  id: "n1", locale: "en", title: "Test", summary: "Test", sourceName: "Source",
  sourceUrl: "https://example.test", newsUrl: "https://example.test/n1",
  publishedAt: "2026-08-24T00:00:00.000Z", recordedAt: "2026-08-24T00:01:00.000Z",
  priority: 80, impactScore: 8, tone: "neutral", reasonFa: "دلیل", reasonEn: "Reason",
  relatedToolSlugs: [], relatedCoinSymbols: [], relatedLessonHref: "/en/academy",
};

describe("live news-impact freshness", () => {
  it("keeps only non-future items published within seven days", () => {
    const now = Date.parse("2026-08-25T00:00:00.000Z");
    const old = { ...base, id: "old", publishedAt: "2026-08-10T00:00:00.000Z" };
    const future = { ...base, id: "future", publishedAt: "2026-08-26T00:00:00.000Z" };
    assert.deepEqual(filterCurrentNewsImpactItems([base, old, future], now).map((item) => item.id), ["n1"]);
  });

  it("revalidates current source authority before old history can power public surfaces", () => {
    const eligible = {
      ...base,
      id: "eligible",
      sourceName: "CoinDesk",
      sourceUrl: "https://www.coindesk.com/markets/example",
    };
    const quarantined = {
      ...base,
      id: "quarantined",
      sourceName: "Blockworks",
      sourceUrl: "https://blockworks.co/news/example",
    };
    const reviewOnly = {
      ...base,
      id: "review",
      sourceName: "The Defiant",
      sourceUrl: "https://thedefiant.io/news/example",
    };
    const unknown = { ...base, id: "unknown" };

    assert.deepEqual(
      filterGovernedNewsImpactItems([eligible, quarantined, reviewOnly, unknown]).map((item) => item.id),
      ["eligible"],
    );
  });
});
