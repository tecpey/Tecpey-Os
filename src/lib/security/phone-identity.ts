import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

const IRAN_MOBILE = /^\+989\d{9}$/;

function latinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

export function normalizeIranianMobile(value: unknown): string | null {
  let digits = latinDigits(String(value ?? "")).replace(/[^0-9+]/g, "");
  if (digits.startsWith("0098")) digits = `+98${digits.slice(4)}`;
  else if (digits.startsWith("98")) digits = `+${digits}`;
  else if (digits.startsWith("09")) digits = `+98${digits.slice(1)}`;
  else if (digits.startsWith("9")) digits = `+98${digits}`;
  if (!IRAN_MOBILE.test(digits)) return null;
  return digits;
}

export function providerMobileFromE164(phoneE164: string): string {
  if (!IRAN_MOBILE.test(phoneE164)) throw new Error("invalid_iranian_mobile");
  return `0${phoneE164.slice(3)}`;
}

function hashSecret(): string {
  const secret = process.env.TECPEY_PHONE_IDENTITY_HASH_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "production") return "tecpey-local-phone-identity-hash-secret-v1";
  throw new Error("phone_identity_hash_secret_unavailable");
}

function encryptionKey(): Buffer {
  const encoded = process.env.TECPEY_PHONE_OTP_ENCRYPTION_KEY_B64?.trim();
  if (encoded) {
    const key = Buffer.from(encoded, "base64");
    if (key.length === 32) return key;
  }
  if (process.env.NODE_ENV !== "production") {
    return createHmac("sha256", "tecpey-local-phone-otp-encryption-v1")
      .update("development-only")
      .digest();
  }
  throw new Error("phone_otp_encryption_key_unavailable");
}

export function phoneFingerprint(phoneE164: string): string {
  if (!IRAN_MOBILE.test(phoneE164)) throw new Error("invalid_iranian_mobile");
  return createHmac("sha256", hashSecret()).update(phoneE164).digest("hex");
}

export function encryptPhone(phoneE164: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(phoneE164, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptPhone(document: string): string {
  const [version, ivText, tagText, encryptedText] = document.split(".");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) {
    throw new Error("phone_ciphertext_invalid");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const phone = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  if (!IRAN_MOBILE.test(phone)) throw new Error("phone_ciphertext_invalid");
  return phone;
}

export function maskIranianMobile(phoneE164: string): string {
  if (!IRAN_MOBILE.test(phoneE164)) return "••••";
  return `${phoneE164.slice(0, 6)}•••${phoneE164.slice(-3)}`;
}
