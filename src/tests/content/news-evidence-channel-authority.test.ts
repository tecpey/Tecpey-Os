import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyNewsEvidenceChannel,
  factualCorroborationDecision,
  independentFactualSourceCount,
} from "../../lib/news-evidence-channel-authority";

describe("news evidence channel authority", () => {
  it("classifies X/Twitter as social evidence", () => {
    assert.equal(classifyNewsEvidenceChannel({ url: "https://x.com/example/status/1" }), "social_x");
    assert.equal(factualCorroborationDecision("social_x").eligible, false);
  });

  it("keeps social evidence out of independent factual corroboration counts", () => {
    const count = independentFactualSourceCount([
      { id: "1", channel: "factual_publisher", url: "https://a.example/1", publisher: "A", author: null, publishedAt: null, retrievedAt: "2026-10-04T00:00:00Z", threadId: null },
      { id: "2", channel: "factual_publisher", url: "https://b.example/1", publisher: "B", author: null, publishedAt: null, retrievedAt: "2026-10-04T00:00:00Z", threadId: null },
      { id: "3", channel: "social_x", url: "https://x.com/example/status/3", publisher: null, author: "@example", publishedAt: null, retrievedAt: "2026-10-04T00:00:00Z", threadId: "3" },
    ]);
    assert.equal(count, 2);
  });

  it("fails closed for unregistered web domains unless the channel is explicitly governed", () => {
    assert.equal(classifyNewsEvidenceChannel({ url: "https://unknown.example/story" }), "other");
    assert.equal(classifyNewsEvidenceChannel({ channel: "public_web", url: "https://unknown.example/story" }), "factual_publisher");
  });

  it("does not let an unknown channel become factual authority", () => {
    assert.deepEqual(factualCorroborationDecision("other"), {
      eligible: false,
      reason: "unknown_channel",
    });
  });
});
