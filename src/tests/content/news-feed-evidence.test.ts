import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyFeedSourceCoverage } from "../../lib/news-feed-evidence";

describe("news feed evidence classification", () => {
  it("rejects short publisher snippets as full evidence", () => {
    const snippet =
      "Coinbase has filed two notices with the SEC in a bid to offer single-stock perpetuals in the U.S. "
      + "U.S. users can already trade related products... Read the full story at The Defiant";

    assert.equal(
      classifyFeedSourceCoverage({
        fullContent: snippet,
        description: "Coinbase filed notices with the SEC.",
      }),
      "feed_summary",
    );
  });

  it("rejects truncation markers even when the feed body is long", () => {
    const truncated =
      `${"Evidence-bound article paragraph. ".repeat(60)} Continue reading at the publisher`;

    assert.equal(
      classifyFeedSourceCoverage({
        fullContent: truncated,
        description: "Short description.",
      }),
      "feed_summary",
    );
  });

  it("rejects short content even without an explicit truncation marker", () => {
    assert.equal(
      classifyFeedSourceCoverage({
        fullContent: "A".repeat(900),
        description: "Short description.",
      }),
      "feed_summary",
    );
  });

  it("accepts substantive untruncated feed bodies as full evidence", () => {
    const fullBody = [
      "The company published a detailed report describing the transaction and its operating context.",
      "The report explains the chronology, participants, quantities, regulatory background and material caveats.",
      "It also provides direct attribution and distinguishes confirmed developments from forward-looking plans.",
    ].join(" ").repeat(8);

    assert.ok(fullBody.length >= 1_200);

    assert.equal(
      classifyFeedSourceCoverage({
        fullContent: fullBody,
        description: "A concise publisher summary.",
      }),
      "feed_full",
    );
  });
});
