import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalPublisherUrl, isValidArchiveDay, newsArchiveContentHash, resolveNewsArchiveObservationTimes, tehranCalendarDay } from "../../lib/news-growth-authority";
import {
  findUnsupportedFeedSummaryLatinEntities,
  maxFeedSummaryTranslationBodyChars,
  isFeedSummaryTranslationBodyLengthAcceptable,
  isReusableNewsCoverageCompatible, resolveReusableOrFreshPersianNewsTranslation, compactNewsBodyAtSentenceBoundary, validatePersianNewsTranslationIntegrity, translateNewsFeedToPersian } from "../../lib/news-translation";

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


it("normalizes hyphenated entities and plural acronyms without weakening the summary entity gate", () => {
  assert.deepEqual(
    findUnsupportedFeedSummaryLatinEntities({
      sourceTitle: "Hayden Adams Says AMMs Will Win",
      sourceLead: "The thesis concerns automated market makers.",
      sourceBody: "The discussion concerns AMMs and tokenized markets.",
      translatedTitle: "Hayden Adams درباره AMMها صحبت کرد",
      translatedLead: "بحث درباره AMM است.",
      translatedBody: "این متن درباره AMM است.",
    }),
    [],
  );

  assert.deepEqual(
    findUnsupportedFeedSummaryLatinEntities({
      sourceTitle: "Tokenized ETFs expand",
      sourceLead: "Distribution of tokenized ETFs is expanding.",
      sourceBody: "BlackRock discussed tokenized ETFs.",
      translatedTitle: "ETFهای توکنیزه‌شده گسترش می‌یابند",
      translatedLead: "توزیع ETF گسترش می‌یابد.",
      translatedBody: "BlackRock درباره ETF صحبت کرده است.",
    }),
    [],
  );

  assert.deepEqual(
    findUnsupportedFeedSummaryLatinEntities({
      sourceTitle: "Cronos Automatic Token Support",
      sourceLead: "Cronos is an EVM-compatible Layer 1 blockchain.",
      sourceBody: "Cronos is EVM-compatible.",
      translatedTitle: "پشتیبانی Cronos",
      translatedLead: "Cronos با EVM سازگار است.",
      translatedBody: "Cronos از EVM استفاده می‌کند.",
    }),
    [],
  );

  assert.deepEqual(
    findUnsupportedFeedSummaryLatinEntities({
      sourceTitle: "US perpetuals plan",
      sourceLead: "The plan would use CFTC-regulated Bitnomial.",
      sourceBody: "The reported plan requires regulatory sign-off.",
      translatedTitle: "طرح معاملات دائمی آمریکا",
      translatedLead: "این طرح از Bitnomial تحت نظارت CFTC استفاده می‌کند.",
      translatedBody: "CFTC در متن منبع ذکر شده است.",
    }),
    [],
  );

  assert.deepEqual(
    findUnsupportedFeedSummaryLatinEntities({
      sourceTitle: "Firelight raises funding",
      sourceLead: "The Sentora-incubated protocol raised funding.",
      sourceBody: "Firelight raised funding.",
      translatedTitle: "Firelight سرمایه جذب کرد",
      translatedLead: "پروتکل تحت حمایت Sentora سرمایه جذب کرد.",
      translatedBody: "Sentora در منبع ذکر شده است.",
    }),
    [],
  );

  assert.deepEqual(
    findUnsupportedFeedSummaryLatinEntities({
      sourceTitle: "Revolut Gets Conditional OCC Approval",
      sourceLead: "OCC conditionally approved the application.",
      sourceBody: "The approval does not clear the bank to launch.",
      translatedTitle: "Revolut تأیید مشروط OCC را گرفت",
      translatedLead: "Revolut هنوز به تأیید FDIC نیاز دارد.",
      translatedBody: "Federal Reserve نیز باید مجوز صادر کند.",
    }),
    ["fdic", "federal", "reserve"],
  );
});

it("rejects unsupported Latin entities in summary-only translations", () => {
  assert.deepEqual(
    findUnsupportedFeedSummaryLatinEntities({
      sourceTitle: "Revolut Says OCC Conditionally Approved Proposed US National Bank",
      sourceLead: "Revolut said OCC conditionally approved the application.",
      sourceBody: "Revolut said OCC conditionally approved the application.",
      translatedTitle: "Revolut از تأیید مشروط OCC خبر داد",
      translatedLead: "Revolut اعلام کرد OCC درخواست را مشروط تأیید کرده است.",
      translatedBody: "Revolut هنوز به تأیید FDIC و Federal Reserve نیاز دارد.",
    }),
    ["fdic", "federal", "reserve"],
  );

  assert.deepEqual(
    findUnsupportedFeedSummaryLatinEntities({
      sourceTitle: "Coinbase Files SEC Notices",
      sourceLead: "Coinbase filed notices with the SEC.",
      sourceBody: "Coinbase filed notices with the SEC.",
      translatedTitle: "Coinbase اطلاعیه‌های SEC را ثبت کرد",
      translatedLead: "Coinbase نزد SEC اطلاعیه ثبت کرد.",
      translatedBody: "Coinbase نزد SEC اطلاعیه ثبت کرده است.",
    }),
    [],
  );
});

