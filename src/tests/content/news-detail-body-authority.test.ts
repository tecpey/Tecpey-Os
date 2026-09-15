import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { newsBodyParagraphs } from "../../lib/news-detail-body-authority";

const authoritySource = readFileSync(
  new URL("../../lib/news-detail-body-authority.ts", import.meta.url),
  "utf8",
);

describe("news detail body authority", () => {
  it("turns compact persisted prose into readable bounded paragraphs", () => {
    const sentences = Array.from({ length: 12 }, (_, index) =>
      `جمله شماره ${index + 1} درباره یک واقعیت مشخص خبر است و بدون افزودن اطلاعات تازه همان شواهد منبع را توضیح می‌دهد.`,
    );
    const paragraphs = newsBodyParagraphs(sentences.join(" "));

    assert.ok(paragraphs.length >= 2);
    assert.equal(paragraphs.join(" "), sentences.join(" "));
    assert.ok(paragraphs.every((paragraph) => paragraph.length <= 750));
  });

  it("returns no paragraph for empty content", () => {
    assert.deepEqual(newsBodyParagraphs("   \n\t "), []);
  });

  it("keeps public full-body rendering Persian-only and rechecks current publication authority", () => {
    assert.match(authoritySource, /if \(locale !== "fa"\) return null/);
    assert.match(authoritySource, /isNewsPublicationSourceEligible\(articleUrl\)/);
  });

  it("requires integrity evidence on the exact translated content hash", () => {
    assert.match(authoritySource, /source_content_hash = archive\.content_hash/);
    assert.match(authoritySource, /evidence->>'numericIntegrity' = 'true'/);
    assert.match(authoritySource, /evidence->>'noAddedAdvice' = 'true'/);
    assert.match(authoritySource, /JOIN LATERAL/);
  });
});
