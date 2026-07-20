import { createHash } from "node:crypto";
import { jwtVerify } from "jose";
import type { PoolClient } from "pg";
import { withDb, withTx } from "@/lib/db";
import { revokeMultiple } from "@/lib/security/jti-store";
import type { PreparedRefreshToken } from "@/lib/security/refresh-tokens";
import {
  writeSensitiveMutationAuditTx,
  type SensitiveMutationAuditEvent,
} from "@/lib/security/sensitive-mutation-audit";

const SESSION_POLICY_VERSION = "session-authority-v1";

export type SessionAuditContext = Pick<
  SensitiveMutationAuditEvent,
  "tenantId" | "actorType" | "actorId" | "correlationId" | "requestHash"
>;

export type AuthenticationMethod =
  | "password"
  | "password_signup"
  | "password_2fa"
  | "webauthn";

export type RefreshClaims = {
  userId: string;
  jti: string;
  familyId: string;
};

export type SessionAdmissionInput = {
  userId: string;
  accessJti: string;
  accessExpiresAt: Date;
  preparedRefresh: PreparedRefreshToken;
  deviceInfo: string;
  ip: string;
  deviceFingerprint: string;
  method: AuthenticationMethod;
  audit: SessionAuditContext;
};

export type SessionAdmissionResult = {
  refreshToken: string;
  refreshFamilyId: string;
  knownDeviceId: string;
  isNewDevice: boolean;
};

export type SessionRotationResult =
  | {
      ok: true;
      refreshToken: string;
      refreshFamilyId: string;
      knownDeviceId: string;
      isNewDevice: boolean;
      denyCachePending: boolean;
    }
  | {
      ok: false;
      reason:
        | "invalid_token"
        | "server_misconfigured"
        | "token_not_found"
        | "token_expired"
        | "token_reused"
        | "token_binding_mismatch";
      denyCachePending: boolean;
    };

export type SessionRevocationResult =
  | { ok: true; revokedCount: number; denyCachePending: boolean }
  | { ok: false; reason: "session_not_found" | "database_unavailable" };

export type DeviceMutationResult =
  | { ok: true; revokedCount: number; denyCachePending: boolean }
  | { ok: false; reason: "device_not_found" | "database_unavailable" };

export type KnownDeviceView = {
  id: string;
  deviceName: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

type RevocationEvidence = {
  jti: string;
  expiresAt: number;
};

type KnownDeviceRow = {
  id: string;
  is_new: boolean;
};

type RefreshRow = {
  id: string;
  family_id: string;
  user_id: string;
  is_revoked: boolean;
  expires_at: Date;
};

type SessionRow = {
  id: string;
  refresh_family_id: string | null;
};

function refreshSecret(): Uint8Array | null {
  const raw = process.env.TECPEY_REFRESH_SECRET;
  if (raw && raw.length >= 24) {
    return new TextEncoder().encode(`refresh:${raw}`);
  }
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode(
      "tecpey-local-refresh-token-dev-secret-please-set-env",
    );
  }
  return null;
}

export async function verifyRefreshTokenClaims(
  token: string,
): Promise<
  | { ok: true; claims: RefreshClaims }
  | { ok: false; reason: "invalid_token" | "server_misconfigured" }
> {
  const secret = refreshSecret();
  if (!secret) return { ok: false, reason: "server_misconfigured" };
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.jti !== "string" ||
      typeof payload.fid !== "string" ||
      (payload.v as unknown) !== 1
    ) {
      return { ok: false, reason: "invalid_token" };
    }
    return {
      ok: true,
      claims: {
        userId: payload.sub,
        jti: payload.jti,
        familyId: payload.fid,
      },
    };
  } catch {
    return { ok: false, reason: "invalid_token" };
  }
}

function assertAuditActor(userId: string, audit: SessionAuditContext): void {
  if (!userId || audit.actorId !== userId) {
    throw new Error("session_audit_actor_mismatch");
  }
  if (!["student", "user", "admin"].includes(audit.actorType)) {
    throw new Error("session_audit_actor_type_invalid");
  }
}

function fingerprint(namespace: string, value: string): string {
  return createHash("sha256")
    .update(`tecpey-${namespace}-v1\0`)
    .update(value)
    .digest("hex");
}

