const CEREMONY_CHALLENGE_PREFIX = "tecpey:webauthn:ceremony:";
const CEREMONY_CHALLENGE_TTL_SECONDS = 300;

const CONSUME_ONCE_LUA = `
local value = redis.call('GET', KEYS[1])
if value then
  redis.call('DEL', KEYS[1])
end
return value
`;

export type WebAuthnCeremony = "registration" | "authentication";

export type WebAuthnChallengeEnvelope = {
  version: 1;
  ceremony: WebAuthnCeremony;
  userId: string | null;
  issuedAt: number;
};

function redisClient() {
  return globalThis.tecpeyRedisClient ?? null;
}

function challengeKey(challenge: string): string {
  return `${CEREMONY_CHALLENGE_PREFIX}${challenge}`;
}

function validSubject(userId: unknown): userId is string | null {
  return userId === null || (
    typeof userId === "string" &&
    userId.length > 0 &&
    userId.length <= 200
  );
}

export function parseWebAuthnChallengeEnvelope(raw: unknown): WebAuthnChallengeEnvelope | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2_000) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<WebAuthnChallengeEnvelope>;
    if (parsed.version !== 1) return null;
    if (parsed.ceremony !== "registration" && parsed.ceremony !== "authentication") return null;
    if (!validSubject(parsed.userId)) return null;
    if (!Number.isInteger(parsed.issuedAt) || (parsed.issuedAt ?? 0) <= 0) return null;

    return {
      version: 1,
      ceremony: parsed.ceremony,
      userId: parsed.userId,
      issuedAt: parsed.issuedAt,
    };
  } catch {
    return null;
  }
}

export function extractWebAuthnClientChallenge(
  clientDataJSON: unknown,
  expectedType: "webauthn.create" | "webauthn.get",
): string | null {
  if (typeof clientDataJSON !== "string" || clientDataJSON.length === 0) return null;

  try {
    const raw = Buffer.from(clientDataJSON, "base64url");
    if (raw.length === 0 || raw.length > 16_384) return null;
    const parsed = JSON.parse(raw.toString("utf8")) as { type?: unknown; challenge?: unknown };
    if (parsed.type !== expectedType) return null;
    if (typeof parsed.challenge !== "string" || parsed.challenge.length < 32 || parsed.challenge.length > 512) {
      return null;
    }
    return parsed.challenge;
  } catch {
    return null;
  }
}

export async function storeWebAuthnCeremonyChallenge(input: {
  challenge: string;
  ceremony: WebAuthnCeremony;
  userId: string | null;
}): Promise<void> {
  if (!/^[A-Za-z0-9_-]{32,512}$/.test(input.challenge)) {
    throw new Error("invalid_webauthn_challenge");
  }
  if (!validSubject(input.userId)) {
    throw new Error("invalid_webauthn_subject");
  }

  const redis = redisClient();
  if (!redis) throw new Error("webauthn_requires_redis");

  const envelope: WebAuthnChallengeEnvelope = {
    version: 1,
    ceremony: input.ceremony,
    userId: input.userId,
    issuedAt: Date.now(),
  };

  const stored = await redis.set(
    challengeKey(input.challenge),
    JSON.stringify(envelope),
    "EX",
    CEREMONY_CHALLENGE_TTL_SECONDS,
    "NX",
  );

  if (stored !== "OK") throw new Error("webauthn_challenge_collision");
}

export async function consumeWebAuthnCeremonyChallenge(
  challenge: string,
  expectedCeremony: WebAuthnCeremony,
): Promise<WebAuthnChallengeEnvelope | null> {
  if (!/^[A-Za-z0-9_-]{32,512}$/.test(challenge)) return null;

  const redis = redisClient();
  if (!redis) return null;

  const raw = await redis.eval(
    CONSUME_ONCE_LUA,
    1,
    challengeKey(challenge),
  );

  const envelope = parseWebAuthnChallengeEnvelope(raw);
  if (!envelope || envelope.ceremony !== expectedCeremony) return null;
  return envelope;
}
