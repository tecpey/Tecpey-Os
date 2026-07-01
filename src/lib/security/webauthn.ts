// WebAuthn / FIDO2 server-side implementation — Phase 36.
// Zero new dependencies: uses Node.js crypto module only.
//
// Supports: ES256 (P-256 ECDSA) — covers 99%+ of real authenticators
//   (iPhone passkeys, Android passkeys, YubiKey, Windows Hello, Chrome on Mac).
//
// References:
//   - Web Authentication Level 2: https://www.w3.org/TR/webauthn-2/
//   - CBOR (RFC 8949): COSE key format
//   - FIDO2 CTAP2 authenticatorData binary format

import { createHash, createVerify, randomBytes, timingSafeEqual } from "crypto";
import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";

// ── Config ────────────────────────────────────────────────────────────────────

function getRpConfig(): { rpId: string; rpName: string; origins: string[] } {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const customRpId = process.env.WEBAUTHN_RP_ID;
  let rpId: string;
  let origins: string[];

  if (customRpId) {
    rpId = customRpId;
    origins = (process.env.WEBAUTHN_ORIGINS ?? siteUrl).split(",").map((s) => s.trim());
  } else {
    try {
      const url = new URL(siteUrl);
      rpId = url.hostname;
      origins = [url.origin];
    } catch {
      rpId = "localhost";
      origins = ["http://localhost:3000"];
    }
  }

  return { rpId, rpName: "TecPey", origins };
}

// ── Challenge store (Redis) ───────────────────────────────────────────────────

const CHALLENGE_PREFIX = "tecpey:webauthn:challenge:";
const CHALLENGE_TTL_S = 300; // 5 minutes

function redisClient() {
  return globalThis.tecpeyRedisClient ?? null;
}

export async function storeWebAuthnChallenge(
  challenge: string,
  userId: string,
): Promise<void> {
  const r = redisClient();
  if (!r) throw new Error("webauthn_requires_redis");
  await r.set(`${CHALLENGE_PREFIX}${challenge}`, userId, "EX", CHALLENGE_TTL_S);
}

export async function consumeWebAuthnChallenge(
  challenge: string,
): Promise<string | null> {
  const r = redisClient();
  if (!r) return null;
  const pipeline = r.pipeline();
  pipeline.get(`${CHALLENGE_PREFIX}${challenge}`);
  pipeline.del(`${CHALLENGE_PREFIX}${challenge}`);
  const results = await pipeline.exec();
  const userId = results?.[0]?.[1];
  return typeof userId === "string" ? userId : null;
}

export function generateChallenge(): string {
  return randomBytes(32).toString("base64url");
}

// ── CBOR minimal decoder — COSE ES256 key maps only ──────────────────────────
// Handles: uint, negint, bstr, map (enough for COSE key parsing)

class CborReader {
  pos = 0;
  constructor(private buf: Buffer) {}

  private readLen(ai: number): number {
    if (ai < 24) return ai;
    if (ai === 24) return this.buf[this.pos++];
    if (ai === 25) {
      const v = this.buf.readUInt16BE(this.pos);
      this.pos += 2;
      return v;
    }
    throw new Error(`cbor: unsupported additional info ${ai}`);
  }

  readItem(): unknown {
    const b = this.buf[this.pos++];
    const mt = b >> 5;
    const ai = b & 0x1f;

    if (mt === 0) return this.readLen(ai); // unsigned int
    if (mt === 1) return -1 - this.readLen(ai); // negative int
    if (mt === 2) {
      const len = this.readLen(ai);
      const bytes = this.buf.subarray(this.pos, this.pos + len);
      this.pos += len;
      return Buffer.from(bytes);
    }
    if (mt === 5) {
      const count = this.readLen(ai);
      const map = new Map<number, unknown>();
      for (let i = 0; i < count; i++) {
        const k = this.readItem();
        const v = this.readItem();
        if (typeof k === "number") map.set(k, v);
      }
      return map;
    }
    throw new Error(`cbor: unsupported major type ${mt}`);
  }
}

// ── COSE ES256 → SPKI DER ─────────────────────────────────────────────────────
// P-256 SubjectPublicKeyInfo DER prefix (27 bytes):
//   SEQUENCE { SEQUENCE { OID ecPublicKey, OID prime256v1 }, BIT STRING 04 ... }
const P256_SPKI_PREFIX = Buffer.from(
  "3059301306072a8648ce3d020106082a8648ce3d03010703420004",
  "hex",
);