export function fingerprintSessionId(value: string): string {
  return fingerprint("session", value);
}

export function fingerprintRefreshFamily(value: string): string {
  return fingerprint("refresh-family", value);
}

function fingerprintRefreshToken(value: string): string {
  return fingerprint("refresh-token", value);
}

function fingerprintLabel(value: string): string {
  return fingerprint("device-label", value);
}

async function upsertKnownDeviceTx(
  client: PoolClient,
  input: { userId: string; fingerprint: string },
): Promise<KnownDeviceRow> {
  const result = await client.query<KnownDeviceRow>(
    `INSERT INTO known_devices
       (user_id, fingerprint, is_active, removed_at, last_seen_at)
     VALUES ($1, $2, TRUE, NULL, NOW())
     ON CONFLICT (user_id, fingerprint) DO UPDATE
       SET is_active = TRUE,
           removed_at = NULL,
           last_seen_at = NOW()
     RETURNING id, (xmax = 0) AS is_new`,
    [input.userId, input.fingerprint],
  );
  const row = result.rows[0];
  if (!row) throw new Error("known_device_upsert_failed");
  return row;
}

async function insertRefreshTokenTx(
  client: PoolClient,
  prepared: PreparedRefreshToken,
  knownDeviceId: string,
): Promise<void> {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO refresh_tokens
       (id, family_id, user_id, parent_id, device_info, ip, expires_at, known_device_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [
      prepared.jti,
      prepared.familyId,
      prepared.userId,
      prepared.parentId,
      prepared.deviceInfo,
      prepared.ip,
      prepared.expiresAt,
      knownDeviceId,
    ],
  );
  if (!inserted.rows[0]?.id) throw new Error("refresh_jti_conflict");
}

async function insertAccessSessionTx(
  client: PoolClient,
  input: {
    accessJti: string;
    userId: string;
    deviceInfo: string;
    ip: string;
    expiresAt: Date;
    familyId: string;
    refreshTokenId: string;
    knownDeviceId: string;
  },
): Promise<void> {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO user_sessions
       (id, user_id, device_info, ip, expires_at,
        refresh_family_id, refresh_token_id, known_device_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [
      input.accessJti,
      input.userId,
      input.deviceInfo.slice(0, 500),
      input.ip.slice(0, 80),
      input.expiresAt,
      input.familyId,
      input.refreshTokenId,
      input.knownDeviceId,
    ],
  );
  if (!inserted.rows[0]?.id) throw new Error("access_jti_conflict");
}

async function enqueueRevocationsTx(
  client: PoolClient,
  tenantId: string,
  userId: string,
  sessions: RevocationEvidence[],
): Promise<void> {
  for (const session of sessions) {
    await client.query(
      `INSERT INTO session_revocation_outbox
         (tenant_id, user_id, session_jti, expires_at, status)
       VALUES ($1, $2, $3, to_timestamp($4), 'pending')
       ON CONFLICT (session_jti) DO UPDATE
         SET status = CASE
               WHEN session_revocation_outbox.status = 'published'
                 THEN session_revocation_outbox.status
               ELSE 'pending'
             END,
             expires_at = GREATEST(
               session_revocation_outbox.expires_at,
               EXCLUDED.expires_at
             )`,
      [tenantId, userId, session.jti, session.expiresAt],
    );
  }
}

async function publishRevocations(
  sessions: RevocationEvidence[],
): Promise<boolean> {
  if (sessions.length === 0) return true;
  const redisPublished = await revokeMultiple(sessions);
  try {
    const persisted = await withDb(async (client) => {
      const ids = sessions.map((session) => session.jti);
      if (redisPublished) {
        await client.query(
          `UPDATE session_revocation_outbox
              SET status = 'published',
                  published_at = NOW(),
                  attempts = attempts + 1,
                  last_error = NULL
            WHERE session_jti = ANY($1::text[])`,
          [ids],
        );
      } else {
        await client.query(
          `UPDATE session_revocation_outbox
              SET attempts = attempts + 1,
                  last_error = 'redis_publish_unavailable'
            WHERE session_jti = ANY($1::text[])
              AND status = 'pending'`,
          [ids],
        );
      }
      return true;
    });
    if (!persisted.enabled || !persisted.value) return false;
  } catch {
    return false;
  }
  return redisPublished;
}

