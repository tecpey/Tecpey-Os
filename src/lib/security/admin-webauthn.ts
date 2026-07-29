import {
  createHash,
  createVerify,
  randomBytes,
  timingSafeEqual,
} from "crypto";

const ADMIN_CHALLENGE_PREFIX = "tecpey:admin-webauthn:challenge:";
const ADMIN_CHALLENGE_TTL_SECONDS = 300;
const MAX_CBOR_BYTES = 65_536;

const CONSUME_ONCE_LUA = `
local value = redis.call('GET', KEYS[1])
if value then
  redis.call('DEL', KEYS[1])
end
return value
`;

export type AdminWebAuthnCeremony =
  | "bootstrap-registration"
  | "authentication";

export type AdminWebAuthnChallenge = {
  version: 1;
  ceremony: AdminWebAuthnCeremony;
  adminId: string | null;
  issuedAt: number;
};

export type AdminRegistrationResponse = {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string;
    attestationObject: string;
  };
  transports?: string[];
};

export type AdminAuthenticationResponse = {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
};

export type AdminRegistrationVerification =
  | {
      ok: true;
      credentialId: string;
      publicKey: Buffer;
      counter: number;
      aaguid: string;
      transports: string[];
      deviceType: "single_device" | "multi_device";
      backedUp: boolean;
    }
  | { ok: false; reason: string };

export type AdminAuthenticationVerification =
  | { ok: true; counter: number; backedUp: boolean }
  | { ok: false; reason: string };

function redisClient() {
  return globalThis.tecpeyRedisClient ?? null;
}

export function getAdminWebAuthnRpConfig(): {
  rpId: string;
  rpName: string;
  origins: string[];
} {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const customRpId = process.env.WEBAUTHN_RP_ID;

  if (customRpId) {
    const origins = (process.env.WEBAUTHN_ORIGINS ?? siteUrl)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    return { rpId: customRpId, rpName: "TecPey Admin", origins };
  }

  try {
    const url = new URL(siteUrl);
    return {
      rpId: url.hostname,
      rpName: "TecPey Admin",
      origins: [url.origin],
    };
  } catch {
    return {
      rpId: "localhost",
      rpName: "TecPey Admin",
      origins: ["http://localhost:3000"],
    };
  }
}

export function generateAdminWebAuthnChallenge(): string {
  return randomBytes(32).toString("base64url");
}

function validAdminId(adminId: unknown): adminId is string | null {
  return adminId === null || (
    typeof adminId === "string" &&
    /^[0-9a-f-]{36}$/i.test(adminId)
  );
}

function parseChallengeEnvelope(raw: unknown): AdminWebAuthnChallenge | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2_000) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AdminWebAuthnChallenge>;
    const issuedAt = parsed.issuedAt;
    if (parsed.version !== 1) return null;
    if (
      parsed.ceremony !== "bootstrap-registration" &&
      parsed.ceremony !== "authentication"
    ) return null;
    if (!validAdminId(parsed.adminId)) return null;
    if (typeof issuedAt !== "number" || !Number.isInteger(issuedAt) || issuedAt <= 0) {
      return null;
    }

    return {
      version: 1,
      ceremony: parsed.ceremony,
      adminId: parsed.adminId,
      issuedAt,
    };
  } catch {
    return null;
  }
}

export async function storeAdminWebAuthnChallenge(input: {
  challenge: string;
  ceremony: AdminWebAuthnCeremony;
  adminId: string | null;
}): Promise<void> {
  if (!/^[A-Za-z0-9_-]{32,512}$/.test(input.challenge)) {
    throw new Error("invalid_admin_webauthn_challenge");
  }
  if (!validAdminId(input.adminId)) {
    throw new Error("invalid_admin_webauthn_subject");
  }

  const redis = redisClient();
  if (!redis) throw new Error("admin_webauthn_requires_redis");

  const envelope: AdminWebAuthnChallenge = {
    version: 1,
    ceremony: input.ceremony,
    adminId: input.adminId,
    issuedAt: Date.now(),
  };

  const stored = await redis.set(
    `${ADMIN_CHALLENGE_PREFIX}${input.challenge}`,
    JSON.stringify(envelope),
    "EX",
    ADMIN_CHALLENGE_TTL_SECONDS,
    "NX",
  );

  if (stored !== "OK") throw new Error("admin_webauthn_challenge_collision");
}