it("fails closed on excessive summary-only expansion without constraining full evidence", () => {
  const source = "A".repeat(331);

  assert.equal(maxFeedSummaryTranslationBodyChars(source), 451);
  assert.equal(
    isFeedSummaryTranslationBodyLengthAcceptable({
      sourceBody: source,
      translatedBody: "ب".repeat(430),
    }),
    true,
  );
  assert.equal(
    isFeedSummaryTranslationBodyLengthAcceptable({
      sourceBody: source,
      translatedBody: "ب".repeat(511),
    }),
    false,
  );

  const largerSource = "A".repeat(2_000);
  assert.equal(maxFeedSummaryTranslationBodyChars(largerSource), 2_700);
});

it("invalidates cached translations when source coverage changes", () => {
  assert.equal(isReusableNewsCoverageCompatible("feed_full", "feed_summary"), false);
  assert.equal(isReusableNewsCoverageCompatible("feed_summary", "feed_full"), false);
  assert.equal(isReusableNewsCoverageCompatible("article_full", "feed_summary"), false);
  assert.equal(isReusableNewsCoverageCompatible(null, "feed_summary"), false);
  assert.equal(isReusableNewsCoverageCompatible("feed_summary", "feed_summary"), true);
  assert.equal(isReusableNewsCoverageCompatible("feed_full", "feed_full"), true);
  assert.equal(isReusableNewsCoverageCompatible("article_full", "article_full"), true);
});

it("refreshes a cached Persian translation when the current integrity contract rejects reuse", async () => {
  let freshCalls = 0;

  const result = await resolveReusableOrFreshPersianNewsTranslation({
    reused: {
      title: "حجم به ۱٫۶ میلیون دلار رسید",
      lead: "حجم معاملات افزایش یافت",
      body: "حجم معاملات افزایش یافت",
      sourceTitle: "Volume reached $1.6 billion",
      sourceLead: "Trading volume increased",
      sourceBody: "Trading volume increased",
      providerId: "openai",
      model: "cached-model",
      sourceCoverage: "feed_summary",
    },
    fresh: async () => {
      freshCalls += 1;
      return {
        ok: true as const,
        translation: {
          title: "حجم به ۱٫۶ میلیارد دلار رسید",
          lead: "حجم معاملات افزایش یافت",
          body: "حجم معاملات افزایش یافت",
          providerId: "openai" as const,
          model: "fresh-model",
          sourceCoverage: "feed_summary" as const,
          quality: {
            persian: true as const,
            numericIntegrity: true as const,
            noAddedAdvice: true as const,
          },
        },
      };
    },
  });

  assert.equal(freshCalls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.reused === true, false);
  assert.equal(result.ok && result.translation.model, "fresh-model");
});

it("reuses a cached Persian translation that still satisfies the current integrity contract", async () => {
  let freshCalls = 0;

  const result = await resolveReusableOrFreshPersianNewsTranslation({
    reused: {
      title: "حجم به ۱٫۶ میلیارد دلار رسید",
      lead: "حجم معاملات افزایش یافت",
      body: "حجم معاملات افزایش یافت",
      sourceTitle: "Volume reached $1.6 billion",
      sourceLead: "Trading volume increased",
      sourceBody: "Trading volume increased",
      providerId: "openai",
      model: "cached-model",
      sourceCoverage: "feed_summary",
    },
    fresh: async () => {
      freshCalls += 1;
      return { ok: false as const, reason: "must_not_run" };
    },
  });

  assert.equal(freshCalls, 0);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.reused, true);
  assert.equal(result.ok && result.translation.model, "cached-model");
});


it("preserves a fresh translation failure after rejecting an invalid cached translation", async () => {
  let freshCalls = 0;

  const result = await resolveReusableOrFreshPersianNewsTranslation({
    reused: {
      title: "حجم به ۱٫۶ میلیون دلار رسید",
      lead: "حجم معاملات افزایش یافت",
      body: "حجم معاملات افزایش یافت",
      sourceTitle: "Volume reached $1.6 billion",
      sourceLead: "Trading volume increased",
      sourceBody: "Trading volume increased",
      providerId: "openai",
      model: "cached-model",
      sourceCoverage: "feed_summary",
    },
    fresh: async () => {
      freshCalls += 1;
      return {
        ok: false as const,
        reason: "translation_numeric_integrity_failed",
        providerId: "openai",
        model: "fresh-model",
      };
    },
  });

  assert.equal(freshCalls, 1);
  assert.deepEqual(result, {
    ok: false,
    reason: "translation_numeric_integrity_failed",
    providerId: "openai",
    model: "fresh-model",
  });
});

