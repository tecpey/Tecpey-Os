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
const OUTBOX_BATCH_LIMIT = 200;

export type SessionAuditContext = Pick<
  SensitiveMutationAuditEvent,
  "tenantId" | "actorType" | "actorId" | "correlationId" | "requestHash"
>;

export type SessionSystemAuditContext = Pick<
  SensitiveMutationAuditEvent,
  "tenantId" | "correlationId" | "requestHash"
>;

export type PreparedAccessSession = {
  jti: string;
  userId: string;
  expiresAt: Date;
};

export type KnownDeviceView = {
  id: string;
  deviceName: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  isActive: boolean;
};

type RefreshClaims = {
  userId: string;
  jti: string;
  familyId: string;
};

type RefreshRow = {
  id: string;
  family_id: string;
  user_id: string;
  is_revoked: boolean;
  expires_at: Date;
  known_device_id: string | null;
};

type FamilyRow = {
  id: string;
  user_id: string;
  known_device_id: string | null;
  status: "active" | "revoked";
};

type DeviceRow = {
  id: string;
  fingerprint: string;
  is_active: boolean;
};

type RevocationEvidence = {
  jti: string;
  expiresAt: Date;
};

type AuthorityRevocation = {
  sessionCount: number;
  refreshCount: number;
  familyCount: number;
  outboxCount: number;
};

function authorityFingerprint(domain: string, value: string): string {
  return createHash("sha256")
    .update(`tecpey-${domain}-v1\0`)
    .update(value)
    .digest("hex");
}

export function fingerprintSessionAuthority(jti: string): string {
  return authorityFingerprint("auth-session", jti);
}

export function fingerprintRefreshFamily(familyId: string): string {
  return authorityFingerprint("refresh-family", familyId);
}

export function fingerprintKnownDevice(deviceId: string): string {
  return authorityFingerprint("known-device", deviceId);
}

export function sessionDeviceFingerprint(deviceInfo: string): string {
  return authorityFingerprint(
    "session-device",
    deviceInfo.trim().toLowerCase().slice(0, 500),
  );
}

function labelFingerprint(label: string): string {
  return authorityFingerprint("device-label", label);
}

function assertUserAudit(userId: string, audit: SessionAuditContext): void {
  if (!userId || audit.actorId !== userId) {
    throw new Error("session_audit_actor_mismatch");
  }
  if (!["student", "user", "admin"].includes(audit.actorType)) {
    throw new Error("session_audit_actor_type_invalid");
  }
}

function refreshSigningKey(): Uint8Array | null {
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

async function verifyRefreshClaims(token: string): Promise<RefreshClaims | null> {
  const secret = refreshSigningKey();
  if (!secret || !token || token.length > 8_192) return null;
  try {
    const verified = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const payload = verified.payload;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.jti !== "string" ||
      typeof payload.fid !== "string" ||
      payload.v !== 1
    ) {
      return null;
    }
    return {
      userId: payload.sub,
      jti: payload.jti,
      familyId: payload.fid,
    };
  } catch {
    return null;
  }
}

