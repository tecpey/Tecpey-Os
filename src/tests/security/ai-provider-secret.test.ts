import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  aiProviderSecretFingerprint,
  decryptAiProviderSecret,
  encryptAiProviderSecret,
} from "../../lib/security/ai-provider-secret";

const originalKey = process.env.TECPEY_PROVIDER_SECRET_ENCRYPTION_KEY_B64;

afterEach(() => {
  if (originalKey === undefined) delete process.env.TECPEY_PROVIDER_SECRET_ENCRYPTION_KEY_B64;
  else process.env.TECPEY_PROVIDER_SECRET_ENCRYPTION_KEY_B64 = originalKey;
});

describe("AI provider credential boundary", () => {
  it("binds AES-GCM ciphertext to tenant, workspace and provider", () => {
    process.env.TECPEY_PROVIDER_SECRET_ENCRYPTION_KEY_B64 = Buffer.alloc(32, 23).toString("base64");
    const secret = "provider-secret-value-for-test";
    const scope = "tenant-a:main:openai";
    const ciphertext = encryptAiProviderSecret(secret, scope);
    assert.equal(ciphertext.includes(secret), false);
    assert.equal(decryptAiProviderSecret(ciphertext, scope), secret);
    assert.throws(
      () => decryptAiProviderSecret(ciphertext, "tenant-b:main:openai"),
      /authenticate|ai_provider_secret_ciphertext_invalid/i,
    );
    assert.throws(
      () => decryptAiProviderSecret(ciphertext, "tenant-a:main:xai"),
      /authenticate|ai_provider_secret_ciphertext_invalid/i,
    );
  });

  it("returns only a short irreversible display fingerprint", () => {
    const fingerprint = aiProviderSecretFingerprint("sk-example-never-return-this");
    assert.match(fingerprint, /^[0-9a-f]{12}$/);
    assert.equal(fingerprint.includes("example"), false);
  });
});