it("reports deterministic numeric integrity diagnostic kinds without changing rejection semantics", () => {
  const source = {
    sourceTitle: "Fund buys $131M of ETH",
    sourceLead: "Trading volume reached 42 million dollars.",
    sourceBody: "The report says 3 institutions participated.",
  };

  assert.deepEqual(validatePersianNewsTranslationIntegrity({
    ...source,
    translatedTitle: "صندوق اتریوم خرید",
    translatedLead: "حجم معاملات به ۴۲ میلیون دلار رسید.",
    translatedBody: "این گزارش می‌گوید ۳ نهاد مشارکت داشتند.",
  }), {
    ok: false,
    reason: "numeric_integrity_failed",
    numericFailureKind: "missing_title_fact",
    numericFailureFactKey: "131|unsigned|scalar|million|USD",
  });

  assert.deepEqual(validatePersianNewsTranslationIntegrity({
    ...source,
    translatedTitle: "صندوق ۱۳۱ میلیون دلار اتریوم خرید",
    translatedLead: "حجم معاملات افزایش یافت.",
    translatedBody: "این گزارش می‌گوید ۳ نهاد مشارکت داشتند.",
  }), {
    ok: false,
    reason: "numeric_integrity_failed",
    numericFailureKind: "missing_lead_fact",
    numericFailureFactKey: "42|unsigned|scalar|million|USD",
  });

  assert.deepEqual(validatePersianNewsTranslationIntegrity({
    ...source,
    translatedTitle: "صندوق ۱۳۱ میلیون دلار اتریوم خرید",
    translatedLead: "حجم معاملات به ۴۲ میلیون دلار رسید.",
    translatedBody: "این گزارش می‌گوید ۹ نهاد مشارکت داشتند.",
  }), {
    ok: false,
    reason: "numeric_integrity_failed",
    numericFailureKind: "invented_numeric_fact",
    numericFailureFactKey: "9|unsigned|scalar|-|-",
  });
});

it("propagates numeric diagnostics from rejected cached translations", async () => {
  let freshCalls = 0;

  const result = await resolveReusableOrFreshPersianNewsTranslation({
    reused: {
      title: "حجم به ۱٫۶ میلیون دلار رسید",
      lead: "حجم معاملات افزایش یافت",
      body: "حجم معاملات افزایش یافت",
      sourceTitle: "Volume reached $1.6 billion",
      sourceLead: "Trading volume increased",
      sourceBody: "Trading volume increased",
      providerId: "openai",
      model: "cached-model",
      sourceCoverage: "feed_summary",
    },
    fresh: async () => {
      freshCalls += 1;
      return {
        ok: false as const,
        reason: "translation_numeric_integrity_failed",
        providerId: "openai",
        model: "fresh-model",
        numericFailureKind: "missing_title_fact",
        numericFailureFactKey: "1.6|unsigned|scalar|billion|USD",
      };
    },
  });

  assert.equal(freshCalls, 1);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "translation_numeric_integrity_failed");
  assert.equal(!result.ok && result.numericFailureKind, "missing_title_fact");
  assert.equal(!result.ok && result.numericFailureFactKey, "1.6|unsigned|scalar|billion|USD");
});

it("does not treat HTML quote entities as numeric source facts", () => {
  assert.deepEqual(validatePersianNewsTranslationIntegrity({
    sourceTitle: "OpenClaw 2.0 Is Here",
    sourceLead: "The framework started the &#34;autonomous AI&#34; hype cycle.",
    sourceBody: "The framework started the &#34;autonomous AI&#34; hype cycle.",
    translatedTitle: "OpenClaw ۲٫۰ منتشر شد",
    translatedLead: "این چارچوب چرخه هیجان «هوش مصنوعی خودمختار» را آغاز کرد.",
    translatedBody: "این چارچوب چرخه هیجان «هوش مصنوعی خودمختار» را آغاز کرد.",
  }), { ok: true });
});

