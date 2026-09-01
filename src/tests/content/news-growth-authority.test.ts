import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalPublisherUrl, isValidArchiveDay, newsArchiveContentHash, tehranCalendarDay } from "../../lib/news-growth-authority";
import { validatePersianNewsTranslationIntegrity } from "../../lib/news-translation";

describe("daily news archive authority", () => {
  it("uses Tehran calendar boundaries rather than UTC day boundaries", () => {
    assert.equal(tehranCalendarDay("2026-08-31T21:00:00.000Z"), "2026-09-01");
    assert.equal(tehranCalendarDay("2026-08-31T19:00:00.000Z"), "2026-08-31");
  });

  it("validates real calendar days and rejects impossible dates", () => {
    assert.equal(isValidArchiveDay("2028-02-29"), true);
    assert.equal(isValidArchiveDay("2026-02-29"), false);
    assert.equal(isValidArchiveDay("2026-13-01"), false);
  });

  it("removes common tracking parameters but preserves the canonical publisher URL", () => {
    assert.equal(canonicalPublisherUrl("https://example.com/news/a?utm_source=x&fbclid=123&id=42#comments"), "https://example.com/news/a?id=42");
  });

  it("hashes publisher-provided content deterministically", () => {
    const input = { articleUrl: "https://example.com/a", sourceTitle: "Bitcoin update", sourceLead: "Lead", sourceBody: "Body" };
    assert.equal(newsArchiveContentHash(input), newsArchiveContentHash(input));
    assert.notEqual(newsArchiveContentHash(input), newsArchiveContentHash({ ...input, sourceBody: "Body changed" }));
  });
  it("fails closed when a Persian translation drops a source number or adds trading advice", () => {
    const source = {
      sourceTitle: "Bitcoin rises 12.5% in 2026",
      sourceLead: "Volume reached 42 million dollars.",
      sourceBody: "The report says 3 institutions participated.",
    };
    assert.deepEqual(validatePersianNewsTranslationIntegrity({
      ...source,
      translatedTitle: "بیت‌کوین در سال ۲۰۲۶ حدود ۱۲٫۵٪ رشد کرد",
      translatedLead: "حجم به ۴۲ میلیون دلار رسید.",
      translatedBody: "این گزارش می‌گوید ۳ نهاد مشارکت داشتند.",
    }), { ok: true });
    assert.equal(validatePersianNewsTranslationIntegrity({
      ...source,
      translatedTitle: "بیت‌کوین در سال ۲۰۲۶ رشد کرد",
      translatedLead: "حجم به ۴۲ میلیون دلار رسید.",
      translatedBody: "این گزارش می‌گوید ۳ نهاد مشارکت داشتند.",
    }).ok, false);
    assert.equal(validatePersianNewsTranslationIntegrity({
      ...source,
      translatedTitle: "بیت‌کوین در سال ۲۰۲۶ حدود ۱۲٫۵٪ رشد کرد",
      translatedLead: "حجم به ۴۲ میلیون دلار رسید.",
      translatedBody: "این گزارش می‌گوید ۳ نهاد مشارکت داشتند؛ حتماً بخرید.",
    }).ok, false);
  });

});