async function collectRevokedSessionsTx(
  client: PoolClient,
  input: {
    userId: string;
    conditionSql: string;
    values: unknown[];
  },
): Promise<RevocationEvidence[]> {
  const rows = await client.query<{ id: string; expires_at: Date }>(
    `SELECT id, expires_at
       FROM user_sessions
      WHERE user_id = $1
        AND ${input.conditionSql}
        AND is_revoked = TRUE
        AND expires_at > NOW()`,
    [input.userId, ...input.values],
  );
  return rows.rows.map((row) => ({
    jti: row.id,
    expiresAt: Math.floor(row.expires_at.getTime() / 1000),
  }));
}

async function revokeFamilyTx(
  client: PoolClient,
  input: { tenantId: string; userId: string; familyId: string },
): Promise<RevocationEvidence[]> {
  await client.query(
    `UPDATE refresh_tokens
        SET is_revoked = TRUE,
            revoked_at = COALESCE(revoked_at, NOW())
      WHERE user_id = $1
        AND family_id = $2
        AND is_revoked = FALSE`,
    [input.userId, input.familyId],
  );
  await client.query(
    `UPDATE user_sessions
        SET is_revoked = TRUE,
            revoked_at = COALESCE(revoked_at, NOW())
      WHERE user_id = $1
        AND refresh_family_id = $2
        AND is_revoked = FALSE`,
    [input.userId, input.familyId],
  );
  const sessions = await collectRevokedSessionsTx(client, {
    userId: input.userId,
    conditionSql: "refresh_family_id = $2",
    values: [input.familyId],
  });
  await enqueueRevocationsTx(client, input.tenantId, input.userId, sessions);
  return sessions;
}

async function revokeSessionIdsTx(
  client: PoolClient,
  input: { tenantId: string; userId: string; sessionIds: string[] },
): Promise<RevocationEvidence[]> {
  if (input.sessionIds.length === 0) return [];
  await client.query(
    `UPDATE user_sessions
        SET is_revoked = TRUE,
            revoked_at = COALESCE(revoked_at, NOW())
      WHERE user_id = $1
        AND id = ANY($2::text[])
        AND is_revoked = FALSE`,
    [input.userId, input.sessionIds],
  );
  const sessions = await collectRevokedSessionsTx(client, {
    userId: input.userId,
    conditionSql: "id = ANY($2::text[])",
    values: [input.sessionIds],
  });
  await enqueueRevocationsTx(client, input.tenantId, input.userId, sessions);
  return sessions;
}

export async function admitSession(
  input: SessionAdmissionInput,
): Promise<SessionAdmissionResult> {
  assertAuditActor(input.userId, input.audit);
  if (
    input.preparedRefresh.userId !== input.userId ||
    input.preparedRefresh.parentId !== null
  ) {
    throw new Error("session_refresh_binding_invalid");
  }

  const result = await withTx(async (client) => {
    const device = await upsertKnownDeviceTx(client, {
      userId: input.userId,
      fingerprint: input.deviceFingerprint,
    });
    await insertRefreshTokenTx(client, input.preparedRefresh, device.id);
    await insertAccessSessionTx(client, {
      accessJti: input.accessJti,
      userId: input.userId,
      deviceInfo: input.deviceInfo,
      ip: input.ip,
      expiresAt: input.accessExpiresAt,
      familyId: input.preparedRefresh.familyId,
      refreshTokenId: input.preparedRefresh.jti,
      knownDeviceId: device.id,
    });
    await writeSensitiveMutationAuditTx(client, {
      ...input.audit,
      action: "session.issue",
      resourceType: "auth_session",
      resourceId: fingerprintSessionId(input.accessJti),
      outcome: "success",
      metadata: {
        policyVersion: SESSION_POLICY_VERSION,
        authenticationMethod: input.method,
        refreshFamilyFingerprint: fingerprintRefreshFamily(
          input.preparedRefresh.familyId,
        ),
        deviceEvidenceFingerprint: input.deviceFingerprint,
        isNewDevice: device.is_new,
      },
    });
    return {
      refreshToken: input.preparedRefresh.token,
      refreshFamilyId: input.preparedRefresh.familyId,
      knownDeviceId: device.id,
      isNewDevice: device.is_new,
    };
  });
  if (!result.enabled) throw new Error("db_unavailable");
  return result.value;
}

