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

const B32_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function bytesToBase32(buf: Buffer): string {
  let bits = "";
  for (const byte of buf) bits += byte.toString(2).padStart(8, "0");
  let result = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    result += B32_ALPHA[parseInt(bits.slice(i, i + 5), 2)];
  }
  return result;
}

export function generateTotpSecret(): string {
  return bytesToBase32(randomBytes(20));
}

export function encryptTotpSecret(rawBase32: string): string {
  const key = get2faKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(rawBase32, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

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

function hotp(keyBuf: Buffer, counter: number): number {
  const counterBuf = Buffer.alloc(8, 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);
  const mac = createHmac("sha1", keyBuf).update(counterBuf).digest();
  const offset = mac[19] & 0x0f;
  const code =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return (code >>> 0) % 1_000_000;
}

export function generateTotp(secretBase32: string): string {
  const key = base32ToBuffer(secretBase32);
  const step = Math.floor(Date.now() / 30_000);
  return hotp(key, step).toString().padStart(6, "0");
}

/**
 * Verify a TOTP code and return the exact accepted RFC-6238 time step.
 * The step is suitable for a database uniqueness constraint, preventing one
 * code window from minting multiple withdrawal authorizations.
 */
export function verifyTotpStep(secretBase32: string, code: string): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  try {
    const key = base32ToBuffer(secretBase32);
    const currentStep = Math.floor(Date.now() / 30_000);
    const submitted = Buffer.from(code, "utf8");
    for (let delta = -1; delta <= 1; delta += 1) {
      const step = currentStep + delta;
      const expected = Buffer.from(
        hotp(key, step).toString().padStart(6, "0"),
        "utf8",
      );
      if (expected.length === submitted.length && timingSafeEqual(expected, submitted)) {
        return step;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function verifyTotp(secretBase32: string, code: string): boolean {
  return verifyTotpStep(secretBase32, code) !== null;
}

function backupCodeSalt(): string {
  const raw = process.env.TECPEY_2FA_SECRET ?? "tecpey-dev-2fa-aes-key-32-chars!";
  return raw.slice(0, 32);
}

export function hashBackupCode(plainCode: string): string {
  const salt = backupCodeSalt();
  return createHmac("sha256", salt).update(plainCode).digest("hex");
}

export function findBackupCode(plainCode: string, hashes: string[]): number {
  const submitted = Buffer.from(hashBackupCode(plainCode.trim().toUpperCase()), "hex");
  for (let i = 0; i < hashes.length; i += 1) {
    const stored = Buffer.from(hashes[i], "hex");
    if (stored.length === submitted.length && timingSafeEqual(stored, submitted)) {
      return i;
    }
  }
  return -1;
}

export function generateBackupCodes(): string[] {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const codes: string[] = [];
  for (let c = 0; c < 10; c += 1) {
    const bytes = randomBytes(8);
    let code = "";
    for (const byte of bytes) code += alphabet[byte % alphabet.length];
    codes.push(code);
  }
  return codes;
}

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

const PREAUTH_PREFIX = "tecpey:preauth:";
const PREAUTH_TTL_S = 300;

function redisClient() {
  return globalThis.tecpeyRedisClient ?? null;
}

export type PreAuthTokenResult =
  | { available: true; userId: string | null }
  | { available: false; userId: null };

export async function storePreAuthToken(token: string, userId: string): Promise<void> {
  const r = redisClient();
  if (!r) {
    logger.warn("[totp] pre-auth: Redis unavailable — 2FA flow requires Redis");
    return;
  }
  await r.set(`${PREAUTH_PREFIX}${token}`, userId, "EX", PREAUTH_TTL_S);
}

/** Resolve the server principal without consuming the one-time challenge. */
export async function peekPreAuthToken(token: string): Promise<PreAuthTokenResult> {
  const r = redisClient();
  if (!r) return { available: false, userId: null };
  try {
    const userId = await r.get(`${PREAUTH_PREFIX}${token}`);
    return { available: true, userId };
  } catch {
    return { available: false, userId: null };
  }
}

/** Atomically claim the challenge after TOTP verification. */
export async function claimPreAuthToken(token: string): Promise<PreAuthTokenResult> {
  const r = redisClient();
  if (!r) return { available: false, userId: null };
  try {
    const result = await r.eval(
      `local value = redis.call('GET', KEYS[1])
       if value then redis.call('DEL', KEYS[1]) end
       return value`,
      1,
      `${PREAUTH_PREFIX}${token}`,
    );
    return {
      available: true,
      userId: typeof result === "string" ? result : null,
    };
  } catch {
    return { available: false, userId: null };
  }
}

/** Legacy compatibility wrapper; new login flows must use peek then claim. */
export async function consumePreAuthToken(token: string): Promise<string | null> {
  const claimed = await claimPreAuthToken(token);
  return claimed.available ? claimed.userId : null;
}
