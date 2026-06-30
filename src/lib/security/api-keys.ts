// Production-grade API key management.
//
// Key format: tecpey_<8-char-prefix>_<48-random-chars>
// Storage: SHA-256(plaintext_key) — plaintext is returned once and NEVER stored.
// Validation: hash the provided key, compare against key_hash column.
//
// Permissions: "read" | "trade" | "withdraw" (additive, not hierarchical)
// IP whitelist: null = allow all; string[] = restrict to listed IPs
// Expiration: optional; null = no expiry

import { createHash, randomBytes } from "crypto";
import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ApiKeyPermission = "read" | "trade" | "withdraw";

export type ApiKey = {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  permissions: ApiKeyPermission[];
  ipWhitelist: string[] | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ApiKeyValidation = {
  valid: boolean;
  userId: string | null;
  keyId: string | null;
  permissions: ApiKeyPermission[];
  reason?: string;
};

type DbApiKeyRow = {
  id: string; user_id: string; name: string; key_prefix: string;
  permissions: string[]; ip_whitelist: string[] | null;
  expires_at: Date | null; last_used_at: Date | null;
  is_active: boolean; created_at: Date; updated_at: Date;
};

function rowToApiKey(r: DbApiKeyRow): ApiKey {
  return {
    id: r.id, userId: r.user_id, name: r.name, keyPrefix: r.key_prefix,
    permissions: r.permissions as ApiKeyPermission[],
    ipWhitelist: r.ip_whitelist, expiresAt: r.expires_at,
    lastUsedAt: r.last_used_at, isActive: r.is_active,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// ── Key generation ────────────────────────────────────────────────────────────

function generateApiKey(): { plaintext: string; prefix: string; hash: string } {
  const body = randomBytes(36).toString("base64url"); // 48 URL-safe chars
  const prefix = body.slice(0, 8);
  const plaintext = `tecpey_${prefix}_${body}`;
  const hash = createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, prefix, hash };
}

function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createApiKey(opts: {
  userId: string;
  name: string;
  permissions: ApiKeyPermission[];
  ipWhitelist?: string[] | null;
  expiresAt?: Date | null;
}): Promise<{ apiKey: ApiKey; plaintext: string }> {
  const { plaintext, prefix, hash } = generateApiKey();

  const r = await withDb(async (db) => {
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM api_keys WHERE user_id = $1 AND is_active = TRUE`,
      [opts.userId],
    );
    if (parseInt(countResult.rows[0].count) >= 20) {
      throw new Error("api_key_limit_reached");
    }

    const result = await db.query<DbApiKeyRow>(
      `INSERT INTO api_keys
         (user_id, name, key_prefix, key_hash, permissions, ip_whitelist, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id, name, key_prefix, permissions, ip_whitelist,
                 expires_at, last_used_at, is_active, created_at, updated_at`,
      [
        opts.userId, opts.name.slice(0, 100), prefix, hash,
        opts.permissions, opts.ipWhitelist ?? null, opts.expiresAt ?? null,
      ],
    );
    return { apiKey: rowToApiKey(result.rows[0]), plaintext };
  });

  if (!r.enabled) throw new Error("db_unavailable");
  return r.value;
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listApiKeys(userId: string): Promise<ApiKey[]> {
  const r = await withDb(async (db) => {
    const result = await db.query<DbApiKeyRow>(
      `SELECT id, user_id, name, key_prefix, permissions, ip_whitelist,
              expires_at, last_used_at, is_active, created_at, updated_at
       FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map(rowToApiKey);
  });
  return r.enabled ? r.value : [];
}

// ── Validate ──────────────────────────────────────────────────────────────────

export async function validateApiKey(
  rawKey: string,
  requiredPermission: ApiKeyPermission,
  callerIp?: string,
): Promise<ApiKeyValidation> {
  if (!rawKey.startsWith("tecpey_")) {
    return { valid: false, userId: null, keyId: null, permissions: [], reason: "invalid_format" };
  }

  const hash = hashApiKey(rawKey);

  const r = await withDb(async (db) => {
    const result = await db.query<{
      id: string; user_id: string; permissions: string[];
      ip_whitelist: string[] | null; expires_at: Date | null; is_active: boolean;
    }>(
      `SELECT id, user_id, permissions, ip_whitelist, expires_at, is_active
       FROM api_keys WHERE key_hash = $1`,
      [hash],
    );

    if ((result.rowCount ?? 0) === 0) {
      return { valid: false, userId: null, keyId: null, permissions: [] as ApiKeyPermission[], reason: "key_not_found" };
    }

    const k = result.rows[0];
    const permissions = k.permissions as ApiKeyPermission[];

    if (!k.is_active) {
      return { valid: false, userId: k.user_id, keyId: k.id, permissions, reason: "key_disabled" };
    }
    if (k.expires_at && k.expires_at < new Date()) {
      return { valid: false, userId: k.user_id, keyId: k.id, permissions, reason: "key_expired" };
    }
    if (!permissions.includes(requiredPermission)) {
      return { valid: false, userId: k.user_id, keyId: k.id, permissions, reason: "insufficient_permissions" };
    }
    if (k.ip_whitelist && callerIp && !k.ip_whitelist.includes(callerIp)) {
      return { valid: false, userId: k.user_id, keyId: k.id, permissions, reason: "ip_not_whitelisted" };
    }

    void db.query(
      `UPDATE api_keys SET last_used_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [k.id],
    ).catch(() => { /* non-critical */ });

    return { valid: true, userId: k.user_id, keyId: k.id, permissions };
  });

  if (!r.enabled) {
    return { valid: false, userId: null, keyId: null, permissions: [], reason: "db_unavailable" };
  }
  return r.value;
}

// ── Disable / Enable ──────────────────────────────────────────────────────────

export async function setApiKeyActive(keyId: string, userId: string, active: boolean): Promise<boolean> {
  const r = await withDb(async (db) => {
    const result = await db.query(
      `UPDATE api_keys SET is_active = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
      [active, keyId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  });
  return r.enabled ? r.value : false;
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteApiKey(keyId: string, userId: string): Promise<boolean> {
  const r = await withDb(async (db) => {
    const result = await db.query(
      `DELETE FROM api_keys WHERE id = $1 AND user_id = $2`,
      [keyId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  });
  return r.enabled ? r.value : false;
}

// ── Rotate ────────────────────────────────────────────────────────────────────

export async function rotateApiKey(keyId: string, userId: string): Promise<{ plaintext: string } | null> {
  const { plaintext, prefix, hash } = generateApiKey();
  const r = await withDb(async (db) => {
    const result = await db.query(
      `UPDATE api_keys SET key_prefix = $1, key_hash = $2, updated_at = NOW()
       WHERE id = $3 AND user_id = $4 AND is_active = TRUE`,
      [prefix, hash, keyId, userId],
    );
    if ((result.rowCount ?? 0) === 0) {
      logger.warn("[api-keys] rotate: key not found or inactive", { keyId, userId });
      return null;
    }
    return { plaintext };
  });
  return r.enabled ? r.value : null;
}
