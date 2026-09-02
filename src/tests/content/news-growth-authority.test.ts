import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalPublisherUrl, isValidArchiveDay, newsArchiveContentHash, resolveNewsArchiveObservationTimes, tehranCalendarDay } from "../../lib/news-growth-authority";
import { compactNewsBodyAtSentenceBoundary, validatePersianNewsTranslationIntegrity } from "../../lib/news-translation";

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

  it("keeps historical first fetch separate from the current materialization observation", () => {
    assert.deepEqual(
      resolveNewsArchiveObservationTimes({
        firstFetchedAt: "2026-09-01T10:00:00.000Z",
        currentFetchedAt: "2026-09-02T09:32:20.569Z",
        publishedAt: "2026-09-02T08:45:00.000Z",
      }),
      {
        firstFetchedAt: "2026-09-01T10:00:00.000Z",
        observedAt: "2026-09-02T09:32:20.569Z",
      },
    );
  });
  it("fails closed when title/lead numbers are dropped, output invents numbers, or trading advice is added", () => {
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
    assert.deepEqual(validatePersianNewsTranslationIntegrity({
      ...source,
      translatedTitle: "بیت‌کوین در سال ۲۰۲۶ حدود ۱۲٫۵٪ رشد کرد",
      translatedLead: "حجم به ۴۲ میلیون دلار رسید.",
      translatedBody: "گزارش به مشارکت چند نهاد اشاره می‌کند.",
    }), { ok: true });
    assert.equal(validatePersianNewsTranslationIntegrity({
      ...source,
      translatedTitle: "بیت‌کوین در سال ۲۰۲۶ حدود ۱۲٫۵٪ رشد کرد",
      translatedLead: "حجم به ۴۲ میلیون دلار رسید.",
      translatedBody: "این گزارش از مشارکت ۹ نهاد خبر می‌دهد.",
    }).ok, false);
  });

  it("canonicalizes percent, magnitude, currency and sign without weakening numeric integrity", () => {
    const valid = (sourceTitle: string, translatedTitle: string) =>
      validatePersianNewsTranslationIntegrity({
        sourceTitle,
        sourceLead: "Market update",
        sourceBody: "Market update",
        translatedTitle,
        translatedLead: "به‌روزرسانی بازار",
        translatedBody: "به‌روزرسانی بازار",
      });

    assert.deepEqual(valid("Bitcoin rises 12.5%", "بیت‌کوین ۱۲٫۵ درصد رشد کرد"), { ok: true });
    assert.deepEqual(valid("Volume reached $1.6 billion", "حجم به ۱٫۶ میلیارد دلار رسید"), { ok: true });
    assert.deepEqual(valid("Fund buys $131M of ETH", "صندوق ۱۳۱ میلیون دلار اتریوم خرید"), { ok: true });
    assert.deepEqual(
      valid(
        "Bitcoin rose 5% while volume hit $1 million",
        "بیت‌کوین ۵ درصد رشد کرد و حجم به ۱ میلیون دلار رسید",
      ),
      { ok: true },
    );
    assert.deepEqual(
      valid(
        "Users reached 42 million while revenue hit $5 million",
        "تعداد کاربران به ۴۲ میلیون رسید و درآمد به ۵ میلیون دلار رسید",
      ),
      { ok: true },
    );

    assert.equal(valid("Bitcoin falls 15%", "بیت‌کوین ۱۵ واحد افت کرد").ok, false);
    assert.equal(valid("Volume reached $1.6 billion", "حجم به ۱٫۶ میلیون دلار رسید").ok, false);
    assert.equal(valid("Bitcoin rises +5%", "بیت‌کوین ۵ درصد رشد کرد").ok, false);
    assert.equal(valid("Bitcoin rises +5%", "بیت‌کوین ۵- درصد تغییر کرد").ok, false);
    assert.equal(valid("Bitcoin rises 10%", "بیت‌کوین ۱۲ درصد رشد کرد").ok, false);
  });

  it("limits translated news body at a sentence boundary", () => {
    const sentence = "این یک جملهٔ کامل دربارهٔ خبر است. ";
    const rendered = compactNewsBodyAtSentenceBoundary(sentence.repeat(400), 600);
    assert.ok(rendered.length <= 600);
    assert.match(rendered, /[.!?؟؛]$/);
  });


});