export async function consumeAdminWebAuthnChallenge(
  challenge: string,
  expectedCeremony: AdminWebAuthnCeremony,
): Promise<AdminWebAuthnChallenge | null> {
  if (!/^[A-Za-z0-9_-]{32,512}$/.test(challenge)) return null;
  const redis = redisClient();
  if (!redis) return null;

  const raw = await redis.eval(
    CONSUME_ONCE_LUA,
    1,
    `${ADMIN_CHALLENGE_PREFIX}${challenge}`,
  );
  const envelope = parseChallengeEnvelope(raw);
  if (!envelope || envelope.ceremony !== expectedCeremony) return null;
  return envelope;
}

class CborReader {
  private offset = 0;

  constructor(private readonly buffer: Buffer) {
    if (buffer.length === 0 || buffer.length > MAX_CBOR_BYTES) {
      throw new Error("invalid_cbor_size");
    }
  }

  get position(): number {
    return this.offset;
  }

  private ensure(length: number): void {
    if (length < 0 || this.offset + length > this.buffer.length) {
      throw new Error("cbor_out_of_bounds");
    }
  }

  private readLength(additionalInfo: number): number {
    if (additionalInfo < 24) return additionalInfo;
    if (additionalInfo === 24) {
      this.ensure(1);
      return this.buffer[this.offset++];
    }
    if (additionalInfo === 25) {
      this.ensure(2);
      const value = this.buffer.readUInt16BE(this.offset);
      this.offset += 2;
      return value;
    }
    if (additionalInfo === 26) {
      this.ensure(4);
      const value = this.buffer.readUInt32BE(this.offset);
      this.offset += 4;
      return value;
    }
    throw new Error("unsupported_cbor_length");
  }

  readItem(depth = 0): unknown {
    if (depth > 8) throw new Error("cbor_depth_exceeded");
    this.ensure(1);
    const initial = this.buffer[this.offset++];
    const majorType = initial >> 5;
    const additionalInfo = initial & 0x1f;

    if (majorType === 0) return this.readLength(additionalInfo);
    if (majorType === 1) return -1 - this.readLength(additionalInfo);

    if (majorType === 2 || majorType === 3) {
      const length = this.readLength(additionalInfo);
      if (length > MAX_CBOR_BYTES) throw new Error("cbor_item_too_large");
      this.ensure(length);
      const value = this.buffer.subarray(this.offset, this.offset + length);
      this.offset += length;
      return majorType === 2 ? Buffer.from(value) : value.toString("utf8");
    }

    if (majorType === 4) {
      const length = this.readLength(additionalInfo);
      if (length > 64) throw new Error("cbor_array_too_large");
      const output: unknown[] = [];
      for (let index = 0; index < length; index++) {
        output.push(this.readItem(depth + 1));
      }
      return output;
    }

    if (majorType === 5) {
      const length = this.readLength(additionalInfo);
      if (length > 64) throw new Error("cbor_map_too_large");
      const output = new Map<unknown, unknown>();
      for (let index = 0; index < length; index++) {
        output.set(this.readItem(depth + 1), this.readItem(depth + 1));
      }
      return output;
    }

    if (majorType === 7) {
      if (additionalInfo === 20) return false;
      if (additionalInfo === 21) return true;
      if (additionalInfo === 22) return null;
    }

    throw new Error("unsupported_cbor_type");
  }
}

type ParsedAuthenticatorData = {
  rpIdHash: Buffer;
  flags: {
    up: boolean;
    uv: boolean;
    be: boolean;
    bs: boolean;
    at: boolean;
  };
  signCount: number;
  aaguid?: Buffer;
  credentialId?: Buffer;
  credentialPublicKey?: Buffer;
};

