import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  consumeWebAuthnCeremonyChallenge,
  extractWebAuthnClientChallenge,
  parseWebAuthnChallengeEnvelope,
  storeWebAuthnCeremonyChallenge,
} from "@/lib/security/webauthn-ceremony";

class FakeRedis {
  private readonly values = new Map<string, string>();

  async set(
    key: string,
    value: string,
    _expiryMode: string,
    _ttl: number,
    _setMode: string,
  ): Promise<"OK" | null> {
    if (this.values.has(key)) return null;
    this.values.set(key, value);
    return "OK";
  }

  async eval(_script: string, keyCount: number, key: string): Promise<string | null> {
    assert.equal(keyCount, 1);
    const value = this.values.get(key) ?? null;
    this.values.delete(key);
    return value;
  }
}

const originalRedis = Reflect.get(globalThis, "tecpeyRedisClient");

afterEach(() => {
  Reflect.set(globalThis, "tecpeyRedisClient", originalRedis ?? null);
});

function useFakeRedis(): void {
  Reflect.set(globalThis, "tecpeyRedisClient", new FakeRedis());
}

describe("WebAuthn ceremony envelope", () => {
  it("parses only versioned, typed and bounded envelopes", () => {
    const valid = JSON.stringify({
      version: 1,
      ceremony: "authentication",
      userId: null,
      issuedAt: 1_725_000_000_000,
    });

    assert.deepEqual(parseWebAuthnChallengeEnvelope(valid), {
      version: 1,
      ceremony: "authentication",
      userId: null,
      issuedAt: 1_725_000_000_000,
    });
    assert.equal(parseWebAuthnChallengeEnvelope("not-json"), null);
    assert.equal(parseWebAuthnChallengeEnvelope(JSON.stringify({
      version: 1,
      ceremony: "registration",
      userId: "",
      issuedAt: Date.now(),
    })), null);
    assert.equal(parseWebAuthnChallengeEnvelope(JSON.stringify({
      version: 2,
      ceremony: "authentication",
      userId: "user-1",
      issuedAt: Date.now(),
    })), null);
  });

  it("extracts only the expected WebAuthn client-data type", () => {
    const challenge = "A".repeat(43);
    const createPayload = Buffer.from(JSON.stringify({
      type: "webauthn.create",
      challenge,
      origin: "https://tecpey.ir",
    })).toString("base64url");

    assert.equal(
      extractWebAuthnClientChallenge(createPayload, "webauthn.create"),
      challenge,
    );
    assert.equal(
      extractWebAuthnClientChallenge(createPayload, "webauthn.get"),
      null,
    );
    assert.equal(extractWebAuthnClientChallenge("invalid", "webauthn.create"), null);
  });
});

describe("WebAuthn ceremony challenge consumption", () => {
  it("allows exactly one consumer under concurrent verification", async () => {
    useFakeRedis();
    const challenge = "B".repeat(43);

    await storeWebAuthnCeremonyChallenge({
      challenge,
      ceremony: "authentication",
      userId: null,
    });

    const results = await Promise.all([
      consumeWebAuthnCeremonyChallenge(challenge, "authentication"),
      consumeWebAuthnCeremonyChallenge(challenge, "authentication"),
    ]);

    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(results.filter((result) => result === null).length, 1);
  });

  it("burns a challenge when the wrong ceremony attempts to consume it", async () => {
    useFakeRedis();
    const challenge = "C".repeat(43);

    await storeWebAuthnCeremonyChallenge({
      challenge,
      ceremony: "registration",
      userId: "user-1",
    });

    assert.equal(
      await consumeWebAuthnCeremonyChallenge(challenge, "authentication"),
      null,
    );
    assert.equal(
      await consumeWebAuthnCeremonyChallenge(challenge, "registration"),
      null,
    );
  });

  it("rejects duplicate challenge insertion instead of overwriting identity", async () => {
    useFakeRedis();
    const challenge = "D".repeat(43);

    await storeWebAuthnCeremonyChallenge({
      challenge,
      ceremony: "authentication",
      userId: "user-1",
    });

    await assert.rejects(
      storeWebAuthnCeremonyChallenge({
        challenge,
        ceremony: "authentication",
        userId: "user-2",
      }),
      /webauthn_challenge_collision/,
    );
  });
});
