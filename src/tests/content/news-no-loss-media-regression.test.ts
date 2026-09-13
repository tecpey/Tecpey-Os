import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  extractNewsThumbnailFromFeedBlock,
  extractNewsThumbnailFromHtml,
  safeNewsThumbnailUrl,
} from "../../lib/news-thumbnail-authority";

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
    const authority = await source("src/lib/news-archive-presentation-authority.ts");
    assert.match(authority, /translationPending: locale === "fa" && !useTranslation/);
    assert.match(authority, /WHEN 'article_full' THEN 3/);
    assert.match(authority, /WHEN 'feed_full' THEN 2/);
    assert.doesNotMatch(authority, /WHERE \(\$2 <> 'fa' OR translation\.status = 'completed'\)/);
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
    assert.match(archive, /متن معتبر منبع نمایش داده می‌شود/);
  });

  it("never lets thumbnail discovery bypass provider media-rights policy", async () => {
    const resolver = await source("src/lib/news-thumbnail-authority.ts");
    assert.match(resolver, /readiness\.thumbnailPolicy === "licensed"/);
    assert.match(resolver, /readiness\.thumbnailPolicy === "official_attribution"/);
    assert.match(resolver, /archivedSource\(articleUrl\)/);
    assert.match(resolver, /isApprovedNewsSourceHost/);
  });
});