it("matches reporting-period quarter markers across English and Persian forms", () => {
  assert.deepEqual(validatePersianNewsTranslationIntegrity({
    sourceTitle: "XRP inflows continue",
    sourceLead: "Q2 filings show Goldman among the biggest holders.",
    sourceBody: "Q2 filings show Goldman among the biggest holders.",
    translatedTitle: "ورود سرمایه به XRP ادامه دارد",
    translatedLead: "پرونده‌های سه‌ماهه دوم نشان می‌دهد گلدمن در میان بزرگ‌ترین دارندگان است.",
    translatedBody: "پرونده‌های سه‌ماهه دوم نشان می‌دهد گلدمن در میان بزرگ‌ترین دارندگان است.",
  }), { ok: true });
});

it("repairs one invented numeric fact once and still fails closed if the repair remains invalid", async () => {
  const previousProvider = process.env.NEWS_TRANSLATION_PROVIDER;
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.NEWS_TRANSLATION_MODEL;

  process.env.NEWS_TRANSLATION_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "test-key";
  process.env.NEWS_TRANSLATION_MODEL = "gpt-test";

  try {
    let calls = 0;
    const repaired = await translateNewsFeedToPersian({
      title: "Fund buys $131M of ETH",
      lead: "Trading volume reached 42 million dollars.",
      body: "The report says 3 institutions participated.",
      sourceName: "Test Publisher",
      sourceUrl: "https://example.com/article",
      sourceCoverage: "feed_full",
    }, {
      fetchImpl: async () => {
        calls += 1;
        const text = calls === 1
          ? JSON.stringify({
              title: "صندوق ۱۳۱ میلیون دلار اتریوم خرید",
              lead: "حجم معاملات به ۴۲ میلیون دلار رسید.",
              body: "این گزارش می‌گوید ۹ نهاد مشارکت داشتند.",
            })
          : JSON.stringify({
              title: "صندوق ۱۳۱ میلیون دلار اتریوم خرید",
              lead: "حجم معاملات به ۴۲ میلیون دلار رسید.",
              body: "این گزارش می‌گوید ۳ نهاد مشارکت داشتند.",
            });

        return new Response(JSON.stringify({
          model: "gpt-test",
          output_text: text,
          usage: { input_tokens: 10, output_tokens: 10 },
        }), { status: 200 });
      },
    });

    assert.equal(calls, 2);
    assert.equal(repaired.ok, true);

    calls = 0;
    const stillInvalid = await translateNewsFeedToPersian({
      title: "Fund buys $131M of ETH",
      lead: "Trading volume reached 42 million dollars.",
      body: "The report says 3 institutions participated.",
      sourceName: "Test Publisher Invalid",
      sourceUrl: "https://example.com/article-2",
      sourceCoverage: "feed_full",
    }, {
      fetchImpl: async () => {
        calls += 1;
        const text = JSON.stringify({
          title: "صندوق ۱۳۱ میلیون دلار اتریوم خرید",
          lead: "حجم معاملات به ۴۲ میلیون دلار رسید.",
          body: calls === 1
            ? "این گزارش می‌گوید ۹ نهاد مشارکت داشتند."
            : "این گزارش می‌گوید ۸ نهاد مشارکت داشتند.",
        });

        return new Response(JSON.stringify({
          model: "gpt-test",
          output_text: text,
          usage: { input_tokens: 10, output_tokens: 10 },
        }), { status: 200 });
      },
    });

    assert.equal(calls, 2);
    assert.equal(stillInvalid.ok, false);
    assert.equal(!stillInvalid.ok && stillInvalid.reason, "translation_numeric_integrity_failed");
    assert.equal(!stillInvalid.ok && stillInvalid.numericFailureKind, "invented_numeric_fact");
  } finally {
    if (previousProvider === undefined) delete process.env.NEWS_TRANSLATION_PROVIDER;
    else process.env.NEWS_TRANSLATION_PROVIDER = previousProvider;

    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;

    if (previousModel === undefined) delete process.env.NEWS_TRANSLATION_MODEL;
    else process.env.NEWS_TRANSLATION_MODEL = previousModel;
  }
});

