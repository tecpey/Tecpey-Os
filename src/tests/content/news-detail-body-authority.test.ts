import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { newsBodyParagraphs } from "../../lib/news-detail-body-authority";

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
});
