import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { minimizeCommunityJournalPublicText } from "../../lib/community-journal-authority";

describe("Community journal public-text minimization", () => {
  it("redacts direct identifiers and wallet addresses", () => {
    const eth = `0x${"a".repeat(40)}`;
    const output = minimizeCommunityJournalPublicText(
      `تماس: trader@example.com یا +989121234567 و کیف پول ${eth}`,
      1_200,
    );

    assert.equal(output.includes("trader@example.com"), false);
    assert.equal(output.includes("+989121234567"), false);
    assert.equal(output.includes(eth), false);
    assert.match(output, /ایمیل حذف شد/);
    assert.match(output, /شماره تماس حذف شد/);
    assert.match(output, /آدرس کیف‌پول حذف شد/);
  });

  it("fails closed on labeled authentication secrets", () => {
    const output = minimizeCommunityJournalPublicText(
      "درس امروز: password: ExtremelySensitiveValue123",
      1_200,
    );
    assert.equal(output, "[متن حساس از نمایش عمومی حذف شد]");
  });

  it("redacts tokens and private-key-shaped values", () => {
    const jwt = `eyJ${"a".repeat(16)}.${"b".repeat(16)}.${"c".repeat(16)}`;
    const privateKey = "f".repeat(64);
    const output = minimizeCommunityJournalPublicText(
      `token ${jwt} and key ${privateKey}`,
      1_200,
    );
    assert.equal(output.includes(jwt), false);
    assert.equal(output.includes(privateKey), false);
    assert.match(output, /توکن حذف شد/);
    assert.match(output, /کلید خصوصی حذف شد/);
  });

  it("normalizes control and zero-width characters before bounded output", () => {
    const output = minimizeCommunityJournalPublicText(
      `  برنامه\u200B من\u0000 منظم است ${"x".repeat(100)}`,
      24,
    );
    assert.equal(output.includes("\u200B"), false);
    assert.equal(output.includes("\u0000"), false);
    assert.equal(output.length <= 24, true);
    assert.equal(output.startsWith("برنامه من منظم است"), true);
  });
});
