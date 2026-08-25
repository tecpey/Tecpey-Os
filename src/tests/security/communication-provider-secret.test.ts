import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  decryptCommunicationProviderSecret,
  encryptCommunicationProviderSecret,
  providerSecretFingerprint,
} from "../../lib/security/communication-provider-secret";

const originalKey = process.env.TECPEY_PROVIDER_SECRET_ENCRYPTION_KEY_B64;

afterEach(() => {
  if (originalKey === undefined) delete process.env.TECPEY_PROVIDER_SECRET_ENCRYPTION_KEY_B64;
  else process.env.TECPEY_PROVIDER_SECRET_ENCRYPTION_KEY_B64 = originalKey;
});

describe("communication provider secret boundary", () => {
  it("encrypts provider credentials with scoped authenticated encryption", () => {
    process.env.TECPEY_PROVIDER_SECRET_ENCRYPTION_KEY_B64 = Buffer.alloc(32, 11).toString("base64");
    const secret = "limoo-provider-secret-value";
    const scope = "tecpey:main:limoo_sms";
    const encrypted = encryptCommunicationProviderSecret(secret, scope);
    assert.equal(encrypted.includes(secret), false);
    assert.equal(decryptCommunicationProviderSecret(encrypted, scope), secret);
    assert.throws(
      () => decryptCommunicationProviderSecret(encrypted, "tecpey:main:resend"),
      /authenticate|provider_secret_ciphertext_invalid/i,
    );
  });

  it("emits only a short irreversible fingerprint for admin display", () => {
    const fingerprint = providerSecretFingerprint("resend-api-key-example");
    assert.match(fingerprint, /^[0-9a-f]{12}$/);
    assert.equal(fingerprint.includes("resend"), false);
  });

  it("rejects malformed secrets and scopes", () => {
    process.env.TECPEY_PROVIDER_SECRET_ENCRYPTION_KEY_B64 = Buffer.alloc(32, 12).toString("base64");
    assert.throws(() => encryptCommunicationProviderSecret("short", "tecpey:main:limoo_sms"));
    assert.throws(() => encryptCommunicationProviderSecret("valid-secret", "bad scope with spaces"));
  });
});