async function upsertKnownDeviceTx(
  client: PoolClient,
  input: { userId: string; fingerprint: string },
): Promise<{ id: string; isNew: boolean }> {
  const existing = await client.query<DeviceRow>(
    `SELECT id, fingerprint, is_active
       FROM known_devices
      WHERE user_id = $1
        AND fingerprint = $2
      LIMIT 1
      FOR UPDATE`,
    [input.userId, input.fingerprint],
  );
  const row = existing.rows[0];
  if (row) {
    await client.query(
      `UPDATE known_devices
          SET last_seen_at = NOW(),
              updated_at = NOW(),
              is_active = TRUE,
              removed_at = NULL
        WHERE id = $1`,
      [row.id],
    );
    return { id: row.id, isNew: !row.is_active };
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO known_devices
       (user_id, fingerprint, first_seen_at, last_seen_at, is_active, updated_at)
     VALUES ($1, $2, NOW(), NOW(), TRUE, NOW())
     ON CONFLICT (user_id, fingerprint) DO UPDATE
       SET last_seen_at = NOW(),
           updated_at = NOW(),
           is_active = TRUE,
           removed_at = NULL
     RETURNING id`,
    [input.userId, input.fingerprint],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error("known_device_admission_failed");
  return { id, isNew: true };
}

async function insertRefreshFamilyTx(
  client: PoolClient,
  input: { familyId: string; userId: string; knownDeviceId: string },
): Promise<void> {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO refresh_token_families
       (id, user_id, known_device_id, status, created_at, last_rotated_at)
     VALUES ($1, $2, $3, 'active', NOW(), NOW())
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [input.familyId, input.userId, input.knownDeviceId],
  );
  if (!inserted.rows[0]?.id) throw new Error("refresh_family_conflict");
}

async function insertPreparedRefreshTx(
  client: PoolClient,
  prepared: PreparedRefreshToken,
  knownDeviceId: string,
): Promise<void> {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO refresh_tokens
       (id, family_id, user_id, parent_id, device_info, ip, expires_at,
        known_device_id)
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
    access: PreparedAccessSession;
    deviceInfo: string;
    ip: string;
    familyId: string;
    knownDeviceId: string;
  },
): Promise<void> {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO user_sessions
       (id, user_id, device_info, ip, expires_at, refresh_family_id,
        known_device_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [
      input.access.jti,
      input.access.userId,
      input.deviceInfo.slice(0, 500),
      input.ip.slice(0, 80),
      input.access.expiresAt,
      input.familyId,
      input.knownDeviceId,
    ],
  );
  if (!inserted.rows[0]?.id) throw new Error("access_jti_conflict");
}

async function enqueueRevocationsTx(
  client: PoolClient,
  sessions: RevocationEvidence[],
): Promise<number> {
  let count = 0;
  for (const session of sessions) {
    const inserted = await client.query(
      `INSERT INTO session_revocation_outbox
         (session_jti, expires_at, status, attempt_count, updated_at)
       VALUES ($1, $2, 'pending', 0, NOW())
       ON CONFLICT (session_jti) DO UPDATE
         SET expires_at = GREATEST(session_revocation_outbox.expires_at, EXCLUDED.expires_at),
             status = 'pending',
             updated_at = NOW(),
             published_at = NULL`,
      [session.jti, session.expiresAt],
    );
    count += inserted.rowCount ?? 0;
  }
  return count;
}

async function revokeFamiliesTx(
  client: PoolClient,
  input: {
    userId: string;
    familyIds: string[];
    reason: string;
  },
): Promise<AuthorityRevocation> {
  const familyIds = [...new Set(input.familyIds.filter(Boolean))];
  if (familyIds.length === 0) {
    return { sessionCount: 0, refreshCount: 0, familyCount: 0, outboxCount: 0 };
  }

  const families = await client.query(
    `UPDATE refresh_token_families
        SET status = 'revoked',
            revoked_at = COALESCE(revoked_at, NOW()),
            revoke_reason = COALESCE(revoke_reason, $3)
      WHERE user_id = $1
        AND id = ANY($2::text[])`,
    [input.userId, familyIds, input.reason],
  );
  const refresh = await client.query(
    `UPDATE refresh_tokens
        SET is_revoked = TRUE,
            revoked_at = COALESCE(revoked_at, NOW())
      WHERE user_id = $1
        AND family_id = ANY($2::text[])
        AND is_revoked = FALSE`,
    [input.userId, familyIds],
  );
  const sessions = await client.query<{ id: string; expires_at: Date }>(
    `UPDATE user_sessions
        SET is_revoked = TRUE,
            revoked_at = COALESCE(revoked_at, NOW())
      WHERE user_id = $1
        AND refresh_family_id = ANY($2::text[])
        AND is_revoked = FALSE
      RETURNING id, expires_at`,
    [input.userId, familyIds],
  );
  const evidence = sessions.rows.map((row) => ({
    jti: row.id,
    expiresAt: row.expires_at,
  }));
  const outboxCount = await enqueueRevocationsTx(client, evidence);
  return {
    sessionCount: sessions.rowCount ?? 0,
    refreshCount: refresh.rowCount ?? 0,
    familyCount: families.rowCount ?? 0,
    outboxCount,
  };
}

async function revokeUnboundSessionsTx(
  client: PoolClient,
  input: { userId: string; sessionIds: string[] },
): Promise<{ sessionCount: number; outboxCount: number }> {
  const sessionIds = [...new Set(input.sessionIds.filter(Boolean))];
  if (sessionIds.length === 0) return { sessionCount: 0, outboxCount: 0 };
  const sessions = await client.query<{ id: string; expires_at: Date }>(
    `UPDATE user_sessions
        SET is_revoked = TRUE,
            revoked_at = COALESCE(revoked_at, NOW())
      WHERE user_id = $1
        AND id = ANY($2::text[])
        AND is_revoked = FALSE
      RETURNING id, expires_at`,
    [input.userId, sessionIds],
  );
  const outboxCount = await enqueueRevocationsTx(
    client,
    sessions.rows.map((row) => ({ jti: row.id, expiresAt: row.expires_at })),
  );
  return { sessionCount: sessions.rowCount ?? 0, outboxCount };
}

export async function admitSessionAuthority(input: {
  userId: string;
  access: PreparedAccessSession;
  refresh: PreparedRefreshToken;
  deviceInfo: string;
  ip: string;
  method: "password" | "password_2fa" | "webauthn";
  audit: SessionAuditContext;
}): Promise<{
  refreshToken: string;
  knownDeviceId: string;
  isNewDevice: boolean;
}> {
  assertUserAudit(input.userId, input.audit);
  if (
    input.access.userId !== input.userId ||
    input.refresh.userId !== input.userId ||
    input.refresh.parentId !== null
  ) {
    throw new Error("session_admission_binding_mismatch");
  }
  const fingerprint = sessionDeviceFingerprint(input.deviceInfo);
  const result = await withTx(async (client) => {
    const device = await upsertKnownDeviceTx(client, {
      userId: input.userId,
      fingerprint,
    });
    await insertRefreshFamilyTx(client, {
      familyId: input.refresh.familyId,
      userId: input.userId,
      knownDeviceId: device.id,
    });
    await insertPreparedRefreshTx(client, input.refresh, device.id);
    await insertAccessSessionTx(client, {
      access: input.access,
      deviceInfo: input.deviceInfo,
      ip: input.ip,
      familyId: input.refresh.familyId,
      knownDeviceId: device.id,
    });
    await writeSensitiveMutationAuditTx(client, {
      ...input.audit,
      action: "session.issue",
      resourceType: "refresh_family",
      resourceId: fingerprintRefreshFamily(input.refresh.familyId),
      outcome: "success",
      metadata: {
        policyVersion: SESSION_POLICY_VERSION,
        method: input.method,
        deviceFingerprint: fingerprint,
        isNewDevice: device.isNew,
        accessLifetimeSeconds: Math.max(
          0,
          Math.floor((input.access.expiresAt.getTime() - Date.now()) / 1000),
        ),
        refreshLifetimeSeconds: Math.max(
          0,
          Math.floor((input.refresh.expiresAt.getTime() - Date.now()) / 1000),
        ),
      },
    });
    return {
      refreshToken: input.refresh.token,
      knownDeviceId: device.id,
      isNewDevice: device.isNew,
    };
  });
  if (!result.enabled) throw new Error("database_unavailable");
  return result.value;
}

export type RefreshRotationResult =
  | {
      ok: true;
      userId: string;
      refreshToken: string;
      isNewDevice: boolean;
    }
  | {
      ok: false;
      reason:
        | "invalid_token"
        | "token_not_found"
        | "token_expired"
        | "token_reused"
        | "token_binding_mismatch";
      userId?: string;
      revocationPending?: boolean;
    };

export async function rotateSessionAuthority(input: {
  rawRefreshToken: string;
  access: PreparedAccessSession;
  replacement: PreparedRefreshToken;
  deviceInfo: string;
  ip: string;
  audit: SessionSystemAuditContext;
}): Promise<RefreshRotationResult> {
  const claims = await verifyRefreshClaims(input.rawRefreshToken);
  if (!claims) return { ok: false, reason: "invalid_token" };
  const fingerprint = sessionDeviceFingerprint(input.deviceInfo);

  const result = await withTx(async (client) => {
    const refreshResult = await client.query<RefreshRow>(
      `SELECT id, family_id, user_id, is_revoked, expires_at, known_device_id
         FROM refresh_tokens
        WHERE id = $1
        LIMIT 1
        FOR UPDATE`,
      [claims.jti],
    );
    const refresh = refreshResult.rows[0];
    if (!refresh) return { ok: false, reason: "token_not_found" } as const;

    const familyResult = await client.query<FamilyRow>(
      `SELECT id, user_id, known_device_id, status
         FROM refresh_token_families
        WHERE id = $1
        LIMIT 1
        FOR UPDATE`,
      [refresh.family_id],
    );
    const family = familyResult.rows[0];
    if (!family) throw new Error("refresh_family_missing");

    const actor = refresh.user_id;
    const familyFingerprint = fingerprintRefreshFamily(refresh.family_id);
    const bindingMismatch =
      claims.userId !== refresh.user_id ||
      claims.familyId !== refresh.family_id ||
      family.user_id !== refresh.user_id;

    const device = family.known_device_id
      ? await client.query<DeviceRow>(
          `SELECT id, fingerprint, is_active
             FROM known_devices
            WHERE id = $1
            LIMIT 1
            FOR UPDATE`,
          [family.known_device_id],
        ).then((query) => query.rows[0] ?? null)
      : null;
    const deviceMismatch = Boolean(
      device && (!device.is_active || device.fingerprint !== fingerprint),
    );

    if (refresh.is_revoked || family.status === "revoked" || bindingMismatch || deviceMismatch) {
      const reason = bindingMismatch || deviceMismatch
        ? "token_binding_mismatch"
        : "token_reused";
      await revokeFamiliesTx(client, {
        userId: actor,
        familyIds: [refresh.family_id],
        reason,
      });
      await writeSensitiveMutationAuditTx(client, {
        ...input.audit,
        actorType: "user",
        actorId: actor,
        action: "session.refresh.reuse_detected",
        resourceType: "refresh_family",
        resourceId: familyFingerprint,
        outcome: "rejected",
        metadata: {
          policyVersion: SESSION_POLICY_VERSION,
          reason,
          deviceFingerprint: fingerprint,
          bindingMismatch,
          deviceMismatch,
          familyAlreadyRevoked: family.status === "revoked",
        },
      });
      return { ok: false, reason, userId: actor } as const;
    }

    if (refresh.expires_at.getTime() <= Date.now()) {
      await writeSensitiveMutationAuditTx(client, {
        ...input.audit,
        actorType: "user",
        actorId: actor,
        action: "session.refresh.rotate",
        resourceType: "refresh_family",
        resourceId: familyFingerprint,
        outcome: "rejected",
        metadata: {
          policyVersion: SESSION_POLICY_VERSION,
          reason: "token_expired",
          deviceFingerprint: fingerprint,
        },
      });
      return { ok: false, reason: "token_expired", userId: actor } as const;
    }

    if (
      input.access.userId !== actor ||
      input.replacement.userId !== actor ||
      input.replacement.familyId !== refresh.family_id ||
      input.replacement.parentId !== refresh.id
    ) {
      throw new Error("refresh_rotation_preparation_mismatch");
    }

    let knownDeviceId: string;
    if (!device) {
      const created = await upsertKnownDeviceTx(client, {
        userId: actor,
        fingerprint,
      });
      knownDeviceId = created.id;
      await client.query(
        `UPDATE refresh_token_families
            SET known_device_id = $1
          WHERE id = $2`,
        [knownDeviceId, family.id],
      );
    } else {
      knownDeviceId = device.id;
      await client.query(
        `UPDATE known_devices
            SET last_seen_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [knownDeviceId],
      );
    }

    const revoked = await client.query(
      `UPDATE refresh_tokens
          SET is_revoked = TRUE,
              revoked_at = NOW()
        WHERE id = $1
          AND is_revoked = FALSE`,
      [refresh.id],
    );
    if ((revoked.rowCount ?? 0) !== 1) {
      throw new Error("refresh_rotation_lost_lock");
    }

    await insertPreparedRefreshTx(client, input.replacement, knownDeviceId);
    await insertAccessSessionTx(client, {
      access: input.access,
      deviceInfo: input.deviceInfo,
      ip: input.ip,
      familyId: refresh.family_id,
      knownDeviceId,
    });
    await client.query(
      `UPDATE refresh_token_families
          SET last_rotated_at = NOW()
        WHERE id = $1`,
      [family.id],
    );
    await writeSensitiveMutationAuditTx(client, {
      ...input.audit,
      actorType: "user",
      actorId: actor,
      action: "session.refresh.rotate",
      resourceType: "refresh_family",
      resourceId: familyFingerprint,
      outcome: "success",
      metadata: {
        policyVersion: SESSION_POLICY_VERSION,
        deviceFingerprint: fingerprint,
        accessLifetimeSeconds: Math.max(
          0,
          Math.floor((input.access.expiresAt.getTime() - Date.now()) / 1000),
        ),
        refreshLifetimeSeconds: Math.max(
          0,
          Math.floor((input.replacement.expiresAt.getTime() - Date.now()) / 1000),
        ),
      },
    });
    return {
      ok: true,
      userId: actor,
      refreshToken: input.replacement.token,
      isNewDevice: false,
    } as const;
  });
  if (!result.enabled) throw new Error("database_unavailable");
  if (!result.value.ok && result.value.reason !== "token_expired") {
    const published = await publishPendingSessionRevocations();
    return { ...result.value, revocationPending: !published };
  }
  return result.value;
}

