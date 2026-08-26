import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  generatePhoneOtpCode,
  phoneOtpCodeDigest,
  verifyPhoneOtpCode,
} from "../../lib/security/phone-otp-code";

const originalNodeEnv = process.env.NODE_ENV;
const originalEncryptionKey = process.env.TECPEY_PHONE_OTP_ENCRYPTION_KEY_B64;
const mutableEnvironment = process.env as Record<string, string | undefined>;

afterEach(() => {
  if (originalNodeEnv === undefined) delete mutableEnvironment.NODE_ENV;
  else mutableEnvironment.NODE_ENV = originalNodeEnv;
  if (originalEncryptionKey === undefined) delete process.env.TECPEY_PHONE_OTP_ENCRYPTION_KEY_B64;
  else process.env.TECPEY_PHONE_OTP_ENCRYPTION_KEY_B64 = originalEncryptionKey;
});

const binding = {
  challengeId: "123e4567-e89b-42d3-a456-426614174000",
  phoneFingerprint: "a".repeat(64),
  purpose: "login",
  code: "004219",
};

describe("phone OTP local verifier", () => {
  it("generates an exactly six-digit code from a CSPRNG value", () => {
    assert.equal(generatePhoneOtpCode(() => 0), "000000");
    assert.equal(generatePhoneOtpCode(() => 999_999), "999999");
    assert.throws(() => generatePhoneOtpCode(() => 1_000_000), /phone_otp_code_random_invalid/);
  });

  it("binds the digest to challenge, phone, purpose and code", () => {
    process.env.TECPEY_PHONE_OTP_ENCRYPTION_KEY_B64 = Buffer.alloc(32, 17).toString("base64");
    const digest = phoneOtpCodeDigest(binding);
    assert.match(digest, /^[0-9a-f]{64}$/);
    assert.equal(verifyPhoneOtpCode({ ...binding, expectedDigest: digest }), true);
    assert.equal(verifyPhoneOtpCode({ ...binding, code: "004218", expectedDigest: digest }), false);
    assert.notEqual(
      phoneOtpCodeDigest({ ...binding, phoneFingerprint: "b".repeat(64) }),
      digest,
    );
    assert.notEqual(
      phoneOtpCodeDigest({ ...binding, purpose: "signup" }),
      digest,
    );
  });

  it("fails closed in production when the HMAC key is absent or malformed", () => {
    mutableEnvironment.NODE_ENV = "production";
    delete process.env.TECPEY_PHONE_OTP_ENCRYPTION_KEY_B64;
    assert.throws(() => phoneOtpCodeDigest(binding), /phone_otp_code_key_unavailable/);
    assert.throws(
      () => verifyPhoneOtpCode({ ...binding, expectedDigest: "a".repeat(64) }),
      /phone_otp_code_key_unavailable/,
    );
    process.env.TECPEY_PHONE_OTP_ENCRYPTION_KEY_B64 = "not-a-32-byte-key";
    assert.throws(() => phoneOtpCodeDigest(binding), /phone_otp_code_key_unavailable/);
  });
});
