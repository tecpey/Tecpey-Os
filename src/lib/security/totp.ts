// TOTP implementation — RFC 6238 / RFC 4226.
// Zero new dependencies: uses Node.js crypto module only.
//
// Secret encryption: AES-256-GCM with TECPEY_2FA_SECRET.
// TOTP: HMAC-SHA1 with 30-second time step, 6-digit code, ±1 window.
// Backup codes: 10 × 8-char codes, SHA-256 hashed with server salt.
// QR: otpauth:// URI compatible with Google Authenticator, Authy, 1Password.

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { logger } from "@/lib/logger";

// ── Key derivation ────────────────────────────────────────────────────────────

let _2faKey: Buffer | null = null;

function get2faKey(): Buffer {
  if (_2faKey) return _2faKey;
  const raw = process.env.TECPEY_2FA_SECRET;
  if (raw && raw.length >= 32) {
    _2faKey = Buffer.from(raw.slice(0, 32), "utf8");
    return _2faKey;
  }
  if (process.env.NODE_ENV !== "production") {
    _2faKey = Buffer.from("tecpey-dev-2fa-aes-key-32-chars!", "utf8");
    return _2faKey;
  }
  throw new Error("TECPEY_2FA_SECRET must be at least 32 chars in production");
}

// ── Secret generation ─────────────────────────────────────────────────────────

// Base32 alphabet (RFC 4648, no padding in our output)
const B32_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function bytesToBase32(buf: Buffer): string {
  let bits = "";
  for (const byte of buf) {
    bits += byte.toString(2).padStart(8, "0");
  }
  let result = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    result += B32_ALPHA[parseInt(bits.slice(i, i + 5), 2)];
  }
  return result;
}

/** Generate a 20-byte (160-bit) TOTP secret in base32. */
export function generateTotpSecret(): string {
  return bytesToBase32(randomBytes(20));
}

// ── Secret encryption / decryption ───────────────────────────────────────────