type CoseKey = { x: Buffer; y: Buffer };

function parseCoseEs256(coseBytes: Buffer): CoseKey | null {
  try {
    const reader = new CborReader(coseBytes);
    const map = reader.readItem();
    if (!(map instanceof Map)) return null;
    const kty = map.get(1);
    const alg = map.get(3);
    const x = map.get(-2);
    const y = map.get(-3);
    if (kty !== 2 || alg !== -7) return null; // must be EC2 / ES256
    if (!(x instanceof Buffer) || !(y instanceof Buffer)) return null;
    if (x.length !== 32 || y.length !== 32) return null;
    return { x, y };
  } catch {
    return null;
  }
}

function coseToSpkiDer(coseBytes: Buffer): Buffer | null {
  const key = parseCoseEs256(coseBytes);
  if (!key) return null;
  return Buffer.concat([P256_SPKI_PREFIX, key.x, key.y]);
}

// ── authenticatorData parser ──────────────────────────────────────────────────

type AuthData = {
  rpIdHash: Buffer;
  flags: { up: boolean; uv: boolean; be: boolean; bs: boolean; at: boolean; ed: boolean };
  signCount: number;
  aaguid?: Buffer;
  credentialId?: Buffer;
  credentialPublicKey?: Buffer;
};

function parseAuthenticatorData(buf: Buffer): AuthData | null {
  if (buf.length < 37) return null;
  const rpIdHash = buf.subarray(0, 32);
  const flagByte = buf[32];
  const flags = {
    up: Boolean(flagByte & 0x01),
    uv: Boolean(flagByte & 0x04),
    be: Boolean(flagByte & 0x08),
    bs: Boolean(flagByte & 0x10),
    at: Boolean(flagByte & 0x40),
    ed: Boolean(flagByte & 0x80),
  };
  const signCount = buf.readUInt32BE(33);

  let offset = 37;
  let aaguid: Buffer | undefined;
  let credentialId: Buffer | undefined;
  let credentialPublicKey: Buffer | undefined;

  if (flags.at && buf.length > 37) {
    aaguid = buf.subarray(offset, offset + 16);
    offset += 16;
    const idLen = buf.readUInt16BE(offset);
    offset += 2;
    credentialId = buf.subarray(offset, offset + idLen);
    offset += idLen;
    credentialPublicKey = buf.subarray(offset);
  }

  return { rpIdHash, flags, signCount, aaguid, credentialId, credentialPublicKey };
}

// ── Signature verification ─────────────────────────────────────────────────────

function verifyEs256Signature(
  spkiDer: Buffer,
  authenticatorData: Buffer,
  clientDataJsonRaw: Buffer,
  signature: Buffer,
): boolean {
  try {
    const clientDataHash = createHash("sha256").update(clientDataJsonRaw).digest();
    const signedData = Buffer.concat([authenticatorData, clientDataHash]);
    const verify = createVerify("SHA256");
    verify.update(signedData);
    return verify.verify({ key: spkiDer, format: "der", type: "spki" }, signature);
  } catch {
    return false;
  }
}

// ── Registration ──────────────────────────────────────────────────────────────

type RegistrationInput = {
  userId: string;
  response: {
    id: string;                    // credential ID base64url
    rawId: string;                 // base64url
    response: {
      clientDataJSON: string;      // base64url
      attestationObject: string;   // base64url
    };
    type: "public-key";
    transports?: string[];
  };
  deviceName?: string;
};

type RegistrationResult =
  | { ok: true; credentialId: string; aaguid: string }
  | { ok: false; reason: string };

