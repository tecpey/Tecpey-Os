import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  decryptPhone,
  encryptPhone,
  maskIranianMobile,
  normalizeIranianMobile,
  phoneFingerprint,
  providerMobileFromE164,
} from "../../lib/security/phone-identity";

const originalHashSecret = process.env.TECPEY_PHONE_IDENTITY_HASH_SECRET;
const originalEncryptionKey = process.env.TECPEY_PHONE_OTP_ENCRYPTION_KEY_B64;

afterEach(() => {
  if (originalHashSecret === undefined) delete process.env.TECPEY_PHONE_IDENTITY_HASH_SECRET;
  else process.env.TECPEY_PHONE_IDENTITY_HASH_SECRET = originalHashSecret;
  if (originalEncryptionKey === undefined) delete process.env.TECPEY_PHONE_OTP_ENCRYPTION_KEY_B64;
  else process.env.TECPEY_PHONE_OTP_ENCRYPTION_KEY_B64 = originalEncryptionKey;
});

describe("phone identity boundary", () => {
  it("normalizes Iranian mobile formats and localized digits", () => {
    assert.equal(normalizeIranianMobile("0912 345 6789"), "+989123456789");
    assert.equal(normalizeIranianMobile("+98 912-345-6789"), "+989123456789");
    assert.equal(normalizeIranianMobile("۹۱۲۳۴۵۶۷۸۹"), "+989123456789");
    assert.equal(normalizeIranianMobile("00989123456789"), "+989123456789");
    assert.equal(normalizeIranianMobile("02112345678"), null);
  });

  it("encrypts challenge PII and produces stable non-plain fingerprints", () => {
    process.env.TECPEY_PHONE_IDENTITY_HASH_SECRET = "h".repeat(32);
    process.env.TECPEY_PHONE_OTP_ENCRYPTION_KEY_B64 = Buffer.alloc(32, 7).toString("base64");
    const phone = "+989123456789";
    const encrypted = encryptPhone(phone);
    assert.equal(encrypted.includes(phone), false);
    assert.equal(decryptPhone(encrypted), phone);
    const fingerprint = phoneFingerprint(phone);
    assert.match(fingerprint, /^[0-9a-f]{64}$/);
    assert.equal(fingerprint.includes("9123456789"), false);
  });

  it("converts only validated numbers for Limoo and masks UI output", () => {
    assert.equal(providerMobileFromE164("+989123456789"), "09123456789");
    assert.equal(maskIranianMobile("+989123456789"), "+98912•••789");
    assert.throws(() => providerMobileFromE164("+12025550123"), /invalid_iranian_mobile/);
  });
});