it("treats hyphenated numeric ranges as unsigned facts without weakening true negative-number integrity", () => {
  assert.deepEqual(validatePersianNewsTranslationIntegrity({
    sourceTitle: "Protocol roadmap update",
    sourceLead: "The roadmap covers the 2026-2027 period.",
    sourceBody: "The roadmap covers the 2026-2027 period.",
    translatedTitle: "به‌روزرسانی نقشه راه پروتکل",
    translatedLead: "نقشه راه دوره ۲۰۲۶ تا ۲۰۲۷ را پوشش می‌دهد.",
    translatedBody: "نقشه راه دوره ۲۰۲۶ تا ۲۰۲۷ را پوشش می‌دهد.",
  }), { ok: true });

  assert.deepEqual(validatePersianNewsTranslationIntegrity({
    sourceTitle: "Advisor crypto service timeline",
    sourceLead: "The service is targeted for mid-2027.",
    sourceBody: "The service is targeted for mid-2027.",
    translatedTitle: "زمان‌بندی سرویس رمزارزی مشاوران",
    translatedLead: "راه‌اندازی سرویس برای میانه سال ۲۰۲۷ هدف‌گذاری شده است.",
    translatedBody: "راه‌اندازی سرویس برای میانه سال ۲۰۲۷ هدف‌گذاری شده است.",
  }), { ok: true });

  assert.deepEqual(validatePersianNewsTranslationIntegrity({
    sourceTitle: "Agency freezes Premier League funds",
    sourceLead: "The agency froze £10,024,041.33 in the account.",
    sourceBody: "The agency froze £10,024,041.33 in the account.",
    translatedTitle: "مسدود شدن وجوه لیگ برتر توسط نهاد",
    translatedLead: "این نهاد ۱۰٬۰۲۴٬۰۴۱٫۳۳ پوند از وجوه حساب را مسدود کرد.",
    translatedBody: "این نهاد ۱۰٬۰۲۴٬۰۴۱٫۳۳ پوند از وجوه حساب را مسدود کرد.",
  }), { ok: true });

  const negative = validatePersianNewsTranslationIntegrity({
    sourceTitle: "Metric falls to -5%",
    sourceLead: "The metric fell to -5%.",
    sourceBody: "The metric fell to -5%.",
    translatedTitle: "شاخص به ۵ درصد رسید",
    translatedLead: "شاخص به ۵ درصد رسید.",
    translatedBody: "شاخص به ۵ درصد رسید.",
  });

  assert.equal(negative.ok, false);
  assert.equal(!negative.ok && negative.reason, "numeric_integrity_failed");
});

it("allows equivalent numeric magnitudes without weakening percent or currency integrity", () => {
  assert.deepEqual(validatePersianNewsTranslationIntegrity({
    sourceTitle: "Customer milestone",
    sourceLead: "The deal brought roughly 300,000 funded customers.",
    sourceBody: "The deal brought roughly 300,000 funded customers.",
    translatedTitle: "رشد تعداد مشتریان",
    translatedLead: "این معامله حدود ۳۰۰ هزار مشتری تأمین‌شده به همراه داشت.",
    translatedBody: "این معامله حدود ۳۰۰ هزار مشتری تأمین‌شده به همراه داشت.",
  }), { ok: true });

  const percentOmitted = validatePersianNewsTranslationIntegrity({
    sourceTitle: "Bitcoin monthly performance",
    sourceLead: "Bitcoin recorded a 37.29% rally.",
    sourceBody: "Bitcoin recorded a 37.29% rally.",
    translatedTitle: "عملکرد ماهانه بیت‌کوین",
    translatedLead: "بیت‌کوین رشد ۳۷٫۲۹ را ثبت کرد.",
    translatedBody: "بیت‌کوین رشد ۳۷٫۲۹ را ثبت کرد.",
  });
  assert.equal(percentOmitted.ok, false);
  assert.equal(!percentOmitted.ok && percentOmitted.reason, "numeric_integrity_failed");

  const currencyOmitted = validatePersianNewsTranslationIntegrity({
    sourceTitle: "Asset sale",
    sourceLead: "The assets sold for $4.47 million.",
    sourceBody: "The assets sold for $4.47 million.",
    translatedTitle: "فروش دارایی‌ها",
    translatedLead: "دارایی‌ها به مبلغ ۴٫۴۷ میلیون فروخته شدند.",
    translatedBody: "دارایی‌ها به مبلغ ۴٫۴۷ میلیون فروخته شدند.",
  });
  assert.equal(currencyOmitted.ok, false);
  assert.equal(!currencyOmitted.ok && currencyOmitted.reason, "numeric_integrity_failed");
});