export async function verifyWebAuthnRegistration(
  input: RegistrationInput,
): Promise<RegistrationResult> {
  const { rpId, origins } = getRpConfig();

  // 1. Decode clientDataJSON
  let clientData: { type: string; challenge: string; origin: string };
  try {
    const raw = Buffer.from(input.response.response.clientDataJSON, "base64url");
    clientData = JSON.parse(raw.toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid_client_data_json" };
  }

  if (clientData.type !== "webauthn.create") {
    return { ok: false, reason: "wrong_type" };
  }
  if (!origins.includes(clientData.origin)) {
    return { ok: false, reason: "origin_mismatch" };
  }

  // 2. Consume challenge
  const storedUserId = await consumeWebAuthnChallenge(clientData.challenge);
  if (!storedUserId || storedUserId !== input.userId) {
    return { ok: false, reason: "invalid_challenge" };
  }

  // 3. Decode attestationObject (minimal CBOR: just extract authData)
  let authDataBuf: Buffer;
  try {
    const attObj = Buffer.from(input.response.response.attestationObject, "base64url");
    // Parse CBOR map to get authData (key "authData")
    authDataBuf = extractAuthDataFromAttestationObject(attObj);
  } catch {
    return { ok: false, reason: "invalid_attestation_object" };
  }

  // 4. Parse authenticatorData
  const authData = parseAuthenticatorData(authDataBuf);
  if (!authData) return { ok: false, reason: "invalid_auth_data" };

  // 5. Verify rpId hash
  const expectedRpIdHash = createHash("sha256").update(rpId).digest();
  if (!timingSafeEqual(authData.rpIdHash, expectedRpIdHash)) {
    return { ok: false, reason: "rp_id_mismatch" };
  }

  // 6. Verify user presence
  if (!authData.flags.up) return { ok: false, reason: "user_not_present" };

  // 7. Extract credential data
  if (!authData.credentialId || !authData.credentialPublicKey) {
    return { ok: false, reason: "no_credential_data" };
  }

  // 8. Verify public key is ES256
  const spkiDer = coseToSpkiDer(authData.credentialPublicKey);
  if (!spkiDer) return { ok: false, reason: "unsupported_key_algorithm" };

  const credentialIdB64 = authData.credentialId.toString("base64url");
  const publicKeyB64 = authData.credentialPublicKey.toString("base64url");
  const aaguidHex = authData.aaguid
    ? authData.aaguid.toString("hex")
    : "";

  // 9. Persist credential
  const r = await withDb(async (db) => {
    await db.query(
      `INSERT INTO webauthn_credentials
         (user_id, credential_id, public_key, counter, device_name, aaguid, transports)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (credential_id) DO NOTHING`,
      [
        input.userId, credentialIdB64, publicKeyB64,
        authData.signCount,
        (input.deviceName ?? "Authenticator").slice(0, 100),
        aaguidHex || null,
        input.response.transports ?? [],
      ],
    );
    return true;
  });

  if (!r.enabled) return { ok: false, reason: "db_unavailable" };
  return { ok: true, credentialId: credentialIdB64, aaguid: aaguidHex };
}

// ── Authentication ─────────────────────────────────────────────────────────────

type AuthInput = {
  userId?: string; // null for resident key / discoverable credential
  response: {
    id: string;
    rawId: string;
    response: {
      clientDataJSON: string;
      authenticatorData: string;
      signature: string;
      userHandle?: string;
    };
    type: "public-key";
  };
};

type AuthResult =
  | { ok: true; userId: string; credentialId: string }
  | { ok: false; reason: string };

export async function verifyWebAuthnAuthentication(
  input: AuthInput,
): Promise<AuthResult> {
  const { rpId, origins } = getRpConfig();

  // 1. Decode clientDataJSON
  let clientData: { type: string; challenge: string; origin: string };
  const rawClientData = Buffer.from(input.response.response.clientDataJSON, "base64url");
  try {
    clientData = JSON.parse(rawClientData.toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid_client_data_json" };
  }

  if (clientData.type !== "webauthn.get") {
    return { ok: false, reason: "wrong_type" };
  }
  if (!origins.includes(clientData.origin)) {
    return { ok: false, reason: "origin_mismatch" };
  }

  // 2. Consume challenge — returns the userId we stored
  const expectedUserId = await consumeWebAuthnChallenge(clientData.challenge);
  if (!expectedUserId) return { ok: false, reason: "invalid_challenge" };

  // 3. Look up credential
  const credentialIdB64 = input.response.rawId;
  const r = await withDb(async (db) => {
    const result = await db.query<{
      id: string; user_id: string; public_key: string; counter: number;
    }>(
      `SELECT id, user_id, public_key, counter
       FROM webauthn_credentials
       WHERE credential_id = $1 AND is_active = TRUE`,
      [credentialIdB64],
    );
    return result.rows[0] ?? null;
  });

  if (!r.enabled || !r.value) return { ok: false, reason: "credential_not_found" };
  const cred = r.value;

  // 4. Verify user ownership
  if (cred.user_id !== expectedUserId) return { ok: false, reason: "user_mismatch" };
  if (input.userId && input.userId !== cred.user_id) return { ok: false, reason: "user_mismatch" };

  // 5. Parse authenticatorData
  const authDataBuf = Buffer.from(input.response.response.authenticatorData, "base64url");
  const authData = parseAuthenticatorData(authDataBuf);
  if (!authData) return { ok: false, reason: "invalid_auth_data" };

  // 6. Verify rpId hash
  const expectedRpIdHash = createHash("sha256").update(rpId).digest();
  if (!timingSafeEqual(authData.rpIdHash, expectedRpIdHash)) {
    return { ok: false, reason: "rp_id_mismatch" };
  }

  // 7. Require user presence and user verification
  if (!authData.flags.up) return { ok: false, reason: "user_not_present" };
  if (!authData.flags.uv) return { ok: false, reason: "user_not_verified" };

  // 8. Counter check (replay detection)
  if (authData.signCount !== 0 && authData.signCount <= cred.counter) {
    logger.warn("[webauthn] counter rollback — possible replay", {
      credentialId: credentialIdB64,
      received: authData.signCount,
      stored: cred.counter,
    });
    return { ok: false, reason: "counter_rollback" };
  }

  // 9. Verify signature
  const coseBytes = Buffer.from(cred.public_key, "base64url");
  const spkiDer = coseToSpkiDer(coseBytes);
  if (!spkiDer) return { ok: false, reason: "unsupported_key_algorithm" };

  const signature = Buffer.from(input.response.response.signature, "base64url");
  if (!verifyEs256Signature(spkiDer, authDataBuf, rawClientData, signature)) {
    return { ok: false, reason: "signature_invalid" };
  }

  // 10. Update counter
  await withDb(async (db) => {
    await db.query(
      `UPDATE webauthn_credentials SET counter = $1, last_used_at = NOW() WHERE id = $2`,
      [authData.signCount, cred.id],
    );
    return true;
  });

  return { ok: true, userId: cred.user_id, credentialId: credentialIdB64 };
}

// ── Attestation Object CBOR helper ────────────────────────────────────────────
// The attestationObject is a CBOR map: { "fmt": ..., "attStmt": ..., "authData": bytes }
// We only need authData — extract it using our minimal CBOR reader.

function extractAuthDataFromAttestationObject(buf: Buffer): Buffer {
  // Find "authData" key in CBOR map
  // Walk the CBOR map looking for text key "authData"
  const reader = new CborReader(buf);
  const top = reader.readItem();
  if (!(top instanceof Map)) {
    // Try alternate approach: scan for "authData" key manually
    return extractAuthDataFallback(buf);
  }
  // Our CborReader uses numeric keys; for string keys we need a different approach
  return extractAuthDataFallback(buf);
}

// Scan CBOR attestation object for the "authData" byte string.
// The text key "authData" in CBOR is: 68 61 75 74 68 44 61 74 61
// followed by a bytes value: 58 xx [xx bytes] or 59 xxxx [xxxx bytes]
function extractAuthDataFallback(buf: Buffer): Buffer {
  // Search for the authData key: 0x68 = text(8 bytes), "authData" = 8 bytes
  const keyBytes = Buffer.from([0x68, 0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61]); // tstr(8)+"authData"
  for (let i = 0; i < buf.length - keyBytes.length - 3; i++) {
    if (buf.subarray(i, i + keyBytes.length).equals(keyBytes)) {
      const after = i + keyBytes.length;
      // Next byte is the bytes major type
      const hdr = buf[after];
      if ((hdr >> 5) !== 2) continue; // must be major type 2 (bstr)
      const ai = hdr & 0x1f;
      let len: number;
      let dataStart: number;
      if (ai < 24) { len = ai; dataStart = after + 1; }
      else if (ai === 24) { len = buf[after + 1]; dataStart = after + 2; }
      else if (ai === 25) { len = buf.readUInt16BE(after + 1); dataStart = after + 3; }
      else continue;
      if (dataStart + len <= buf.length) {
        return buf.subarray(dataStart, dataStart + len);
      }
    }
  }
  // Fallback: try re-reading with full CBOR map including string keys
  return extractAuthDataWithStringKeys(buf);
}

function extractAuthDataWithStringKeys(buf: Buffer): Buffer {
  let pos = 0;

  function readUint(ai: number): number {
    if (ai < 24) return ai;
    if (ai === 24) return buf[pos++];
    if (ai === 25) { const v = buf.readUInt16BE(pos); pos += 2; return v; }
    throw new Error("unsupported");
  }

  function skip(): void {
    const b = buf[pos++];
    const mt = b >> 5;
    const ai = b & 0x1f;
    const len = readUint(ai);
    if (mt === 0 || mt === 1) return;
    if (mt === 2 || mt === 3) { pos += len; return; }
    if (mt === 4) { for (let i = 0; i < len; i++) skip(); return; }
    if (mt === 5) { for (let i = 0; i < len * 2; i++) skip(); return; }
    throw new Error(`unknown mt ${mt}`);
  }

  function readStr(): string {
    const b = buf[pos++];
    const mt = b >> 5;
    const ai = b & 0x1f;
    if (mt !== 3) throw new Error("not a string");
    const len = readUint(ai);
    const s = buf.subarray(pos, pos + len).toString("utf8");
    pos += len;
    return s;
  }

  function readBytes(): Buffer {
    const b = buf[pos++];
    const mt = b >> 5;
    const ai = b & 0x1f;
    if (mt !== 2) throw new Error("not bytes");
    const len = readUint(ai);
    const bytes = buf.subarray(pos, pos + len);
    pos += len;
    return Buffer.from(bytes);
  }

  // Read top-level map
  const b = buf[pos++];
  if ((b >> 5) !== 5) throw new Error("not a map");
  const count = readUint(b & 0x1f);

  for (let i = 0; i < count; i++) {
    const keyByte = buf[pos];
    let key: string;
    if ((keyByte >> 5) === 3) {
      key = readStr();
    } else {
      skip();
      skip();
      continue;
    }
    if (key === "authData") return readBytes();
    skip();
  }
  throw new Error("authData not found in attestation object");
}

// ── Credential management ─────────────────────────────────────────────────────

export type WebAuthnCredential = {
  id: string;
  credentialId: string;
  deviceName: string;
  aaguid: string | null;
  transports: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  isActive: boolean;
};

export async function listCredentials(userId: string): Promise<WebAuthnCredential[]> {
  const r = await withDb(async (db) => {
    const result = await db.query<{
      id: string; credential_id: string; device_name: string;
      aaguid: string | null; transports: string[];
      created_at: Date; last_used_at: Date | null; is_active: boolean;
    }>(
      `SELECT id, credential_id, device_name, aaguid, transports, created_at, last_used_at, is_active
       FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map((r) => ({
      id: r.id,
      credentialId: r.credential_id,
      deviceName: r.device_name,
      aaguid: r.aaguid,
      transports: r.transports,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
      isActive: r.is_active,
    }));
  });
  return r.enabled ? r.value : [];
}

export async function renameCredential(
  id: string,
  userId: string,
  name: string,
): Promise<boolean> {
  const r = await withDb(async (db) => {
    const result = await db.query(
      `UPDATE webauthn_credentials SET device_name = $1 WHERE id = $2 AND user_id = $3`,
      [name.slice(0, 100), id, userId],
    );
    return (result.rowCount ?? 0) > 0;
  });
  return r.enabled ? r.value : false;
}

export async function revokeCredential(id: string, userId: string): Promise<boolean> {
  const r = await withDb(async (db) => {
    const result = await db.query(
      `UPDATE webauthn_credentials SET is_active = FALSE WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (result.rowCount ?? 0) > 0;
  });
  return r.enabled ? r.value : false;
}

// ── Device fingerprinting ─────────────────────────────────────────────────────

export function deviceFingerprint(userAgent: string, ip: string): string {
  return createHash("sha256")
    .update(`${userAgent}\x00${ip}`)
    .digest("hex");
}

export async function markDeviceSeen(
  userId: string,
  fingerprint: string,
): Promise<{ isNew: boolean }> {
  const r = await withDb(async (db) => {
    const existing = await db.query(
      `SELECT id FROM known_devices WHERE user_id = $1 AND fingerprint = $2`,
      [userId, fingerprint],
    );
    if ((existing.rowCount ?? 0) > 0) {
      await db.query(
        `UPDATE known_devices SET last_seen_at = NOW() WHERE user_id = $1 AND fingerprint = $2`,
        [userId, fingerprint],
      );
      return { isNew: false };
    }
    await db.query(
      `INSERT INTO known_devices (user_id, fingerprint) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, fingerprint],
    );
    return { isNew: true };
  });
  return r.enabled ? r.value : { isNew: false };
}
