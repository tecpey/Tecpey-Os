import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { minimizeCommunityJournalPublicText } from "../../lib/community-journal-authority";

describe("Community journal public text minimization", () => {
  it("redacts direct identifiers, contact links and wallet addresses without dropping the lesson", () => {
    const email = "learner@example.com";
    const phone = "+989121234567";
    const ethereum = "0x52908400098527886E0F7030069857D2E4169EE7";
    const bitcoin = "1BoatSLRHtKNngkdXEeobR76b53LETtpyT";
    const telegram = "https://t.me/private_group";
    const handle = "@privategroup";
    const output = minimizeCommunityJournalPublicText(
      `درس من این بود؛ تماس ${email} یا ${phone}، کیف‌ها ${ethereum} ${bitcoin} و ${telegram} ${handle}`,
      1_200,
    );

    for (const forbidden of [email, phone, ethereum, bitcoin, telegram, handle]) {
      assert.equal(output.includes(forbidden), false);
    }
    assert.match(output, /درس من این بود/);
    assert.match(output, /ایمیل حذف شد/);
    assert.match(output, /شماره تماس حذف شد/);
    assert.match(output, /آدرس کیف‌پول حذف شد/);
    assert.match(output, /لینک یا شناسه ارتباطی حذف شد/);
  });

  it("removes token and private-key material", () => {
    const jwt = "eyJabcdefghijk.abcdefghijkl.abcdefghijkl";
    const apiKey = "sk-proj-ABCDEFGHIJKLMNOPQRSTUV123456";
    const privateKey = "a".repeat(64);
    const output = minimizeCommunityJournalPublicText(
      `آموختم اطلاعات را به اشتراک نگذارم ${jwt} ${apiKey} ${privateKey}`,
      1_200,
    );

    for (const forbidden of [jwt, apiKey, privateKey]) {
      assert.equal(output.includes(forbidden), false);
    }
    assert.match(output, /توکن حذف شد/);
    assert.match(output, /کلید حذف شد/);
    assert.match(output, /کلید خصوصی حذف شد/);
  });

  it("suppresses the complete public field when a secret label is present, including zero-width obfuscation", () => {
    const output = minimizeCommunityJournalPublicText(
      "p\u200Bassword: NeverPublishThisValue",
      1_200,
    );
    assert.equal(output, "[متن حساس از نمایش عمومی حذف شد]");
    assert.equal(output.includes("NeverPublishThisValue"), false);
  });

  it("fails closed on explicit signals, guaranteed-return claims and recruitment", () => {
    for (const unsafe of [
      "الان بخر و سود تضمینی بگیر",
      "سیگنال خرید قطعی",
      "buy now for guaranteed profit",
      "join my channel for entries",
    ]) {
      assert.equal(
        minimizeCommunityJournalPublicText(unsafe, 1_200),
        "[متن به‌دلیل سیاست ایمنی جامعه نمایش داده نشد]",
      );
    }
  });

  it("redacts phone numbers without mistaking ordinary dates for contact data", () => {
    const output = minimizeCommunityJournalPublicText(
      "در تاریخ 2026-07-21 برنامه را مرور کردم و شماره 09121234567 را حذف کردم",
      1_200,
    );
    assert.match(output, /2026-07-21/);
    assert.equal(output.includes("09121234567"), false);
    assert.match(output, /شماره تماس حذف شد/);
  });

  it("normalizes and bounds ordinary educational text", () => {
    const output = minimizeCommunityJournalPublicText(`  ${"درس مفید ".repeat(400)}  `, 80);
    assert.equal(output.length <= 80, true);
    assert.equal(output.startsWith("درس مفید"), true);
    assert.equal(output.includes("  "), false);
  });
});