it("ignores numeric HTML metadata while preserving visible article numbers", () => {
  const valid = validatePersianNewsTranslationIntegrity({
    sourceTitle: "Ledger policy update",
    sourceLead: "Ledger released an application update.",
    sourceBody:
      '<a href="https://example.test/issues/35665" onclick="seek(&apos;37:17&apos;)">Ledger Bitcoin app 2.5.0 adds human-readable policy descriptions</a>',
    translatedTitle: "به‌روزرسانی سیاست‌های لجر",
    translatedLead: "لجر یک به‌روزرسانی برای اپلیکیشن خود منتشر کرد.",
    translatedBody:
      "اپلیکیشن بیت‌کوین لجر نسخه ۲٫۵٫۰ توضیحات خوانا برای سیاست‌ها اضافه می‌کند.",
  });
  assert.equal(valid.ok, true);

  const metadataLeak = validatePersianNewsTranslationIntegrity({
    sourceTitle: "Ledger policy update",
    sourceLead: "Ledger released an application update.",
    sourceBody:
      '<a href="https://example.test/issues/35665" onclick="seek(&apos;37:17&apos;)">Ledger Bitcoin app 2.5.0 adds human-readable policy descriptions</a>',
    translatedTitle: "به‌روزرسانی سیاست‌های لجر",
    translatedLead: "لجر یک به‌روزرسانی برای اپلیکیشن خود منتشر کرد.",
    translatedBody:
      "اپلیکیشن بیت‌کوین لجر نسخه ۲٫۵٫۰ را منتشر کرد و عدد ۳۷ نیز گزارش شد.",
  });
  assert.equal(metadataLeak.ok, false);
  assert.equal(!metadataLeak.ok && metadataLeak.reason, "numeric_integrity_failed");
});

it("canonicalizes plus-marked magnitudes without weakening numeric integrity", () => {
  assert.deepEqual(validatePersianNewsTranslationIntegrity({
    sourceTitle: "More than $457+ Billion in crypto activity",
    sourceLead: "Potentially taxable activity exceeded $457+ billion.",
    sourceBody: "Potentially taxable activity exceeded $457+ billion.",
    translatedTitle: "بیش از ۴۵۷ میلیارد دلار فعالیت رمزارزی",
    translatedLead: "فعالیت بالقوه مشمول مالیات از ۴۵۷ میلیارد دلار فراتر رفت.",
    translatedBody: "فعالیت بالقوه مشمول مالیات از ۴۵۷ میلیارد دلار فراتر رفت.",
  }), { ok: true });
});

it("handles hyphenated magnitudes and euro cents without weakening currency integrity", () => {
  assert.deepEqual(validatePersianNewsTranslationIntegrity({
    sourceTitle: "Premier League partnership",
    sourceLead: "The company signed a four-year, $162-million partnership deal.",
    sourceBody: "The company signed a four-year, $162-million partnership deal.",
    translatedTitle: "قرارداد همکاری لیگ برتر",
    translatedLead: "این شرکت یک قرارداد همکاری چهار ساله به ارزش ۱۶۲ میلیون دلار امضا کرد.",
    translatedBody: "این شرکت یک قرارداد همکاری چهار ساله به ارزش ۱۶۲ میلیون دلار امضا کرد.",
  }), { ok: true });

  assert.deepEqual(validatePersianNewsTranslationIntegrity({
    sourceTitle: "Share issuance",
    sourceLead: "The firm issued shares at 58 euro cents per share.",
    sourceBody: "The firm issued shares at 58 euro cents per share.",
    translatedTitle: "انتشار سهام",
    translatedLead: "این شرکت سهام را با قیمت ۵۸ سنت یورو برای هر سهم منتشر کرد.",
    translatedBody: "این شرکت سهام را با قیمت ۵۸ سنت یورو برای هر سهم منتشر کرد.",
  }), { ok: true });

  const poundOmitted = validatePersianNewsTranslationIntegrity({
    sourceTitle: "Funds frozen",
    sourceLead: "The agency froze £10,024,041.33 in the account.",
    sourceBody: "The agency froze £10,024,041.33 in the account.",
    translatedTitle: "مسدود شدن وجوه",
    translatedLead: "این نهاد مبلغ ۱۰٬۰۲۴٬۰۴۱٫۳۳ را در حساب مسدود کرد.",
    translatedBody: "این نهاد مبلغ ۱۰٬۰۲۴٬۰۴۱٫۳۳ را در حساب مسدود کرد.",
  });
  assert.equal(poundOmitted.ok, false);
  assert.equal(!poundOmitted.ok && poundOmitted.reason, "numeric_integrity_failed");
});