async function revokeSelectedSessionTx(
  client: PoolClient,
  input: { userId: string; sessionJti: string; reason: string },
): Promise<AuthorityRevocation | null> {
  const selected = await client.query<{
    id: string;
    refresh_family_id: string | null;
  }>(
    `SELECT id, refresh_family_id
       FROM user_sessions
      WHERE id = $1
        AND user_id = $2
      LIMIT 1
      FOR UPDATE`,
    [input.sessionJti, input.userId],
  );
  const session = selected.rows[0];
  if (!session) return null;
  if (session.refresh_family_id) {
    return revokeFamiliesTx(client, {
      userId: input.userId,
      familyIds: [session.refresh_family_id],
      reason: input.reason,
    });
  }
  const unbound = await revokeUnboundSessionsTx(client, {
    userId: input.userId,
    sessionIds: [session.id],
  });
  return {
    sessionCount: unbound.sessionCount,
    refreshCount: 0,
    familyCount: 0,
    outboxCount: unbound.outboxCount,
  };
}

export async function revokeSessionAuthority(input: {
  userId: string;
  sessionJti: string;
  audit: SessionAuditContext;
}): Promise<
  | { ok: true; revocationPending: boolean; revokedCount: number }
  | { ok: false; reason: "session_not_found" }
> {
  assertUserAudit(input.userId, input.audit);
  const result = await withTx(async (client) => {
    const revoked = await revokeSelectedSessionTx(client, {
      userId: input.userId,
      sessionJti: input.sessionJti,
      reason: "session_revoked",
    });
    if (!revoked) return { ok: false, reason: "session_not_found" } as const;
    await writeSensitiveMutationAuditTx(client, {
      ...input.audit,
      action: "session.revoke",
      resourceType: "auth_session",
      resourceId: fingerprintSessionAuthority(input.sessionJti),
      outcome: "success",
      metadata: {
        policyVersion: SESSION_POLICY_VERSION,
        revokedSessionCount: revoked.sessionCount,
        revokedRefreshCount: revoked.refreshCount,
        revokedFamilyCount: revoked.familyCount,
        redisPublication: "pending",
      },
    });
    return {
      ok: true,
      revokedCount: revoked.sessionCount,
    } as const;
  });
  if (!result.enabled) throw new Error("database_unavailable");
  if (!result.value.ok) return result.value;
  const published = await publishPendingSessionRevocations();
  return { ...result.value, revocationPending: !published };
}