export async function rotateSession(input: {
  rawRefreshToken: string;
  accessJti: string;
  accessExpiresAt: Date;
  preparedRefresh: PreparedRefreshToken;
  deviceInfo: string;
  ip: string;
  deviceFingerprint: string;
  tenantId: string;
  correlationId: string;
  requestHash: string;
}): Promise<SessionRotationResult> {
  const verified = await verifyRefreshTokenClaims(input.rawRefreshToken);
  if (!verified.ok) {
    return { ok: false, reason: verified.reason, denyCachePending: false };
  }
  const claims = verified.claims;
  if (
    input.preparedRefresh.userId !== claims.userId ||
    input.preparedRefresh.familyId !== claims.familyId ||
    input.preparedRefresh.parentId !== claims.jti
  ) {
    throw new Error("session_rotation_prepared_binding_invalid");
  }

  const transaction = await withTx(async (client) => {
    const selected = await client.query<RefreshRow>(
      `SELECT id, family_id, user_id, is_revoked, expires_at
         FROM refresh_tokens
        WHERE id = $1
        LIMIT 1
        FOR UPDATE`,
      [claims.jti],
    );
    const old = selected.rows[0];
    const auditBase = {
      tenantId: input.tenantId,
      actorType: "user" as const,
      actorId: claims.userId,
      correlationId: input.correlationId,
      requestHash: input.requestHash,
    };

    if (!old) {
      await writeSensitiveMutationAuditTx(client, {
        ...auditBase,
        action: "session.refresh.reuse_detected",
        resourceType: "refresh_family",
        resourceId: fingerprintRefreshFamily(claims.familyId),
        outcome: "rejected",
        metadata: {
          policyVersion: SESSION_POLICY_VERSION,
          reason: "token_not_found",
        },
      });
      return {
        result: {
          ok: false,
          reason: "token_not_found",
          denyCachePending: false,
        } as SessionRotationResult,
        revokedSessions: [] as RevocationEvidence[],
      };
    }

    const bindingMismatch =
      old.user_id !== claims.userId || old.family_id !== claims.familyId;
    if (old.is_revoked || bindingMismatch) {
      const revokedSessions = await revokeFamilyTx(client, {
        tenantId: input.tenantId,
        userId: old.user_id,
        familyId: old.family_id,
      });
      await writeSensitiveMutationAuditTx(client, {
        ...auditBase,
        actorId: old.user_id,
        action: "session.refresh.reuse_detected",
        resourceType: "refresh_family",
        resourceId: fingerprintRefreshFamily(old.family_id),
        outcome: "rejected",
        metadata: {
          policyVersion: SESSION_POLICY_VERSION,
          reason: bindingMismatch ? "token_binding_mismatch" : "token_reused",
          revokedSessionCount: revokedSessions.length,
        },
      });
      return {
        result: {
          ok: false,
          reason: bindingMismatch ? "token_binding_mismatch" : "token_reused",
          denyCachePending: revokedSessions.length > 0,
        } as SessionRotationResult,
        revokedSessions,
      };
    }

    if (old.expires_at.getTime() <= Date.now()) {
      await writeSensitiveMutationAuditTx(client, {
        ...auditBase,
        action: "session.refresh.rotate",
        resourceType: "refresh_family",
        resourceId: fingerprintRefreshFamily(old.family_id),
        outcome: "rejected",
        metadata: {
          policyVersion: SESSION_POLICY_VERSION,
          reason: "token_expired",
        },
      });
      return {
        result: {
          ok: false,
          reason: "token_expired",
          denyCachePending: false,
        } as SessionRotationResult,
        revokedSessions: [] as RevocationEvidence[],
      };
    }

    const device = await upsertKnownDeviceTx(client, {
      userId: claims.userId,
      fingerprint: input.deviceFingerprint,
    });
    await client.query(
      `UPDATE refresh_tokens
          SET is_revoked = TRUE,
              revoked_at = COALESCE(revoked_at, NOW())
        WHERE id = $1`,
      [old.id],
    );
    await insertRefreshTokenTx(client, input.preparedRefresh, device.id);
    await insertAccessSessionTx(client, {
      accessJti: input.accessJti,
      userId: claims.userId,
      deviceInfo: input.deviceInfo,
      ip: input.ip,
      expiresAt: input.accessExpiresAt,
      familyId: old.family_id,
      refreshTokenId: input.preparedRefresh.jti,
      knownDeviceId: device.id,
    });

    await client.query(
      `UPDATE user_sessions
          SET is_revoked = TRUE,
              revoked_at = COALESCE(revoked_at, NOW())
        WHERE user_id = $1
          AND refresh_token_id = $2
          AND id <> $3
          AND is_revoked = FALSE`,
      [claims.userId, old.id, input.accessJti],
    );
    const revokedSessions = await collectRevokedSessionsTx(client, {
      userId: claims.userId,
      conditionSql: "refresh_token_id = $2 AND id <> $3",
      values: [old.id, input.accessJti],
    });
    await enqueueRevocationsTx(
      client,
      input.tenantId,
      claims.userId,
      revokedSessions,
    );
    await writeSensitiveMutationAuditTx(client, {
      ...auditBase,
      action: "session.refresh.rotate",
      resourceType: "refresh_family",
      resourceId: fingerprintRefreshFamily(old.family_id),
      outcome: "success",
      metadata: {
        policyVersion: SESSION_POLICY_VERSION,
        previousRefreshFingerprint: fingerprintRefreshToken(old.id),
        nextSessionFingerprint: fingerprintSessionId(input.accessJti),
        deviceEvidenceFingerprint: input.deviceFingerprint,
        isNewDevice: device.is_new,
        supersededSessionCount: revokedSessions.length,
      },
    });
    return {
      result: {
        ok: true,
        refreshToken: input.preparedRefresh.token,
        refreshFamilyId: old.family_id,
        knownDeviceId: device.id,
        isNewDevice: device.is_new,
        denyCachePending: revokedSessions.length > 0,
      } as SessionRotationResult,
      revokedSessions,
    };
  });

  if (!transaction.enabled) throw new Error("db_unavailable");
  const published = await publishRevocations(transaction.value.revokedSessions);
  return {
    ...transaction.value.result,
    denyCachePending:
      transaction.value.revokedSessions.length > 0 && !published,
  } as SessionRotationResult;
}

