import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { submitIndexNowUrls } from "../../lib/indexnow";
import {
  getNewsDetailMetadata,
  type NewsDetailPageModel,
} from "../../lib/news-detail-pages";

const originalIndexNowKey = process.env.INDEXNOW_KEY;
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (originalIndexNowKey === undefined) delete process.env.INDEXNOW_KEY;
  else process.env.INDEXNOW_KEY = originalIndexNowKey;
  globalThis.fetch = originalFetch;
});

function detailModel(counterpartUrl: string | null): NewsDetailPageModel {
  return {
    item: {
      id: "en-authority-regression",
      locale: "en",
      title: "Governed news authority regression",
      summary: "A regression fixture for governed publication, indexing and cross-locale metadata authority.",
      sourceName: "CoinDesk",
      sourceUrl: "https://www.coindesk.com/example",
      newsUrl: "/en/crypto-news/governed-news-authority-regression",
      publishedAt: "2026-09-12T07:45:31.068Z",
      recordedAt: "2026-09-12T07:45:58.164Z",
      priority: 88,
      impactScore: 8,
      tone: "neutral",
      reasonFa: "آزمون مرجع انتشار خبر.",
      reasonEn: "Publication authority regression fixture.",
      relatedToolSlugs: [],
      relatedCoinSymbols: ["BTC"],
      relatedLessonHref: "/en/academy/term-5",
    },
    slug: "governed-news-authority-regression",
    url: "https://tecpey.ir/en/crypto-news/governed-news-authority-regression",
    counterpartUrl,
    relatedCoins: [],
    relatedTools: [],
  };
}

describe("News publication authority regressions", () => {
  it("does not emit a fabricated Persian hreflang when no Persian counterpart exists", () => {
    const metadata = getNewsDetailMetadata(detailModel(null), "en");

    assert.equal(metadata.alternates.canonical, "https://tecpey.ir/en/crypto-news/governed-news-authority-regression");
    assert.equal(metadata.alternates.languages["en-US"], metadata.alternates.canonical);
    assert.equal(metadata.alternates.languages["fa-IR"], undefined);
    assert.equal(metadata.alternates.languages["x-default"], metadata.alternates.canonical);
    assert.deepEqual(metadata.openGraph.alternateLocale, []);
  });

  it("emits the real Persian hreflang only when authority resolved the counterpart", () => {
    const counterpart = "https://tecpey.ir/crypto-news/news-fa-authority-regression";
    const metadata = getNewsDetailMetadata(detailModel(counterpart), "en");

    assert.equal(metadata.alternates.languages["fa-IR"], counterpart);
    assert.equal(metadata.alternates.languages["x-default"], counterpart);
    assert.deepEqual(metadata.openGraph.alternateLocale, ["fa_IR"]);
  });

  it("fails closed before IndexNow when governed publication attestation is absent", async () => {
    process.env.INDEXNOW_KEY = "authority-test-key";
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const url = "https://tecpey.ir/en/crypto-news/legacy-growth-only";
    const result = await submitIndexNowUrls([url]);

    assert.deepEqual(result, { configured: true, submitted: 0 });
    assert.equal(fetchCalls, 0);
  });

  it("submits only URLs explicitly attested by governed publication authority", async () => {
    process.env.INDEXNOW_KEY = "authority-test-key";
    const submittedBodies: string[] = [];
    globalThis.fetch = (async (_input, init) => {
      submittedBodies.push(String(init?.body ?? ""));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const governed = "https://tecpey.ir/en/crypto-news/governed";
    const legacyOnly = "https://tecpey.ir/en/crypto-news/legacy-only";
    const result = await submitIndexNowUrls(
      [governed, legacyOnly],
      { governedPublicationUrls: [governed] },
    );

    assert.equal(result.configured, true);
    assert.equal(result.submitted, 1);
    assert.equal(submittedBodies.length, 1);
    assert.match(submittedBodies[0], /governed/);
    assert.doesNotMatch(submittedBodies[0], /legacy-only/);
  });
});