export async function revokeOtherSessionsAuthority(input: {
  userId: string;
  currentSessionJti: string;
  audit: SessionAuditContext;
}): Promise<{ revokedCount: number; revocationPending: boolean }> {
  assertUserAudit(input.userId, input.audit);
  const result = await withTx(async (client) => {
    const current = await client.query<{
      id: string;
      refresh_family_id: string | null;
    }>(
      `SELECT id, refresh_family_id
         FROM user_sessions
        WHERE id = $1
          AND user_id = $2
          AND is_revoked = FALSE
        LIMIT 1
        FOR UPDATE`,
      [input.currentSessionJti, input.userId],
    );
    const currentRow = current.rows[0];
    if (!currentRow) throw new Error("current_session_not_found");

    const otherSessions = await client.query<{
      id: string;
      refresh_family_id: string | null;
    }>(
      `SELECT id, refresh_family_id
         FROM user_sessions
        WHERE user_id = $1
          AND id <> $2
          AND is_revoked = FALSE
        FOR UPDATE`,
      [input.userId, input.currentSessionJti],
    );
    const familyIds = otherSessions.rows
      .map((row) => row.refresh_family_id)
      .filter((value): value is string => Boolean(value));
    const unboundIds = otherSessions.rows
      .filter((row) => !row.refresh_family_id)
      .map((row) => row.id);

    const familyRevocation = await revokeFamiliesTx(client, {
      userId: input.userId,
      familyIds,
      reason: "revoke_other_sessions",
    });
    const unbound = await revokeUnboundSessionsTx(client, {
      userId: input.userId,
      sessionIds: unboundIds,
    });

    if (!currentRow.refresh_family_id) {
      await client.query(
        `UPDATE refresh_tokens
            SET is_revoked = TRUE,
                revoked_at = COALESCE(revoked_at, NOW())
          WHERE user_id = $1
            AND is_revoked = FALSE`,
        [input.userId],
      );
      await client.query(
        `UPDATE refresh_token_families
            SET status = 'revoked',
                revoked_at = COALESCE(revoked_at, NOW()),
                revoke_reason = COALESCE(revoke_reason, 'legacy_unbound_current_session')
          WHERE user_id = $1
            AND status = 'active'`,
        [input.userId],
      );
    }

    const revokedCount = familyRevocation.sessionCount + unbound.sessionCount;
    await writeSensitiveMutationAuditTx(client, {
      ...input.audit,
      action: "session.revoke_all",
      resourceType: "auth_session",
      resourceId: fingerprintSessionAuthority(input.currentSessionJti),
      outcome: "success",
      metadata: {
        policyVersion: SESSION_POLICY_VERSION,
        revokedSessionCount: revokedCount,
        currentAccessRetained: true,
        currentFamilyRetained: Boolean(currentRow.refresh_family_id),
        redisPublication: "pending",
      },
    });
    return { revokedCount };
  });
  if (!result.enabled) throw new Error("database_unavailable");
  const published = await publishPendingSessionRevocations();
  return { ...result.value, revocationPending: !published };
}