it("supports shared magnitude and currency suffixes in translated ranges without allowing invented numbers", () => {
  const valid = validatePersianNewsTranslationIntegrity({
    sourceTitle: "Bitcoin ETF inflows hit $731M, highest since January as BTC reclaims $80K",
    sourceLead:
      "Bitcoin traded in a range between roughly $76,000 and $81,000 this week, with $83,000 emerging as a key threshold.",
    sourceBody:
      "Bitcoin traded in a range between roughly $76,000 and $81,000 this week, with $83,000 emerging as a key threshold.",
    translatedTitle: "ورودی ETF بیت‌کوین به ۷۳۱ میلیون دلار رسید؛ بالاترین سطح از ژانویه، همزمان با بازپس‌گیری ۸۰ هزار دلار",
    translatedLead:
      "بیت‌کوین این هفته در محدوده‌ای بین حدود ۷۶ تا ۸۱ هزار دلار معامله شد و سطح ۸۳ هزار دلار به‌عنوان یک آستانه کلیدی مطرح شد.",
    translatedBody:
      "بیت‌کوین این هفته در محدوده‌ای بین حدود ۷۶ تا ۸۱ هزار دلار معامله شد و سطح ۸۳ هزار دلار به‌عنوان یک آستانه کلیدی مطرح شد.",
  });

  assert.deepEqual(valid, { ok: true });

  const invented = validatePersianNewsTranslationIntegrity({
    sourceTitle: "Bitcoin ETF inflows hit $731M, highest since January as BTC reclaims $80K",
    sourceLead:
      "Bitcoin traded in a range between roughly $76,000 and $81,000 this week, with $83,000 emerging as a key threshold.",
    sourceBody:
      "Bitcoin traded in a range between roughly $76,000 and $81,000 this week, with $83,000 emerging as a key threshold.",
    translatedTitle: "ورودی ETF بیت‌کوین به ۷۳۱ میلیون دلار رسید؛ بالاترین سطح از ژانویه، همزمان با بازپس‌گیری ۸۰ هزار دلار",
    translatedLead:
      "بیت‌کوین این هفته در محدوده‌ای بین حدود ۷۶ تا ۸۱ هزار دلار معامله شد و سطح ۸۳ هزار دلار به‌عنوان یک آستانه کلیدی مطرح شد.",
    translatedBody:
      "بیت‌کوین این هفته در محدوده‌ای بین حدود ۷۶ تا ۸۱ هزار دلار معامله شد و عدد ۸۴ هزار دلار نیز مطرح شد.",
  });

  assert.equal(invented.ok, false);
  if (!invented.ok) {
    assert.equal(invented.numericFailureKind, "invented_numeric_fact");
  }
});

it("supports shared percent suffixes in translated ranges without weakening currency integrity", () => {
  assert.deepEqual(validatePersianNewsTranslationIntegrity({
    sourceTitle: "Holdings growth",
    sourceLead: "Holdings increased by 25% to 30%.",
    sourceBody: "Holdings increased by 25% to 30%.",
    translatedTitle: "رشد دارایی‌ها",
    translatedLead: "دارایی‌ها ۲۵ تا ۳۰ درصد افزایش یافت.",
    translatedBody: "دارایی‌ها ۲۵ تا ۳۰ درصد افزایش یافت.",
  }), { ok: true });

  const currencyOmitted = validatePersianNewsTranslationIntegrity({
    sourceTitle: "Tokenized loan",
    sourceLead: "The loan was worth $19,600.",
    sourceBody: "The loan was worth $19,600.",
    translatedTitle: "وام توکنیزه",
    translatedLead: "ارزش وام ۱۹٬۶۰۰ بود.",
    translatedBody: "ارزش وام ۱۹٬۶۰۰ بود.",
  });
  assert.equal(currencyOmitted.ok, false);
  assert.equal(!currencyOmitted.ok && currencyOmitted.reason, "numeric_integrity_failed");
});