export async function revokeExactSession(input: {
  sessionId: string;
  userId: string;
  audit: SessionAuditContext;
  action?: "session.revoke" | "session.logout";
}): Promise<SessionRevocationResult> {
  assertAuditActor(input.userId, input.audit);
  try {
    const transaction = await withTx(async (client) => {
      const selected = await client.query<SessionRow>(
        `SELECT id, refresh_family_id
           FROM user_sessions
          WHERE id = $1
            AND user_id = $2
          LIMIT 1
          FOR UPDATE`,
        [input.sessionId, input.userId],
      );
      const session = selected.rows[0];
      if (!session) return null;

      const revokedSessions = session.refresh_family_id
        ? await revokeFamilyTx(client, {
            tenantId: input.audit.tenantId,
            userId: input.userId,
            familyId: session.refresh_family_id,
          })
        : await revokeSessionIdsTx(client, {
            tenantId: input.audit.tenantId,
            userId: input.userId,
            sessionIds: [session.id],
          });
      await writeSensitiveMutationAuditTx(client, {
        ...input.audit,
        action: input.action ?? "session.revoke",
        resourceType: "auth_session",
        resourceId: fingerprintSessionId(session.id),
        outcome: "success",
        metadata: {
          policyVersion: SESSION_POLICY_VERSION,
          refreshFamilyFingerprint: session.refresh_family_id
            ? fingerprintRefreshFamily(session.refresh_family_id)
            : null,
          revokedSessionCount: revokedSessions.length,
        },
      });
      return revokedSessions;
    });
    if (!transaction.enabled) {
      return { ok: false, reason: "database_unavailable" };
    }
    if (!transaction.value) return { ok: false, reason: "session_not_found" };
    const published = await publishRevocations(transaction.value);
    return {
      ok: true,
      revokedCount: transaction.value.length,
      denyCachePending: transaction.value.length > 0 && !published,
    };
  } catch {
    return { ok: false, reason: "database_unavailable" };
  }
}

