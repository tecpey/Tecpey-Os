import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { verifyAdminBootstrapToken } from "@/lib/admin-passkey-service";
import {
  consumeAdminWebAuthnChallenge,
  generateAdminWebAuthnChallenge,
  storeAdminWebAuthnChallenge,
  verifyAdminWebAuthnAuthentication,
  verifyAdminWebAuthnRegistration,
} from "@/lib/security/admin-webauthn";

type StoredValue = { value: string };

class FakeRedis {
  private readonly values = new Map<string, StoredValue>();

  async set(
    key: string,
    value: string,
    _expiryMode: string,
    _ttl: number,
    setMode: string,
  ): Promise<"OK" | null> {
    assert.equal(setMode, "NX");
    if (this.values.has(key)) return null;
    this.values.set(key, { value });
    return "OK";
  }

  async eval(_script: string, keyCount: number, key: string): Promise<string | null> {
    assert.equal(keyCount, 1);
    const stored = this.values.get(key)?.value ?? null;
    this.values.delete(key);
    return stored;
  }
}

const originalRedis = Reflect.get(globalThis, "tecpeyRedisClient");
const originalAdminToken = process.env.TECPEY_ADMIN_TOKEN;

afterEach(() => {
  Reflect.set(globalThis, "tecpeyRedisClient", originalRedis ?? null);
  if (originalAdminToken === undefined) delete process.env.TECPEY_ADMIN_TOKEN;
  else process.env.TECPEY_ADMIN_TOKEN = originalAdminToken;
});

function useFakeRedis(): void {
  Reflect.set(globalThis, "tecpeyRedisClient", new FakeRedis());
}

describe("admin WebAuthn challenge security", () => {
  it("generates URL-safe challenges with sufficient entropy", () => {
    const first = generateAdminWebAuthnChallenge();
    const second = generateAdminWebAuthnChallenge();

    assert.match(first, /^[A-Za-z0-9_-]{43}$/);
    assert.match(second, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(first, second);
  });

  it("allows exactly one consumer under concurrent verification", async () => {
    useFakeRedis();
    const challenge = generateAdminWebAuthnChallenge();
    const adminId = "11111111-1111-4111-8111-111111111111";

    await storeAdminWebAuthnChallenge({
      challenge,
      ceremony: "bootstrap-registration",
      adminId,
    });

    const results = await Promise.all([
      consumeAdminWebAuthnChallenge(challenge, "bootstrap-registration"),
      consumeAdminWebAuthnChallenge(challenge, "bootstrap-registration"),
    ]);

    assert.equal(results.filter(Boolean).length, 1);
    assert.deepEqual(results.find(Boolean), {
      version: 1,
      ceremony: "bootstrap-registration",
      adminId,
      issuedAt: results.find(Boolean)?.issuedAt,
    });
  });

  it("burns a challenge when the wrong ceremony attempts to consume it", async () => {
    useFakeRedis();
    const challenge = generateAdminWebAuthnChallenge();

    await storeAdminWebAuthnChallenge({
      challenge,
      ceremony: "authentication",
      adminId: null,
    });

    assert.equal(
      await consumeAdminWebAuthnChallenge(challenge, "bootstrap-registration"),
      null,
    );
    assert.equal(
      await consumeAdminWebAuthnChallenge(challenge, "authentication"),
      null,
    );
  });

  it("rejects challenge overwrite with a different administrator", async () => {
    useFakeRedis();
    const challenge = generateAdminWebAuthnChallenge();

    await storeAdminWebAuthnChallenge({
      challenge,
      ceremony: "bootstrap-registration",
      adminId: "11111111-1111-4111-8111-111111111111",
    });

    await assert.rejects(
      storeAdminWebAuthnChallenge({
        challenge,
        ceremony: "bootstrap-registration",
        adminId: "22222222-2222-4222-8222-222222222222",
      }),
      /admin_webauthn_challenge_collision/,
    );
  });
});

describe("admin WebAuthn verification fails closed", () => {
  it("rejects malformed registration client data before parsing attestation", () => {
    const result = verifyAdminWebAuthnRegistration({
      expectedChallenge: generateAdminWebAuthnChallenge(),
      response: {
        id: "invalid",
        rawId: "invalid",
        type: "public-key",
        response: {
          clientDataJSON: "not-base64-json",
          attestationObject: "invalid",
        },
      },
    });

    assert.deepEqual(result, { ok: false, reason: "invalid_client_data" });
  });

  it("rejects malformed authentication before signature verification", () => {
    const result = verifyAdminWebAuthnAuthentication({
      expectedChallenge: generateAdminWebAuthnChallenge(),
      response: {
        id: "invalid",
        rawId: "invalid",
        type: "public-key",
        response: {
          clientDataJSON: "not-base64-json",
          authenticatorData: "invalid",
          signature: "invalid",
        },
      },
      publicKey: Buffer.alloc(0),
      storedCounter: 0,
    });

    assert.deepEqual(result, { ok: false, reason: "invalid_client_data" });
  });
});

describe("admin bootstrap token", () => {
  it("accepts only an exact timing-safe token match", () => {
    process.env.TECPEY_ADMIN_TOKEN = "admin-bootstrap-token-with-at-least-24-characters";

    const accepted = new NextRequest("https://tecpey.ir/api/command-center/auth/bootstrap/challenge", {
      method: "POST",
      headers: {
        "x-tecpey-admin-token": "admin-bootstrap-token-with-at-least-24-characters",
      },
    });
    const rejected = new NextRequest("https://tecpey.ir/api/command-center/auth/bootstrap/challenge", {
      method: "POST",
      headers: {
        "x-tecpey-admin-token": "admin-bootstrap-token-with-at-least-24-characterX",
      },
    });

    assert.equal(verifyAdminBootstrapToken(accepted), true);
    assert.equal(verifyAdminBootstrapToken(rejected), false);
  });

  it("fails closed when the bootstrap token is missing or too short", () => {
    process.env.TECPEY_ADMIN_TOKEN = "too-short";
    const request = new NextRequest("https://tecpey.ir/api/command-center/auth/bootstrap/challenge", {
      method: "POST",
      headers: { "x-tecpey-admin-token": "too-short" },
    });

    assert.equal(verifyAdminBootstrapToken(request), false);
    delete process.env.TECPEY_ADMIN_TOKEN;
    assert.equal(verifyAdminBootstrapToken(request), false);
  });
});
