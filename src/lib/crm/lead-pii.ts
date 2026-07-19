import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

export type LeadPii = {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  note?: string;
};

export type EncryptedLeadPii = {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: number;
};

function decodeEncryptionKey(): Buffer {
  const encoded = process.env.TECPEY_CRM_PII_KEY_B64?.trim();
  if (!encoded) throw new Error("crm_pii_key_unavailable");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("crm_pii_key_invalid");
  return key;
}

function contactHashSecret(): string {
  const secret = process.env.TECPEY_CRM_CONTACT_HASH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("crm_contact_hash_secret_unavailable");
  return secret;
}

export function normalizeLeadPhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0098")) digits = digits.slice(2);
  if (digits.startsWith("98") && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+98${digits.slice(1)}`;
  return `+${digits}`;
}

export function normalizeLeadEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function hashLeadValue(value: string): string {
  return createHmac("sha256", contactHashSecret()).update(value).digest("hex");
}

export function leadContactHash(phone: string, email?: string): string {
  return hashLeadValue(`${normalizeLeadPhone(phone)}\u0000${normalizeLeadEmail(email)}`);
}

export function encryptLeadPii(
  value: LeadPii,
  context: { tenantId: string; leadId: string },
): EncryptedLeadPii {
  const key = decodeEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`${context.tenantId}:${context.leadId}:v1`, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  key.fill(0);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    keyVersion: 1,
  };
}

export function decryptLeadPii(
  value: EncryptedLeadPii,
  context: { tenantId: string; leadId: string },
): LeadPii {
  if (value.keyVersion !== 1) throw new Error("crm_pii_key_version_unsupported");
  const key = decodeEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64"));
  decipher.setAAD(Buffer.from(`${context.tenantId}:${context.leadId}:v1`, "utf8"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]);
  key.fill(0);
  return JSON.parse(plaintext.toString("utf8")) as LeadPii;
}