export async function logoutSessionAuthority(input: {
  userId: string;
  currentSessionJti: string;
  audit: SessionAuditContext;
}): Promise<{ revokedCount: number; revocationPending: boolean }> {
  assertUserAudit(input.userId, input.audit);
  const result = await withTx(async (client) => {
    const revoked = await revokeSelectedSessionTx(client, {
      userId: input.userId,
      sessionJti: input.currentSessionJti,
      reason: "logout",
    });
    if (!revoked) {
      await writeSensitiveMutationAuditTx(client, {
        ...input.audit,
        action: "session.logout",
        resourceType: "auth_session",
        resourceId: fingerprintSessionAuthority(input.currentSessionJti),
        outcome: "no_op",
        metadata: {
          policyVersion: SESSION_POLICY_VERSION,
          reason: "already_logged_out",
        },
      });
      return { revokedCount: 0 };
    }
    await writeSensitiveMutationAuditTx(client, {
      ...input.audit,
      action: "session.logout",
      resourceType: "auth_session",
      resourceId: fingerprintSessionAuthority(input.currentSessionJti),
      outcome: "success",
      metadata: {
        policyVersion: SESSION_POLICY_VERSION,
        revokedSessionCount: revoked.sessionCount,
        revokedRefreshCount: revoked.refreshCount,
        revokedFamilyCount: revoked.familyCount,
        redisPublication: "pending",
      },
    });
    return { revokedCount: revoked.sessionCount };
  });
  if (!result.enabled) throw new Error("database_unavailable");
  const published = await publishPendingSessionRevocations();
  return { ...result.value, revocationPending: !published };
}