/** AES-256-GCM encrypt a TOTP secret. Returns base64: iv(12) + tag(16) + ciphertext. */
export function encryptTotpSecret(rawBase32: string): string {
  const key = get2faKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(rawBase32, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/** AES-256-GCM decrypt a stored TOTP secret. Returns the raw base32 string. */
export function decryptTotpSecret(stored: string): string {
  const key = get2faKey();
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

// ── Base32 decode ─────────────────────────────────────────────────────────────

function base32ToBuffer(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = "";
  for (const char of clean) {
    const idx = B32_ALPHA.indexOf(char);
    if (idx === -1) throw new Error(`invalid base32 char: ${char}`);
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

// ── HOTP / TOTP ───────────────────────────────────────────────────────────────

// HOTP counter is written as 8-byte big-endian. The time step fits in 32 bits
// (floor(Date.now()/30000) ≈ 57M in 2026, well within uint32 max of 4.3B).
// High 4 bytes are always 0.
function hotp(keyBuf: Buffer, counter: number): number {
  const counterBuf = Buffer.alloc(8, 0); // high 4 bytes = 0
  counterBuf.writeUInt32BE(counter >>> 0, 4); // low 4 bytes
  const mac = createHmac("sha1", keyBuf).update(counterBuf).digest();
  const offset = mac[19] & 0x0f;
  const code =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return (code >>> 0) % 1_000_000;
}

/** Generate the current TOTP code from a raw base32 secret. */
export function generateTotp(secretBase32: string): string {
  const key = base32ToBuffer(secretBase32);
  const T = Math.floor(Date.now() / 30_000);
  return hotp(key, T).toString().padStart(6, "0");
}

/**
 * Verify a 6-digit TOTP code against a base32 secret.
 * Accepts codes from window [-1, 0, +1] (±30 seconds).
 * Returns false on any error.
 */
export function verifyTotp(secretBase32: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    const key = base32ToBuffer(secretBase32);
    const T = Math.floor(Date.now() / 30_000);
    const submitted = parseInt(code, 10);
    for (let delta = -1; delta <= 1; delta++) {
      const expected = hotp(key, T + delta);
      const ea = Buffer.from(expected.toString().padStart(6, "0"), "utf8");
      const sa = Buffer.from(submitted.toString().padStart(6, "0"), "utf8");
      if (ea.length === sa.length && timingSafeEqual(ea, sa)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ── Backup codes ──────────────────────────────────────────────────────────────

function backupCodeSalt(): string {
  const raw = process.env.TECPEY_2FA_SECRET ?? "tecpey-dev-2fa-aes-key-32-chars!";
  return raw.slice(0, 32);
}

/** Hash a single backup code for storage. */
export function hashBackupCode(plainCode: string): string {
  const salt = backupCodeSalt();
  return createHmac("sha256", salt).update(plainCode).digest("hex");
}

/**
 * Verify a backup code against stored hashes.
 * Returns the index of the matched code (so it can be removed), or -1.
 */
export function findBackupCode(plainCode: string, hashes: string[]): number {
  const submitted = Buffer.from(hashBackupCode(plainCode.trim().toUpperCase()), "hex");
  for (let i = 0; i < hashes.length; i++) {
    const stored = Buffer.from(hashes[i], "hex");
    if (stored.length === submitted.length && timingSafeEqual(stored, submitted)) {
      return i;
    }
  }
  return -1;
}

/** Generate 10 random 8-char backup codes (uppercase alphanumeric, no ambiguous chars). */
export function generateBackupCodes(): string[] {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  const codes: string[] = [];
  for (let c = 0; c < 10; c++) {
    const bytes = randomBytes(8);
    let code = "";
    for (const byte of bytes) {
      code += alphabet[byte % alphabet.length];
    }
    codes.push(code);
  }
  return codes;
}

// ── QR URI ────────────────────────────────────────────────────────────────────

/**
 * Build an otpauth:// URI for QR code generation.
 * Compatible with Google Authenticator, Authy, 1Password, Bitwarden.
 */
export function buildOtpAuthUri(opts: {
  secret: string;
  accountName: string;
  issuer?: string;
}): string {
  const issuer = opts.issuer ?? "TecPey";
  const label = encodeURIComponent(`${issuer}:${opts.accountName}`);
  return (
    `otpauth://totp/${label}` +
    `?secret=${opts.secret}` +
    `&issuer=${encodeURIComponent(issuer)}` +
    `&algorithm=SHA1` +
    `&digits=6` +
    `&period=30`
  );
}

// ── Pre-auth token (for 2FA login flow) ───────────────────────────────────────

const PREAUTH_PREFIX = "tecpey:preauth:";
const PREAUTH_TTL_S = 300; // 5 minutes to complete 2FA

function redisClient() {
  return globalThis.tecpeyRedisClient ?? null;
}

/** Store a pre-auth token in Redis, associating it with a userId. */
export async function storePreAuthToken(token: string, userId: string): Promise<void> {
  const r = redisClient();
  if (!r) {
    logger.warn("[totp] pre-auth: Redis unavailable — 2FA flow requires Redis");
    return;
  }
  await r.set(`${PREAUTH_PREFIX}${token}`, userId, "EX", PREAUTH_TTL_S);
}

/** Consume a pre-auth token. Returns userId if valid, null otherwise. Deletes on use. */
export async function consumePreAuthToken(token: string): Promise<string | null> {
  const r = redisClient();
  if (!r) return null;
  try {
    const pipeline = r.pipeline();
    pipeline.get(`${PREAUTH_PREFIX}${token}`);
    pipeline.del(`${PREAUTH_PREFIX}${token}`);
    const results = await pipeline.exec();
    const userId = results?.[0]?.[1];
    return typeof userId === "string" ? userId : null;
  } catch {
    return null;
  }
}
