// Shared password hashing and verification utilities.
// Uses PBKDF2-SHA256 with 120,000 iterations.

import { randomBytes, pbkdf2Sync, timingSafeEqual } from "crypto";
import type { PoolClient } from "pg";
import { withDb } from "@/lib/db";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const digest = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$120000$${salt}$${digest}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, roundsText, salt, digest] = stored.split("$");
  if (algo !== "pbkdf2_sha256" || !roundsText || !salt || !digest) return false;
  const rounds = Number(roundsText);
  if (!Number.isFinite(rounds) || rounds < 50_000) return false;
  const calculated = pbkdf2Sync(password, salt, rounds, 32, "sha256").toString("hex");
  const a = Buffer.from(calculated, "hex");
  const b = Buffer.from(digest, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Check the last N durable password hashes using the caller's DB transaction. */
export async function isPasswordReusedWithClient(
  client: PoolClient,
  userId: string,
  newPassword: string,
  limit = 5,
): Promise<boolean> {
  const safeLimit = Math.max(1, Math.min(10, Math.floor(limit)));
  const result = await client.query<{ password_hash: string }>(
    `SELECT password_hash
       FROM password_history
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, safeLimit],
  );
  return result.rows.some((row) =>
    verifyPassword(newPassword, row.password_hash),
  );
}

/**
 * Compatibility wrapper. Database unavailability is an authority failure and
 * must throw rather than silently treating an unknown history as "not reused".
 */
export async function isPasswordReused(
  userId: string,
  newPassword: string,
  limit = 5,
): Promise<boolean> {
  const dbResult = await withDb((db) =>
    isPasswordReusedWithClient(db, userId, newPassword, limit),
  );
  if (!dbResult.enabled) {
    throw new Error("password_history_unavailable");
  }
  return dbResult.value;
}

export async function recordPasswordHistory(userId: string, passwordHash: string): Promise<void> {
  const result = await withDb(async (db) => {
    await recordPasswordHistoryWithClient(db, userId, passwordHash);
    return true;
  });
  if (!result.enabled) throw new Error("password_history_unavailable");
}

/** Client-aware variant for use inside withTx() — inserts and prunes in one call. */
export async function recordPasswordHistoryWithClient(
  client: PoolClient,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await client.query(
    `INSERT INTO password_history (id, user_id, password_hash) VALUES ($1, $2, $3)`,
    [crypto.randomUUID(), userId, passwordHash],
  );
  // Keep only the last 10 entries
  await client.query(
    `DELETE FROM password_history WHERE user_id = $1 AND id NOT IN (
       SELECT id FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10
     )`,
    [userId],
  );
}

/** Batch variant for use inside withTx() — inserts all hashes then prunes once. */
export async function recordPasswordHistoryBatchWithClient(
  client: PoolClient,
  userId: string,
  passwordHashes: string[],
): Promise<void> {
  for (const passwordHash of passwordHashes) {
    await client.query(
      `INSERT INTO password_history (id, user_id, password_hash) VALUES ($1, $2, $3)`,
      [crypto.randomUUID(), userId, passwordHash],
    );
  }
  // Keep only the last 10 entries (single prune after all inserts)
  await client.query(
    `DELETE FROM password_history WHERE user_id = $1 AND id NOT IN (
       SELECT id FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10
     )`,
    [userId],
  );
}

export function assessPasswordStrength(password: string): { score: number; feedback: string[] } {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[A-Z]/.test(password)) score += 1; else feedback.push("Add uppercase letters");
  if (/[a-z]/.test(password)) score += 1; else feedback.push("Add lowercase letters");
  if (/[0-9]/.test(password)) score += 1; else feedback.push("Add numbers");
  if (/[^A-Za-z0-9]/.test(password)) score += 1; else feedback.push("Add special characters");

  return { score, feedback };
}
