import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validatePersianNewsEditorialQuality } from "../../lib/news-editorial-quality";

describe("Persian news editorial quality authority", () => {
  it("accepts grounded Persian copy with preserved brands and ticker", () => {
    const result = validatePersianNewsEditorialQuality({
      sourceTitle: "Bank issues USDC on Stellar network",
      sourceLead: "The bank is testing USDC transfers on Stellar while XLM trades near $0.18.",
      sourceBody: "The pilot covers minting, transfers, redemption and asset returns using USDC on Stellar. XLM traded near $0.18.",
      translatedTitle: "بانک، USDC را روی شبکه Stellar عرضه کرد",
      translatedLead: "این بانک انتقال USDC روی Stellar را آزمایش می‌کند و XLM نزدیک ۰.۱۸ دلار معامله می‌شود.",
      translatedBody: "این طرح آزمایشی شامل صدور، انتقال و بازخرید USDC روی Stellar است و XLM نزدیک ۰.۱۸ دلار معامله شد.",
    });
    assert.equal(result.ok, true);
  });

  it("rejects a hallucinated or mutated Latin entity such as USBDC", () => {
    const result = validatePersianNewsEditorialQuality({
      sourceTitle: "Bank issues USDC on Stellar network",
      sourceLead: "The pilot uses USDC on Stellar.",
      sourceBody: "USDC transfers are being tested on Stellar.",
      translatedTitle: "بانک USBDC را روی شبکه Stellar عرضه کرد",
      translatedLead: "این طرح از USDC روی Stellar استفاده می‌کند.",
      translatedBody: "انتقال USDC روی Stellar آزمایش می‌شود.",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "unsupported_latin_entity");
    assert.deepEqual(result.evidence.unsupportedLatinEntities, ["usbdc"]);
  });

  it("rejects dropping a source crypto ticker", () => {
    const result = validatePersianNewsEditorialQuality({
      sourceTitle: "XLM falls 3% during Stellar pilot",
      sourceLead: "XLM traded at $0.18 after the announcement.",
      sourceBody: "XLM was the market ticker cited by the publisher.",
      translatedTitle: "قیمت دارایی در جریان طرح Stellar سه درصد افت کرد",
      translatedLead: "این دارایی پس از اعلام خبر در محدوده ۰.۱۸ دلار معامله شد.",
      translatedBody: "ناشر به نماد بازار این دارایی اشاره کرده است.",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "ticker_integrity_failed");
    assert.deepEqual(result.evidence.missingTickers, ["XLM"]);
  });

  it("requires Persian editorial content in both title and lead", () => {
    const result = validatePersianNewsEditorialQuality({
      sourceTitle: "Nasdaq invests in Payward",
      sourceLead: "Nasdaq Ventures agreed to invest in Payward.",
      sourceBody: "Payward is the parent company of Kraken.",
      translatedTitle: "Nasdaq invests in Payward",
      translatedLead: "Nasdaq Ventures در Payward سرمایه‌گذاری می‌کند.",
      translatedBody: "Payward شرکت مادر Kraken است.",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "persian_field_quality_failed");
    assert.equal(result.evidence.field, "title");
  });

  it("fails closed on excessively long generated mobile headlines", () => {
    const result = validatePersianNewsEditorialQuality({
      sourceTitle: "Bitcoin outlook",
      sourceLead: "Analysts discussed the market outlook.",
      sourceBody: "The publisher discussed the outlook without adding a price target.",
      translatedTitle: `چشم‌انداز بیت‌کوین ${"و ادامه توضیح غیرضروری ".repeat(14)}`,
      translatedLead: "تحلیلگران درباره چشم‌انداز بازار گفت‌وگو کردند.",
      translatedBody: "ناشر درباره چشم‌انداز بازار صحبت کرده و هدف قیمتی تازه‌ای مطرح نکرده است.",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "title_density_failed");
    assert.ok((result.evidence.titleChars ?? 0) > 220);
  });
});
