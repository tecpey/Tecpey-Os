import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validatePersianNewsEditorialQuality } from "../../lib/ai/news-editorial-quality";
import { repairMissingNewsTickers } from "../../lib/ai/news-ticker-repair";
import type { PersianNewsTranslation } from "../../lib/news-translation";

const source = {
  sourceTitle: "BitMEX faces Celsius lawsuit ahead of exchange closure",
  sourceLead: "The Celsius estate alleges BitMEX wrongfully liquidated and seized 6,360 BTC, worth nearly $490 million, during the March 2020 market crash.",
  sourceBody: "The estate alleges BitMEX liquidated 6,360 BTC worth nearly $490 million during the March 2020 market crash.",
  sourceName: "Cointelegraph",
  sourceUrl: "https://cointelegraph.com/example",
};

const missingTickerTranslation: PersianNewsTranslation = {
  title: "بیت‌مکس پیش از توقف فعالیت با شکایت سلسیوس روبه‌رو شد",
  lead: "دارایی سلسیوس مدعی است بیت‌مکس در سقوط بازار مارس ۲۰۲۰ تعداد ۶٬۳۶۰ بیت‌کوین به ارزش نزدیک به ۴۹۰ میلیون دلار را به‌اشتباه لیکویید و ضبط کرده است.",
  body: "این دارایی مدعی است بیت‌مکس در سقوط بازار مارس ۲۰۲۰ تعداد ۶٬۳۶۰ بیت‌کوین به ارزش نزدیک به ۴۹۰ میلیون دلار را لیکویید کرده است.",
  providerId: "openai",
  model: "gpt-test",
  sourceCoverage: "feed_full",
  quality: { persian: true, numericIntegrity: true, noAddedAdvice: true },
};

function openAiResponse(value: unknown): Response {
  return new Response(JSON.stringify({
    model: "gpt-test",
    output_text: JSON.stringify(value),
    usage: { input_tokens: 10, output_tokens: 10 },
  }), { status: 200 });
}

describe("news ticker integrity repair", () => {
  it("repairs the real 6,360 BTC omission and passes the final editorial authority", async () => {
    const before = validatePersianNewsEditorialQuality({
      ...source,
      translatedTitle: missingTickerTranslation.title,
      translatedLead: missingTickerTranslation.lead,
      translatedBody: missingTickerTranslation.body,
    });
    assert.equal(before.ok, false);
    if (before.ok) return;
    assert.equal(before.reason, "ticker_integrity_failed");
    assert.deepEqual(before.evidence.missingTickers, ["BTC"]);

    let calls = 0;
    const repaired = await repairMissingNewsTickers({
      ...source,
      missingTickers: ["BTC"],
      translation: missingTickerTranslation,
    }, {
      providerConfig: { providerId: "openai", apiKey: "test-key", model: "gpt-test" },
      fetchImpl: async () => {
        calls += 1;
        return openAiResponse({
          title: missingTickerTranslation.title,
          lead: "دارایی سلسیوس مدعی است بیت‌مکس در سقوط بازار مارس ۲۰۲۰ تعداد ۶٬۳۶۰ بیت‌کوین (BTC) به ارزش نزدیک به ۴۹۰ میلیون دلار را به‌اشتباه لیکویید و ضبط کرده است.",
          body: "این دارایی مدعی است بیت‌مکس در سقوط بازار مارس ۲۰۲۰ تعداد ۶٬۳۶۰ بیت‌کوین (BTC) به ارزش نزدیک به ۴۹۰ میلیون دلار را لیکویید کرده است.",
        });
      },
    });

    assert.equal(calls, 1);
    assert.equal(repaired.ok, true);
    if (!repaired.ok) return;
    assert.match(repaired.translation.lead, /\bBTC\b/);
    const after = validatePersianNewsEditorialQuality({
      ...source,
      translatedTitle: repaired.translation.title,
      translatedLead: repaired.translation.lead,
      translatedBody: repaired.translation.body,
    });
    assert.equal(after.ok, true);
  });

  it("fails closed when the repair invents an unsupported ticker", async () => {
    const repaired = await repairMissingNewsTickers({
      ...source,
      missingTickers: ["BTC"],
      translation: missingTickerTranslation,
    }, {
      providerConfig: { providerId: "openai", apiKey: "test-key", model: "gpt-test" },
      fetchImpl: async () => openAiResponse({
        title: missingTickerTranslation.title,
        lead: "دارایی سلسیوس مدعی است بیت‌مکس در سقوط بازار مارس ۲۰۲۰ تعداد ۶٬۳۶۰ بیت‌کوین (BTC) و ETH به ارزش نزدیک به ۴۹۰ میلیون دلار را ضبط کرده است.",
        body: "این دارایی مدعی است بیت‌مکس در سقوط بازار مارس ۲۰۲۰ تعداد ۶٬۳۶۰ بیت‌کوین (BTC) و ETH به ارزش نزدیک به ۴۹۰ میلیون دلار را لیکویید کرده است.",
      }),
    });

    assert.equal(repaired.ok, false);
    assert.equal(!repaired.ok && repaired.reason, "ticker_repair_editorial_unsupported_latin_entity");
  });

  it("fails closed when ticker repair changes a grounded numeric fact", async () => {
    const repaired = await repairMissingNewsTickers({
      ...source,
      missingTickers: ["BTC"],
      translation: missingTickerTranslation,
    }, {
      providerConfig: { providerId: "openai", apiKey: "test-key", model: "gpt-test" },
      fetchImpl: async () => openAiResponse({
        title: missingTickerTranslation.title,
        lead: "دارایی سلسیوس مدعی است بیت‌مکس در سقوط بازار مارس ۲۰۲۰ تعداد ۶٬۳۶۱ بیت‌کوین (BTC) به ارزش نزدیک به ۴۹۰ میلیون دلار را ضبط کرده است.",
        body: "این دارایی مدعی است بیت‌مکس در سقوط بازار مارس ۲۰۲۰ تعداد ۶٬۳۶۱ بیت‌کوین (BTC) به ارزش نزدیک به ۴۹۰ میلیون دلار را لیکویید کرده است.",
      }),
    });

    assert.equal(repaired.ok, false);
    assert.equal(!repaired.ok && repaired.reason, "ticker_repair_translation_numeric_integrity_failed");
  });
});