it("preserves real-world title and lead numeric facts across targeted repair", async () => {
  const previousProvider = process.env.NEWS_TRANSLATION_PROVIDER;
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.NEWS_TRANSLATION_MODEL;

  process.env.NEWS_TRANSLATION_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "test-key";
  process.env.NEWS_TRANSLATION_MODEL = "gpt-test";

  try {
    const cases = [
      {
        title: "Australia is cracking down on crypto businesses as its strict new regulatory deadline nears",
        lead: "Firms that miss the deadline could breach financial services law from Oct. 1 and face civil or criminal penalties.",
        body: "Firms that miss the deadline could breach financial services law from Oct. 1 and face civil or criminal penalties.",
        bad: {
          title: "استرالیا مقررات کسب‌وکارهای رمزارزی را سخت‌تر می‌کند",
          lead: "شرکت‌هایی که مهلت را از دست بدهند ممکن است قوانین خدمات مالی را نقض کنند و با مجازات روبه‌رو شوند.",
          body: "شرکت‌هایی که مهلت را از دست بدهند ممکن است قوانین خدمات مالی را نقض کنند و با مجازات روبه‌رو شوند.",
        },
        good: {
          title: "استرالیا مقررات کسب‌وکارهای رمزارزی را سخت‌تر می‌کند",
          lead: "شرکت‌هایی که مهلت را از دست بدهند ممکن است از ۱ اکتبر قوانین خدمات مالی را نقض کنند و با مجازات روبه‌رو شوند.",
          body: "شرکت‌هایی که مهلت را از دست بدهند ممکن است از ۱ اکتبر قوانین خدمات مالی را نقض کنند و با مجازات روبه‌رو شوند.",
        },
      },
      {
        title: "Bitcoin withstands $90 oil and rising yields while gold slides. A firm dollar is the catch",
        lead: "BTC trades choppy as $90 oil and rising bond yields weigh on stocks and gold.",
        body: "BTC trades choppy as $90 oil and rising bond yields weigh on stocks and gold.",
        bad: {
          title: "بیت‌کوین در برابر نفت گران و رشد بازدهی مقاومت می‌کند",
          lead: "بیت‌کوین نوسانی معامله می‌شود و رشد بازدهی اوراق بر سهام و طلا فشار می‌آورد.",
          body: "بیت‌کوین نوسانی معامله می‌شود و رشد بازدهی اوراق بر سهام و طلا فشار می‌آورد.",
        },
        good: {
          title: "بیت‌کوین در برابر نفت ۹۰ دلاری و رشد بازدهی مقاومت می‌کند",
          lead: "بیت‌کوین در شرایط نفت ۹۰ دلاری و رشد بازدهی اوراق نوسانی معامله می‌شود.",
          body: "بیت‌کوین در شرایط نفت ۹۰ دلاری و رشد بازدهی اوراق نوسانی معامله می‌شود.",
        },
      },
      {
        title: "Capital B aims to add 376 BTC to bitcoin treasury following $8.8 million Adam Back investment",
        lead: "The firm issued shares and warrants according to a filing.",
        body: "The firm issued shares and warrants according to a filing.",
        bad: {
          title: "Capital B قصد دارد ۳۷۶ بیت‌کوین به خزانه خود اضافه کند",
          lead: "این شرکت طبق یک پرونده سهام و وارانت منتشر کرده است.",
          body: "این شرکت طبق یک پرونده سهام و وارانت منتشر کرده است.",
        },
        good: {
          title: "Capital B پس از سرمایه‌گذاری ۸٫۸ میلیون دلاری Adam Back قصد دارد ۳۷۶ بیت‌کوین به خزانه اضافه کند",
          lead: "این شرکت طبق یک پرونده سهام و وارانت منتشر کرده است.",
          body: "این شرکت طبق یک پرونده سهام و وارانت منتشر کرده است.",
        },
      },
      {
        title: "Revolut Starts EURR Rollout With Bridge as Regulated Issuer",
        lead: "Revolut opens EURR to selected customers; Bridge reported €374 outstanding.",
        body: "Revolut opens EURR to selected customers; Bridge reported €374 outstanding.",
        bad: {
          title: "رولوت عرضه EURR را آغاز می‌کند",
          lead: "رولوت EURR را برای برخی مشتریان باز کرده و Bridge موجودی در گردش را گزارش کرده است.",
          body: "رولوت EURR را برای برخی مشتریان باز کرده و Bridge موجودی در گردش را گزارش کرده است.",
        },
        good: {
          title: "رولوت عرضه EURR را آغاز می‌کند",
          lead: "رولوت EURR را برای برخی مشتریان باز کرده و Bridge رقم ۳۷۴ یورو موجودی را گزارش کرده است.",
          body: "رولوت EURR را برای برخی مشتریان باز کرده و Bridge رقم ۳۷۴ یورو موجودی را گزارش کرده است.",
        },
      },
    ];

    for (const [index, item] of cases.entries()) {
      let calls = 0;
      const result = await translateNewsFeedToPersian({
        title: item.title,
        lead: item.lead,
        body: item.body,
        sourceName: `Targeted Repair Test ${index + 1}`,
        sourceUrl: `https://example.com/targeted-repair-${index + 1}`,
        sourceCoverage: "feed_full",
      }, {
        fetchImpl: async () => {
          calls += 1;
          const text = JSON.stringify(calls === 1 ? item.bad : item.good);
          return new Response(JSON.stringify({
            model: "gpt-test",
            output_text: text,
            usage: { input_tokens: 10, output_tokens: 10 },
          }), { status: 200 });
        },
      });

      assert.equal(calls, 2, `targeted repair case ${index + 1} should use exactly two provider calls`);
      assert.equal(
        result.ok,
        true,
        `targeted repair case ${index + 1} failed: ${JSON.stringify(result)}`,
      );
    }
  } finally {
    if (previousProvider === undefined) delete process.env.NEWS_TRANSLATION_PROVIDER;
    else process.env.NEWS_TRANSLATION_PROVIDER = previousProvider;

    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;

    if (previousModel === undefined) delete process.env.NEWS_TRANSLATION_MODEL;
    else process.env.NEWS_TRANSLATION_MODEL = previousModel;
  }
});