function parseAuthenticatorData(buffer: Buffer): ParsedAuthenticatorData | null {
  if (buffer.length < 37) return null;

  const flagsByte = buffer[32];
  const parsed: ParsedAuthenticatorData = {
    rpIdHash: buffer.subarray(0, 32),
    flags: {
      up: Boolean(flagsByte & 0x01),
      uv: Boolean(flagsByte & 0x04),
      be: Boolean(flagsByte & 0x08),
      bs: Boolean(flagsByte & 0x10),
      at: Boolean(flagsByte & 0x40),
    },
    signCount: buffer.readUInt32BE(33),
  };

  if (!parsed.flags.at) return parsed;
  if (buffer.length < 55) return null;

  let offset = 37;
  parsed.aaguid = Buffer.from(buffer.subarray(offset, offset + 16));
  offset += 16;
  const credentialIdLength = buffer.readUInt16BE(offset);
  offset += 2;
  if (credentialIdLength <= 0 || offset + credentialIdLength >= buffer.length) return null;
  parsed.credentialId = Buffer.from(buffer.subarray(offset, offset + credentialIdLength));
  offset += credentialIdLength;

  try {
    const publicKeyBytes = buffer.subarray(offset);
    const reader = new CborReader(publicKeyBytes);
    const key = reader.readItem();
    if (!(key instanceof Map) || reader.position <= 0) return null;
    parsed.credentialPublicKey = Buffer.from(publicKeyBytes.subarray(0, reader.position));
  } catch {
    return null;
  }

  return parsed;
}

const P256_SPKI_PREFIX = Buffer.from(
  "3059301306072a8648ce3d020106082a8648ce3d03010703420004",
  "hex",
);

function coseEs256ToSpki(coseBytes: Buffer): Buffer | null {
  try {
    const reader = new CborReader(coseBytes);
    const map = reader.readItem();
    if (!(map instanceof Map)) return null;
    if (map.get(1) !== 2 || map.get(3) !== -7 || map.get(-1) !== 1) return null;
    const x = map.get(-2);
    const y = map.get(-3);
    if (!(x instanceof Buffer) || !(y instanceof Buffer)) return null;
    if (x.length !== 32 || y.length !== 32) return null;
    return Buffer.concat([P256_SPKI_PREFIX, x, y]);
  } catch {
    return null;
  }
}

function parseAttestationAuthData(attestationObject: Buffer): Buffer | null {
  try {
    const reader = new CborReader(attestationObject);
    const top = reader.readItem();
    if (!(top instanceof Map)) return null;
    const authData = top.get("authData");
    return authData instanceof Buffer ? authData : null;
  } catch {
    return null;
  }
}

function decodeClientData(input: {
  encoded: string;
  expectedType: "webauthn.create" | "webauthn.get";
  expectedChallenge: string;
  allowedOrigins: string[];
}): { raw: Buffer } | null {
  try {
    const raw = Buffer.from(input.encoded, "base64url");
    if (raw.length === 0 || raw.length > 16_384) return null;
    const parsed = JSON.parse(raw.toString("utf8")) as {
      type?: unknown;
      challenge?: unknown;
      origin?: unknown;
    };
    if (parsed.type !== input.expectedType) return null;
    if (parsed.challenge !== input.expectedChallenge) return null;
    if (typeof parsed.origin !== "string" || !input.allowedOrigins.includes(parsed.origin)) {
      return null;
    }
    return { raw };
  } catch {
    return null;
  }
}