export async function listKnownDevicesAuthority(
  userId: string,
): Promise<KnownDeviceView[]> {
  const result = await withDb(async (client) => {
    const rows = await client.query<{
      id: string;
      device_name: string | null;
      first_seen_at: Date;
      last_seen_at: Date;
      is_active: boolean;
    }>(
      `SELECT id, device_name, first_seen_at, last_seen_at, is_active
         FROM known_devices
        WHERE user_id = $1
          AND is_active = TRUE
        ORDER BY last_seen_at DESC
        LIMIT 50`,
      [userId],
    );
    return rows.rows.map((row) => ({
      id: row.id,
      deviceName: row.device_name,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      isActive: row.is_active,
    }));
  });
  if (!result.enabled) throw new Error("database_unavailable");
  return result.value;
}

export async function renameKnownDeviceAuthority(input: {
  userId: string;
  deviceId: string;
  name: string;
  audit: SessionAuditContext;
}): Promise<{ ok: true } | { ok: false; reason: "device_not_found" }> {
  assertUserAudit(input.userId, input.audit);
  const name = input.name.trim().slice(0, 100);
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
      [input.deviceId, input.userId],
    );
    const device = selected.rows[0];
    if (!device) return { ok: false, reason: "device_not_found" } as const;
    await client.query(
      `UPDATE known_devices
          SET device_name = $1, updated_at = NOW()
        WHERE id = $2`,
      [name, device.id],
    );
    await writeSensitiveMutationAuditTx(client, {
      ...input.audit,
      action: "device.rename",
      resourceType: "known_device",
      resourceId: fingerprintKnownDevice(device.id),
      outcome: "success",
      metadata: {
        policyVersion: SESSION_POLICY_VERSION,
        previousLabelFingerprint: labelFingerprint(device.device_name ?? ""),
        nextLabelFingerprint: labelFingerprint(name),
      },
    });
    return { ok: true } as const;
  });
  if (!result.enabled) throw new Error("database_unavailable");
  return result.value;
}

