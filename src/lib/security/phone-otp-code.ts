import {
  createHmac,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

const OTP_CODE = /^\d{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT = /^[0-9a-f]{64}$/;
const PURPOSES = new Set(["signup", "login", "profile_verify"]);

type OtpBinding = {
  challengeId: string;
  phoneFingerprint: string;
  purpose: string;
  code: string;
};

function codeMacKey(): Buffer {
  const encoded = process.env.TECPEY_PHONE_OTP_ENCRYPTION_KEY_B64?.trim();
  if (encoded) {
    const key = Buffer.from(encoded, "base64");
    if (key.length === 32) {
      return createHmac("sha256", key)
        .update("tecpey:phone-otp-code-mac:v1", "utf8")
        .digest();
    }
  }
  if (process.env.NODE_ENV !== "production") {
    return createHmac("sha256", "tecpey-local-phone-otp-code-key-v1")
      .update("development-only", "utf8")
      .digest();
  }
  throw new Error("phone_otp_code_key_unavailable");
}

function validateBinding(input: OtpBinding): void {
  if (
    !UUID.test(input.challengeId) ||
    !FINGERPRINT.test(input.phoneFingerprint) ||
    !PURPOSES.has(input.purpose) ||
    !OTP_CODE.test(input.code)
  ) {
    throw new Error("phone_otp_code_binding_invalid");
  }
}

export function generatePhoneOtpCode(
  randomInteger: (maximum: number) => number = (maximum) => randomInt(maximum),
): string {
  const value = randomInteger(1_000_000);
  if (!Number.isSafeInteger(value) || value < 0 || value >= 1_000_000) {
    throw new Error("phone_otp_code_random_invalid");
  }
  return value.toString().padStart(6, "0");
}

export function phoneOtpCodeDigest(input: OtpBinding): string {
  validateBinding(input);
  return createHmac("sha256", codeMacKey())
    .update(
      [
        "tecpey:phone-otp-code:v1",
        input.challengeId.toLowerCase(),
        input.phoneFingerprint,
        input.purpose,
        input.code,
      ].join(":"),
      "utf8",
    )
    .digest("hex");
}

export function verifyPhoneOtpCode(
  input: OtpBinding & { expectedDigest: string },
): boolean {
  if (!FINGERPRINT.test(input.expectedDigest)) return false;
  let observed: Buffer;
  try {
    observed = Buffer.from(phoneOtpCodeDigest(input), "hex");
  } catch {
    return false;
  }
  const expected = Buffer.from(input.expectedDigest, "hex");
  return expected.length === observed.length && timingSafeEqual(expected, observed);
}
