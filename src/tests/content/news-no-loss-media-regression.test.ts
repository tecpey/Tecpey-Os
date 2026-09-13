import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  extractNewsThumbnailFromFeedBlock,
  extractNewsThumbnailFromHtml,
  safeNewsThumbnailUrl,
} from "../../services/news/thumbnail-authority";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

async function source(path: string): Promise<string> {
  return readFile(resolve(ROOT, path), "utf8");
}

describe("news no-loss archive and media authority", () => {
  it("rejects unsafe media targets while accepting HTTPS CDN media", () => {
    assert.equal(safeNewsThumbnailUrl("http://cdn.example.com/image.jpg"), null);
    assert.equal(safeNewsThumbnailUrl("https://127.0.0.1/image.jpg"), null);
    assert.equal(safeNewsThumbnailUrl("https://192.168.1.8/image.jpg"), null);
    assert.equal(safeNewsThumbnailUrl("https://localhost/image.jpg"), null);
    assert.equal(
      safeNewsThumbnailUrl("https://cdn.example.com/news/image.jpg#tracking"),
      "https://cdn.example.com/news/image.jpg",
    );
  });

  it("extracts common RSS and social-card thumbnail formats deterministically", () => {
    assert.deepEqual(
      extractNewsThumbnailFromFeedBlock(
        `<item><media:content url="https://cdn.example.com/a.jpg" medium="image" /></item>`,
        "https://publisher.example/story",
      ),
      { url: "https://cdn.example.com/a.jpg", method: "rss_media_content" },
    );

    assert.deepEqual(
      extractNewsThumbnailFromHtml(
        `<html><head><meta property="og:image" content="/images/story.webp"></head></html>`,
        "https://publisher.example/story",
      ),
      { url: "https://publisher.example/images/story.webp", method: "open_graph" },
    );
  });

  it("keeps Persian archive visibility independent from translation completion", async () => {
    const authority = await source("src/services/news/archive-presentation-authority.ts");
    assert.match(authority, /translationPending: locale === "fa" && !useTranslation/);
    assert.match(authority, /WHEN 'article_full' THEN 3/);
    assert.match(authority, /WHEN 'feed_full' THEN 2/);
    assert.doesNotMatch(authority, /WHERE \(\$2 <> 'fa' OR translation\.status = 'completed'\)/);
  });

  it("keeps publisher full bodies inside the evidence boundary", async () => {
    const authority = await source("src/services/news/archive-presentation-authority.ts");
    assert.match(authority, /Omit<NewsArchiveItem, "sourceBody">/);
    assert.doesNotMatch(authority, /sourceBody: String\(row\.source_body\)/);
    assert.doesNotMatch(authority, /source_title, source_lead, source_body, source_coverage/);
    assert.match(authority, /readiness\.publicSummaryAllowed/);
    assert.match(authority, /readiness\.persianEditorialAllowed/);
    assert.match(authority, /displayBody: useTranslation \? String\(row\.translated_body\) : fallbackLead/);
  });

  it("keeps pending Persian archive rows out of downstream quiz and automation authority", async () => {
    const api = await source("src/app/api/crypto-news/route.ts");
    assert.match(api, /archiveItems\.filter\(\(item\) => !item\.translationPending\)/);
    assert.match(api, /buildNewsQuizBankFromFeed\(items\.slice\(0, 40\)/);
    assert.match(api, /automationPreview\(allItems, locale, updatedAt\)/);
    assert.match(api, /pendingTranslationCount/);
  });

  it("renders responsive 16:9 source media with explicit translation state", async () => {
    const archive = await source("src/components/news/DailyNewsArchive.tsx");
    assert.match(archive, /aspect-\[16\/9\]/);
    assert.match(archive, /object-cover/);
    assert.match(archive, /referrerPolicy="no-referrer"/);
    assert.match(archive, /ترجمه در بازپردازش/);
    assert.match(archive, /سیاست بازنشر منبع اجازه داده باشد/);
  });

  it("keeps governed media off the public API surface and verifies archive identity", async () => {
    const presentation = await source("src/services/news/archive-presentation-authority.ts");
    const mediaRoute = await source("src/app/crypto-news/media/route.ts");
    const resolver = await source("src/services/news/thumbnail-authority.ts");
    assert.match(presentation, /\/crypto-news\/media\?article=/);
    assert.doesNotMatch(presentation, /\/api\/crypto-news\/thumbnail/);
    assert.match(mediaRoute, /resolveNewsThumbnailRedirectTarget/);
    assert.match(mediaRoute, /rateLimit/);
    assert.match(resolver, /archivedSource\(articleUrl\)/);
  });

  it("never lets thumbnail discovery bypass provider media-rights policy", async () => {
    const resolver = await source("src/services/news/thumbnail-authority.ts");
    assert.match(resolver, /readiness\.thumbnailPolicy === "licensed"/);
    assert.match(resolver, /readiness\.thumbnailPolicy === "official_attribution"/);
    assert.match(resolver, /isApprovedNewsSourceHost/);
    assert.match(resolver, /feedCatalogInflight/);
  });
});