function validRpIdHash(actual: Buffer, rpId: string): boolean {
  const expected = createHash("sha256").update(rpId).digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function verifyEs256Signature(input: {
  publicKeyCose: Buffer;
  authenticatorData: Buffer;
  clientDataRaw: Buffer;
  signature: Buffer;
}): boolean {
  const spki = coseEs256ToSpki(input.publicKeyCose);
  if (!spki) return false;

  try {
    const clientDataHash = createHash("sha256").update(input.clientDataRaw).digest();
    const verifier = createVerify("SHA256");
    verifier.update(Buffer.concat([input.authenticatorData, clientDataHash]));
    return verifier.verify({ key: spki, format: "der", type: "spki" }, input.signature);
  } catch {
    return false;
  }
}

function sanitizeTransports(transports: unknown): string[] {
  if (!Array.isArray(transports)) return [];
  const allowed = new Set(["usb", "nfc", "ble", "internal", "hybrid"]);
  return [...new Set(
    transports.filter((value): value is string => typeof value === "string" && allowed.has(value)),
  )];
}

export function verifyAdminWebAuthnRegistration(input: {
  expectedChallenge: string;
  response: AdminRegistrationResponse;
}): AdminRegistrationVerification {
  const rp = getAdminWebAuthnRpConfig();
  const clientData = decodeClientData({
    encoded: input.response?.response?.clientDataJSON,
    expectedType: "webauthn.create",
    expectedChallenge: input.expectedChallenge,
    allowedOrigins: rp.origins,
  });
  if (!clientData) return { ok: false, reason: "invalid_client_data" };

  let attestationObject: Buffer;
  let rawId: Buffer;
  try {
    attestationObject = Buffer.from(input.response.response.attestationObject, "base64url");
    rawId = Buffer.from(input.response.rawId, "base64url");
  } catch {
    return { ok: false, reason: "invalid_registration_encoding" };
  }

  const authDataBuffer = parseAttestationAuthData(attestationObject);
  if (!authDataBuffer) return { ok: false, reason: "invalid_attestation_object" };
  const authData = parseAuthenticatorData(authDataBuffer);
  if (!authData || !authData.flags.at) return { ok: false, reason: "invalid_authenticator_data" };
  if (!validRpIdHash(authData.rpIdHash, rp.rpId)) return { ok: false, reason: "rp_id_mismatch" };
  if (!authData.flags.up) return { ok: false, reason: "user_not_present" };
  if (!authData.flags.uv) return { ok: false, reason: "user_not_verified" };
  if (!authData.credentialId || !authData.credentialPublicKey) {
    return { ok: false, reason: "credential_data_missing" };
  }
  if (
    rawId.length !== authData.credentialId.length ||
    !timingSafeEqual(rawId, authData.credentialId)
  ) {
    return { ok: false, reason: "credential_id_mismatch" };
  }
  if (!coseEs256ToSpki(authData.credentialPublicKey)) {
    return { ok: false, reason: "unsupported_key_algorithm" };
  }

  return {
    ok: true,
    credentialId: authData.credentialId.toString("base64url"),
    publicKey: authData.credentialPublicKey,
    counter: authData.signCount,
    aaguid: authData.aaguid?.toString("hex") ?? "",
    transports: sanitizeTransports(input.response.transports),
    deviceType: authData.flags.be ? "multi_device" : "single_device",
    backedUp: authData.flags.bs,
  };
}

export function verifyAdminWebAuthnAuthentication(input: {
  expectedChallenge: string;
  response: AdminAuthenticationResponse;
  publicKey: Buffer;
  storedCounter: number;
}): AdminAuthenticationVerification {
  const rp = getAdminWebAuthnRpConfig();
  const clientData = decodeClientData({
    encoded: input.response?.response?.clientDataJSON,
    expectedType: "webauthn.get",
    expectedChallenge: input.expectedChallenge,
    allowedOrigins: rp.origins,
  });
  if (!clientData) return { ok: false, reason: "invalid_client_data" };

  let authenticatorData: Buffer;
  let signature: Buffer;
  try {
    authenticatorData = Buffer.from(input.response.response.authenticatorData, "base64url");
    signature = Buffer.from(input.response.response.signature, "base64url");
  } catch {
    return { ok: false, reason: "invalid_authentication_encoding" };
  }

  const parsed = parseAuthenticatorData(authenticatorData);
  if (!parsed) return { ok: false, reason: "invalid_authenticator_data" };
  if (!validRpIdHash(parsed.rpIdHash, rp.rpId)) return { ok: false, reason: "rp_id_mismatch" };
  if (!parsed.flags.up) return { ok: false, reason: "user_not_present" };
  if (!parsed.flags.uv) return { ok: false, reason: "user_not_verified" };
  if (input.storedCounter > 0 && parsed.signCount <= input.storedCounter) {
    return { ok: false, reason: "counter_rollback" };
  }
  if (!verifyEs256Signature({
    publicKeyCose: input.publicKey,
    authenticatorData,
    clientDataRaw: clientData.raw,
    signature,
  })) {
    return { ok: false, reason: "signature_invalid" };
  }

  return {
    ok: true,
    counter: parsed.signCount,
    backedUp: parsed.flags.bs,
  };
}
