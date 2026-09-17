import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  NEWS_AI_PROVIDER_CALLS_PER_ARTICLE_MAX,
  withNewsAiProviderCallCeiling,
} from "../../lib/ops/news-ai-provider-call-ceiling";

describe("news AI provider-call ceiling", () => {
  it("blocks a third article call before reservation or provider egress", async () => {
    let downstreamCalls = 0;
    const downstream: typeof fetch = async () => {
      downstreamCalls += 1;
      return new Response("{}", { status: 200 });
    };
    const guarded = withNewsAiProviderCallCeiling(downstream);

    assert.equal((await guarded("https://api.openai.com/v1/responses")).status, 200);
    assert.equal((await guarded("https://api.openai.com/v1/responses")).status, 200);

    const third = await guarded("https://api.openai.com/v1/responses");
    assert.equal(third.status, 402);
    assert.equal(third.headers.get("x-tecpey-news-ai-authority"), "provider_call_limit_exceeded");
    assert.equal(downstreamCalls, NEWS_AI_PROVIDER_CALLS_PER_ARTICLE_MAX);
  });

  it("fails closed for an invalid configured ceiling", () => {
    assert.throws(
      () => withNewsAiProviderCallCeiling(fetch, 0),
      /news_ai_provider_call_ceiling_invalid/,
    );
  });
});