export async function revokeAllUserSessions(input: {
  userId: string;
  exceptSessionId?: string;
  audit: SessionAuditContext;
}): Promise<SessionRevocationResult> {
  assertAuditActor(input.userId, input.audit);
  try {
    const transaction = await withTx(async (client) => {
      const exceptSql = input.exceptSessionId ? "AND id <> $2" : "";
      const values = input.exceptSessionId
        ? [input.userId, input.exceptSessionId]
        : [input.userId];
      await client.query(
        `UPDATE user_sessions
            SET is_revoked = TRUE,
                revoked_at = COALESCE(revoked_at, NOW())
          WHERE user_id = $1
            ${exceptSql}
            AND is_revoked = FALSE`,
        values,
      );
      await client.query(
        `UPDATE refresh_tokens
            SET is_revoked = TRUE,
                revoked_at = COALESCE(revoked_at, NOW())
          WHERE user_id = $1
            AND is_revoked = FALSE`,
        [input.userId],
      );
      const sessions = await collectRevokedSessionsTx(client, {
        userId: input.userId,
        conditionSql: input.exceptSessionId ? "id <> $2" : "TRUE",
        values: input.exceptSessionId ? [input.exceptSessionId] : [],
      });
      await enqueueRevocationsTx(
        client,
        input.audit.tenantId,
        input.userId,
        sessions,
      );
      await writeSensitiveMutationAuditTx(client, {
        ...input.audit,
        action: "session.revoke_all",
        resourceType: "auth_session",
        resourceId: fingerprint("principal-sessions", input.userId),
        outcome: "success",
        metadata: {
          policyVersion: SESSION_POLICY_VERSION,
          revokedSessionCount: sessions.length,
          currentAccessRetained: Boolean(input.exceptSessionId),
          refreshScope: "all_user_tokens",
        },
      });
      return sessions;
    });
    if (!transaction.enabled) {
      return { ok: false, reason: "database_unavailable" };
    }
    const published = await publishRevocations(transaction.value);
    return {
      ok: true,
      revokedCount: transaction.value.length,
      denyCachePending: transaction.value.length > 0 && !published,
    };
  } catch {
    return { ok: false, reason: "database_unavailable" };
  }
}

export async function listKnownDevicesStrict(
  userId: string,
): Promise<KnownDeviceView[]> {
  const result = await withDb(async (client) => {
    const rows = await client.query<{
      id: string;
      device_name: string | null;
      first_seen_at: Date;
      last_seen_at: Date;
    }>(
      `SELECT id, device_name, first_seen_at, last_seen_at
         FROM known_devices
        WHERE user_id = $1
          AND is_active = TRUE
        ORDER BY last_seen_at DESC
        LIMIT 50`,
      [userId],
    );
    return rows.rows.map((row) => ({
      id: row.id,
      deviceName: row.device_name ?? "Unknown Device",
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
    }));
  });
  if (!result.enabled) throw new Error("db_unavailable");
  return result.value;
}

export async function renameKnownDevice(input: {
  id: string;
  userId: string;
  name: string;
  audit: SessionAuditContext;
}): Promise<DeviceMutationResult> {
  assertAuditActor(input.userId, input.audit);
  try {
    const result = await withTx(async (client) => {
      const selected = await client.query<{
        id: string;
        device_name: string | null;
      }>(
        `SELECT id, device_name
           FROM known_devices
          WHERE id = $1
            AND user_id = $2
            AND is_active = TRUE
          LIMIT 1
          FOR UPDATE`,
        [input.id, input.userId],
      );
      const device = selected.rows[0];
      if (!device) return null;
      const name = input.name.trim().slice(0, 100);
      await client.query(
        `UPDATE known_devices
            SET device_name = $1,
                last_seen_at = NOW()
          WHERE id = $2`,
        [name, device.id],
      );
      await writeSensitiveMutationAuditTx(client, {
        ...input.audit,
        action: "device.rename",
        resourceType: "known_device",
        resourceId: fingerprint("known-device", device.id),
        outcome: "success",
        metadata: {
          policyVersion: SESSION_POLICY_VERSION,
          previousLabelFingerprint: fingerprintLabel(device.device_name ?? ""),
          nextLabelFingerprint: fingerprintLabel(name),
        },
      });
      return true;
    });
    if (!result.enabled) return { ok: false, reason: "database_unavailable" };
    if (!result.value) return { ok: false, reason: "device_not_found" };
    return { ok: true, revokedCount: 0, denyCachePending: false };
  } catch {
    return { ok: false, reason: "database_unavailable" };
  }
}

