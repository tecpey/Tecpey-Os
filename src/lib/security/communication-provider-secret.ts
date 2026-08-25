import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

function encryptionKey(): Buffer {
  const encoded = process.env.TECPEY_PROVIDER_SECRET_ENCRYPTION_KEY_B64?.trim();
  if (encoded) {
    const key = Buffer.from(encoded, "base64");
    if (key.length === 32) return key;
  }
  if (process.env.NODE_ENV !== "production") {
    return createHmac("sha256", "tecpey-local-provider-secret-key-v1")
      .update("development-only")
      .digest();
  }
  throw new Error("provider_secret_encryption_key_unavailable");
}

function aad(scope: string): Buffer {
  if (!/^[a-zA-Z0-9:_-]{3,300}$/.test(scope)) throw new Error("provider_secret_scope_invalid");
  return Buffer.from(`tecpey:communication-provider:v1:${scope}`, "utf8");
}

export function providerSecretFingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

export function encryptCommunicationProviderSecret(secret: string, scope: string): string {
  if (secret.length < 8 || secret.length > 2_048) throw new Error("provider_secret_invalid");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(aad(scope));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptCommunicationProviderSecret(document: string, scope: string): string {
  const [version, ivText, tagText, encryptedText] = document.split(".");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) {
    throw new Error("provider_secret_ciphertext_invalid");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAAD(aad(scope));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const secret = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  if (secret.length < 8 || secret.length > 2_048) throw new Error("provider_secret_ciphertext_invalid");
  return secret;
}
