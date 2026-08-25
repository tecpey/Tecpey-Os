import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const ADMIN_PASSWORD_MIN_LENGTH = 15;
export const ADMIN_PASSWORD_MAX_LENGTH = 128;

export function validateAdminPassword(value: unknown, email?: string): string | null {
  if (typeof value !== "string") return null;
  const length = Array.from(value).length;
  if (length < ADMIN_PASSWORD_MIN_LENGTH || length > ADMIN_PASSWORD_MAX_LENGTH) return null;
  if (email && value.trim().toLowerCase() === email.trim().toLowerCase()) return null;
  return value;
}

export function hashAdminPassword(password: string): string {
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

export function verifyAdminPassword(password: string, stored: string): boolean {
  const [algorithm, nText, rText, pText, saltText, digestText] = stored.split("$");
  if (algorithm !== "scrypt" || !saltText || !digestText) return false;
  const N = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  if (N !== 32_768 || r !== 8 || p !== 1) return false;
  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(digestText, "base64url");
    if (salt.length !== 16 || expected.length !== 32) return false;
    const calculated = scryptSync(password, salt, expected.length, { N, r, p, maxmem: 64 * 1024 * 1024 });
    return timingSafeEqual(calculated, expected);
  } catch {
    return false;
  }
}
