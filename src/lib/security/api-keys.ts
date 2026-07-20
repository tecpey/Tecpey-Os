// Production-grade API key management.
//
// Key format: tecpey_<8-char-prefix>_<48-random-chars>
// Storage: SHA-256(plaintext_key) — plaintext is returned once and NEVER stored.
// Validation: hash the provided key, compare against key_hash column.
//
// Credential lifecycle mutations are transaction-coupled to mandatory audit
// evidence. A create/enable/disable/rotate/delete operation cannot commit if its
// append-only audit admission fails.

import { createHash, randomBytes } from "crypto";
import { withDb, withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import { ipInWhitelist } from "./cidr";
import {
  writeSensitiveMutationAuditTx,
  type SensitiveMutationAuditEvent,
} from "./sensitive-mutation-audit";

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

export type ApiKeyMutationAuditContext = Pick<
  SensitiveMutationAuditEvent,
  "tenantId" | "actorType" | "actorId" | "correlationId" | "requestHash"
>;

type DbApiKeyRow = {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  ip_whitelist: string[] | null;
  expires_at: Date | null;
  last_used_at: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

function rowToApiKey(row: DbApiKeyRow): ApiKey {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    permissions: row.permissions as ApiKeyPermission[],
    ipWhitelist: row.ip_whitelist,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function generateApiKey(): {
  plaintext: string;
  prefix: string;
  hash: string;
  credentialFingerprint: string;
} {
  const body = randomBytes(36).toString("base64url");
  const prefix = body.slice(0, 8);
  const plaintext = `tecpey_${prefix}_${body}`;
  const hash = createHash("sha256").update(plaintext).digest("hex");
  const credentialFingerprint = createHash("sha256")
    .update(`tecpey-api-key-audit:${hash}`)
    .digest("hex");
  return { plaintext, prefix, hash, credentialFingerprint };
}

function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

function assertAuditActor(userId: string, audit: ApiKeyMutationAuditContext): void {
  if (!userId || audit.actorId !== userId) {
    throw new Error("api_key_audit_actor_mismatch");
  }
  if (audit.actorType !== "student" && audit.actorType !== "user") {
    throw new Error("api_key_audit_actor_type_invalid");
  }
}

export async function createApiKey(opts: {
  userId: string;
  name: string;
  permissions: ApiKeyPermission[];
  ipWhitelist?: string[] | null;
  expiresAt?: Date | null;
  audit: ApiKeyMutationAuditContext;
}): Promise<{ apiKey: ApiKey; plaintext: string }> {
  assertAuditActor(opts.userId, opts.audit);
  const generated = generateApiKey();

  const result = await withTx(async (client) => {
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count
         FROM api_keys
        WHERE user_id = $1
          AND is_active = TRUE`,
      [opts.userId],
    );
    if (Number.parseInt(countResult.rows[0]?.count ?? "0", 10) >= 20) {
      throw new Error("api_key_limit_reached");
    }

    const inserted = await client.query<DbApiKeyRow>(
      `INSERT INTO api_keys
         (user_id, name, key_prefix, key_hash, permissions, ip_whitelist, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id, name, key_prefix, permissions, ip_whitelist,
                 expires_at, last_used_at, is_active, created_at, updated_at`,
      [
        opts.userId,
        opts.name.slice(0, 100),
        generated.prefix,
        generated.hash,
        opts.permissions,
        opts.ipWhitelist ?? null,
        opts.expiresAt ?? null,
      ],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error("api_key_create_failed");

    await writeSensitiveMutationAuditTx(client, {
      ...opts.audit,
      action: "api_key.create",
      resourceType: "api_key",
      resourceId: row.id,
      outcome: "success",
      metadata: {
        name: row.name,
        permissions: row.permissions,
        hasIpWhitelist: Boolean(row.ip_whitelist?.length),
        expiresAt: row.expires_at?.toISOString() ?? null,
        credentialFingerprint: generated.credentialFingerprint,
      },
    });

    return { apiKey: rowToApiKey(row), plaintext: generated.plaintext };
  });

  if (!result.enabled) throw new Error("db_unavailable");
  return result.value;
}

export async function listApiKeys(userId: string): Promise<ApiKey[]> {
  const result = await withDb(async (client) => {
    const query = await client.query<DbApiKeyRow>(
      `SELECT id, user_id, name, key_prefix, permissions, ip_whitelist,
              expires_at, last_used_at, is_active, created_at, updated_at
         FROM api_keys
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [userId],
    );
    return query.rows.map(rowToApiKey);
  });
  return result.enabled ? result.value : [];
}

export async function validateApiKey(
  rawKey: string,
  requiredPermission: ApiKeyPermission,
  callerIp?: string,
): Promise<ApiKeyValidation> {
  if (!rawKey.startsWith("tecpey_")) {
    return {
      valid: false,
      userId: null,
      keyId: null,
      permissions: [],
      reason: "invalid_format",
    };
  }

  const hash = hashApiKey(rawKey);
  const result = await withDb(async (client) => {
    const query = await client.query<{
      id: string;
      user_id: string;
      permissions: string[];
      ip_whitelist: string[] | null;
      expires_at: Date | null;
      is_active: boolean;
    }>(
      `SELECT id, user_id, permissions, ip_whitelist, expires_at, is_active
         FROM api_keys
        WHERE key_hash = $1`,
      [hash],
    );

    if ((query.rowCount ?? 0) === 0) {
      return {
        valid: false,
        userId: null,
        keyId: null,
        permissions: [] as ApiKeyPermission[],
        reason: "key_not_found",
      };
    }

    const key = query.rows[0];
    const permissions = key.permissions as ApiKeyPermission[];
    if (!key.is_active) {
      return {
        valid: false,
        userId: key.user_id,
        keyId: key.id,
        permissions,
        reason: "key_disabled",
      };
    }
    if (key.expires_at && key.expires_at < new Date()) {
      return {
        valid: false,
        userId: key.user_id,
        keyId: key.id,
        permissions,
        reason: "key_expired",
      };
    }
    if (!permissions.includes(requiredPermission)) {
      return {
        valid: false,
        userId: key.user_id,
        keyId: key.id,
        permissions,
        reason: "insufficient_permissions",
      };
    }
    if (
      key.ip_whitelist &&
      key.ip_whitelist.length > 0 &&
      callerIp &&
      !ipInWhitelist(callerIp, key.ip_whitelist)
    ) {
      return {
        valid: false,
        userId: key.user_id,
        keyId: key.id,
        permissions,
        reason: "ip_not_whitelisted",
      };
    }

    void client
      .query(
        `UPDATE api_keys
            SET last_used_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [key.id],
      )
      .catch(() => {
        // last-used telemetry is explicitly non-authoritative
      });

    return {
      valid: true,
      userId: key.user_id,
      keyId: key.id,
      permissions,
    };
  });

  if (!result.enabled) {
    return {
      valid: false,
      userId: null,
      keyId: null,
      permissions: [],
      reason: "db_unavailable",
    };
  }
  return result.value;
}

export async function setApiKeyActive(
  keyId: string,
  userId: string,
  active: boolean,
  audit: ApiKeyMutationAuditContext,
): Promise<boolean> {
  assertAuditActor(userId, audit);
  const result = await withTx(async (client) => {
    const updated = await client.query<{ id: string }>(
      `UPDATE api_keys
          SET is_active = $1, updated_at = NOW()
        WHERE id = $2
          AND user_id = $3
      RETURNING id`,
      [active, keyId, userId],
    );
    if (!updated.rows[0]?.id) return false;

    await writeSensitiveMutationAuditTx(client, {
      ...audit,
      action: active ? "api_key.enable" : "api_key.disable",
      resourceType: "api_key",
      resourceId: keyId,
      outcome: "success",
      metadata: { active },
    });
    return true;
  });

  if (!result.enabled) throw new Error("db_unavailable");
  return result.value;
}

export async function deleteApiKey(
  keyId: string,
  userId: string,
  audit: ApiKeyMutationAuditContext,
): Promise<boolean> {
  assertAuditActor(userId, audit);
  const result = await withTx(async (client) => {
    const deleted = await client.query<{ id: string }>(
      `DELETE FROM api_keys
        WHERE id = $1
          AND user_id = $2
      RETURNING id`,
      [keyId, userId],
    );
    if (!deleted.rows[0]?.id) return false;

    await writeSensitiveMutationAuditTx(client, {
      ...audit,
      action: "api_key.delete",
      resourceType: "api_key",
      resourceId: keyId,
      outcome: "success",
      metadata: { deleted: true },
    });
    return true;
  });

  if (!result.enabled) throw new Error("db_unavailable");
  return result.value;
}

export async function rotateApiKey(
  keyId: string,
  userId: string,
  audit: ApiKeyMutationAuditContext,
): Promise<{ plaintext: string } | null> {
  assertAuditActor(userId, audit);
  const generated = generateApiKey();
  const result = await withTx(async (client) => {
    const updated = await client.query<{ id: string }>(
      `UPDATE api_keys
          SET key_prefix = $1,
              key_hash = $2,
              updated_at = NOW()
        WHERE id = $3
          AND user_id = $4
          AND is_active = TRUE
      RETURNING id`,
      [generated.prefix, generated.hash, keyId, userId],
    );
    if (!updated.rows[0]?.id) {
      logger.warn("[api-keys] rotate: key not found or inactive", { keyId, userId });
      return null;
    }

    await writeSensitiveMutationAuditTx(client, {
      ...audit,
      action: "api_key.rotate",
      resourceType: "api_key",
      resourceId: keyId,
      outcome: "success",
      metadata: {
        credentialFingerprint: generated.credentialFingerprint,
      },
    });
    return { plaintext: generated.plaintext };
  });

  if (!result.enabled) throw new Error("db_unavailable");
  return result.value;
}