export async function removeKnownDevice(input: {
  id: string;
  userId: string;
  audit: SessionAuditContext;
}): Promise<DeviceMutationResult> {
  assertAuditActor(input.userId, input.audit);
  try {
    const transaction = await withTx(async (client) => {
      const selected = await client.query<{ id: string }>(
        `SELECT id
           FROM known_devices
          WHERE id = $1
            AND user_id = $2
            AND is_active = TRUE
          LIMIT 1
          FOR UPDATE`,
        [input.id, input.userId],
      );
      const device = selected.rows[0];
      if (!device) return null;
      await client.query(
        `UPDATE known_devices
            SET is_active = FALSE,
                removed_at = NOW()
          WHERE id = $1`,
        [device.id],
      );
      await client.query(
        `UPDATE refresh_tokens
            SET is_revoked = TRUE,
                revoked_at = COALESCE(revoked_at, NOW())
          WHERE user_id = $1
            AND known_device_id = $2
            AND is_revoked = FALSE`,
        [input.userId, device.id],
      );
      await client.query(
        `UPDATE user_sessions
            SET is_revoked = TRUE,
                revoked_at = COALESCE(revoked_at, NOW())
          WHERE user_id = $1
            AND known_device_id = $2
            AND is_revoked = FALSE`,
        [input.userId, device.id],
      );
      const sessions = await collectRevokedSessionsTx(client, {
        userId: input.userId,
        conditionSql: "known_device_id = $2",
        values: [device.id],
      });
      await enqueueRevocationsTx(
        client,
        input.audit.tenantId,
        input.userId,
        sessions,
      );
      await writeSensitiveMutationAuditTx(client, {
        ...input.audit,
        action: "device.remove",
        resourceType: "known_device",
        resourceId: fingerprint("known-device", device.id),
        outcome: "success",
        metadata: {
          policyVersion: SESSION_POLICY_VERSION,
          revokedSessionCount: sessions.length,
          refreshScope: "device_bound_families",
        },
      });
      return sessions;
    });
    if (!transaction.enabled) {
      return { ok: false, reason: "database_unavailable" };
    }
    if (!transaction.value) return { ok: false, reason: "device_not_found" };
    const published = await publishRevocations(transaction.value);
    return {
      ok: true,
      revokedCount: transaction.value.length,
      denyCachePending: transaction.value.length > 0 && !published,
    };
  } catch {
    return { ok: false, reason: "database_unavailable" };
  }
}

export async function repairPendingSessionRevocations(
  limit = 200,
): Promise<{ selected: number; published: number }> {
  const selected = await withDb(async (client) => {
    const rows = await client.query<{
      session_jti: string;
      expires_at: Date;
    }>(
      `SELECT session_jti, expires_at
         FROM session_revocation_outbox
        WHERE status = 'pending'
          AND expires_at > NOW()
        ORDER BY created_at, id
        LIMIT $1`,
      [Math.max(1, Math.min(limit, 1_000))],
    );
    return rows.rows.map((row) => ({
      jti: row.session_jti,
      expiresAt: Math.floor(row.expires_at.getTime() / 1000),
    }));
  });
  if (!selected.enabled) throw new Error("db_unavailable");
  if (selected.value.length === 0) return { selected: 0, published: 0 };
  const published = await publishRevocations(selected.value);
  return {
    selected: selected.value.length,
    published: published ? selected.value.length : 0,
  };
}