export async function removeKnownDeviceAuthority(input: {
  userId: string;
  deviceId: string;
  audit: SessionAuditContext;
}): Promise<
  | { ok: true; revokedCount: number; revocationPending: boolean }
  | { ok: false; reason: "device_not_found" }
> {
  assertUserAudit(input.userId, input.audit);
  const result = await withTx(async (client) => {
    const selected = await client.query<{ id: string }>(
      `SELECT id
         FROM known_devices
        WHERE id = $1
          AND user_id = $2
          AND is_active = TRUE
        LIMIT 1
        FOR UPDATE`,
      [input.deviceId, input.userId],
    );
    const device = selected.rows[0];
    if (!device) return { ok: false, reason: "device_not_found" } as const;
    const families = await client.query<{ id: string }>(
      `SELECT id
         FROM refresh_token_families
        WHERE user_id = $1
          AND known_device_id = $2
        FOR UPDATE`,
      [input.userId, device.id],
    );
    const revoked = await revokeFamiliesTx(client, {
      userId: input.userId,
      familyIds: families.rows.map((row) => row.id),
      reason: "device_removed",
    });
    const unboundSessions = await client.query<{ id: string }>(
      `SELECT id
         FROM user_sessions
        WHERE user_id = $1
          AND known_device_id = $2
          AND refresh_family_id IS NULL
          AND is_revoked = FALSE
        FOR UPDATE`,
      [input.userId, device.id],
    );
    const unbound = await revokeUnboundSessionsTx(client, {
      userId: input.userId,
      sessionIds: unboundSessions.rows.map((row) => row.id),
    });
    await client.query(
      `UPDATE known_devices
          SET is_active = FALSE,
              removed_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [device.id],
    );
    const revokedCount = revoked.sessionCount + unbound.sessionCount;
    await writeSensitiveMutationAuditTx(client, {
      ...input.audit,
      action: "device.remove",
      resourceType: "known_device",
      resourceId: fingerprintKnownDevice(device.id),
      outcome: "success",
      metadata: {
        policyVersion: SESSION_POLICY_VERSION,
        revokedSessionCount: revokedCount,
        revokedRefreshCount: revoked.refreshCount,
        revokedFamilyCount: revoked.familyCount,
        redisPublication: "pending",
      },
    });
    return { ok: true, revokedCount } as const;
  });
  if (!result.enabled) throw new Error("database_unavailable");
  if (!result.value.ok) return result.value;
  const published = await publishPendingSessionRevocations();
  return { ...result.value, revocationPending: !published };
}

export async function publishPendingSessionRevocations(
  limit = OUTBOX_BATCH_LIMIT,
): Promise<boolean> {
  const boundedLimit = Math.max(1, Math.min(limit, OUTBOX_BATCH_LIMIT));
  const pending = await withDb(async (client) => {
    const rows = await client.query<{
      session_jti: string;
      expires_at: Date;
    }>(
      `SELECT session_jti, expires_at
         FROM session_revocation_outbox
        WHERE status = 'pending'
        ORDER BY updated_at, created_at
        LIMIT $1`,
      [boundedLimit],
    );
    return rows.rows;
  });
  if (!pending.enabled) return false;
  if (pending.value.length === 0) return true;

  const published = await revokeMultiple(
    pending.value.map((row) => ({
      jti: row.session_jti,
      expiresAt: Math.floor(row.expires_at.getTime() / 1000),
    })),
  );

  const updated = await withDb(async (client) => {
    const ids = pending.value.map((row) => row.session_jti);
    if (published) {
      await client.query(
        `UPDATE session_revocation_outbox
            SET status = 'published',
                attempt_count = attempt_count + 1,
                last_error = NULL,
                updated_at = NOW(),
                published_at = NOW()
          WHERE session_jti = ANY($1::text[])
            AND status = 'pending'`,
        [ids],
      );
    } else {
      await client.query(
        `UPDATE session_revocation_outbox
            SET attempt_count = attempt_count + 1,
                last_error = 'redis_unavailable',
                updated_at = NOW()
          WHERE session_jti = ANY($1::text[])
            AND status = 'pending'`,
        [ids],
      );
    }
    return true;
  });
  return published && updated.enabled;
}
