import { createHash } from "node:crypto";
import { withTx } from "@/lib/db";
import {
  decryptTotpSecret,
  findBackupCode,
  verifyTotp,
} from "@/lib/security/totp";
import {
  writeSensitiveMutationAuditTx,
  type SensitiveMutationAuditEvent,
} from "@/lib/security/sensitive-mutation-audit";

export type TwoFactorAuditContext = Pick<
  SensitiveMutationAuditEvent,
  "tenantId" | "actorType" | "actorId" | "correlationId" | "requestHash"
>;

export type TwoFactorMutationResult =
  | { ok: true; status: "started" | "enabled" | "disabled"; remainingCodes?: number }
  | {
      ok: false;
      status:
        | "already_enabled"
        | "not_started"
        | "not_enabled"
        | "invalid_code"
        | "secret_corrupt";
    };

type TwoFactorRow = {
  encrypted_secret: string;
  backup_code_hashes: string[];
  enabled: boolean;
};

function assertAuditActor(userId: string, audit: TwoFactorAuditContext): void {
  if (!userId || audit.actorId !== userId) {
    throw new Error("two_factor_audit_actor_mismatch");
  }
  if (!["student", "user", "admin"].includes(audit.actorType)) {
    throw new Error("two_factor_audit_actor_type_invalid");
  }
}

export function fingerprintTwoFactorGeneration(input: {
  encryptedSecret: string;
  backupCodeHashes: string[];
}): string {
  return createHash("sha256")
    .update("tecpey-2fa-generation-v1\0")
    .update(input.encryptedSecret)
    .update("\0")
    .update([...input.backupCodeHashes].sort().join("\0"))
    .digest("hex");
}

export async function startTwoFactorEnrollment(input: {
  userId: string;
  encryptedSecret: string;
  backupCodeHashes: string[];
  audit: TwoFactorAuditContext;
}): Promise<TwoFactorMutationResult> {
  assertAuditActor(input.userId, input.audit);
  const generationFingerprint = fingerprintTwoFactorGeneration(input);

  const result = await withTx(async (client) => {
    const existing = await client.query<{ enabled: boolean }>(
      `SELECT enabled
         FROM user_2fa
        WHERE user_id = $1
        FOR UPDATE`,
      [input.userId],
    );
    if (existing.rows[0]?.enabled) {
      return { ok: false, status: "already_enabled" } as const;
    }

    await client.query(
      `INSERT INTO user_2fa
         (user_id, encrypted_secret, backup_code_hashes, enabled)
       VALUES ($1, $2, $3, FALSE)
       ON CONFLICT (user_id) DO UPDATE
         SET encrypted_secret = EXCLUDED.encrypted_secret,
             backup_code_hashes = EXCLUDED.backup_code_hashes,
             enabled = FALSE,
             enabled_at = NULL,
             last_used_at = NULL`,
      [input.userId, input.encryptedSecret, input.backupCodeHashes],
    );

    await writeSensitiveMutationAuditTx(client, {
      ...input.audit,
      action: "credential.2fa.enroll.start",
      resourceType: "credential_2fa",
      resourceId: input.userId,
      outcome: "success",
      metadata: {
        policyVersion: "2fa-lifecycle-v1",
        factorGenerationFingerprint: generationFingerprint,
        backupCodeCount: input.backupCodeHashes.length,
      },
    });

    return { ok: true, status: "started" } as const;
  });

  if (!result.enabled) throw new Error("db_unavailable");
  return result.value;
}

export async function enableTwoFactor(input: {
  userId: string;
  code: string;
  audit: TwoFactorAuditContext;
}): Promise<TwoFactorMutationResult> {
  assertAuditActor(input.userId, input.audit);

  const result = await withTx(async (client) => {
    const rowResult = await client.query<TwoFactorRow>(
      `SELECT encrypted_secret, backup_code_hashes, enabled
         FROM user_2fa
        WHERE user_id = $1
        FOR UPDATE`,
      [input.userId],
    );
    const row = rowResult.rows[0];
    if (!row) return { ok: false, status: "not_started" } as const;
    if (row.enabled) return { ok: false, status: "already_enabled" } as const;

    let rawSecret: string;
    try {
      rawSecret = decryptTotpSecret(row.encrypted_secret);
    } catch {
      return { ok: false, status: "secret_corrupt" } as const;
    }

    if (!verifyTotp(rawSecret, input.code)) {
      await writeSensitiveMutationAuditTx(client, {
        ...input.audit,
        action: "credential.2fa.enable",
        resourceType: "credential_2fa",
        resourceId: input.userId,
        outcome: "rejected",
        metadata: {
          policyVersion: "2fa-lifecycle-v1",
          reason: "invalid_totp",
        },
      });
      return { ok: false, status: "invalid_code" } as const;
    }

    await client.query(
      `UPDATE user_2fa
          SET enabled = TRUE,
              enabled_at = NOW(),
              last_used_at = NOW()
        WHERE user_id = $1`,
      [input.userId],
    );
    await writeSensitiveMutationAuditTx(client, {
      ...input.audit,
      action: "credential.2fa.enable",
      resourceType: "credential_2fa",
      resourceId: input.userId,
      outcome: "success",
      metadata: {
        policyVersion: "2fa-lifecycle-v1",
        backupCodeCount: row.backup_code_hashes.length,
      },
    });
    return { ok: true, status: "enabled" } as const;
  });

  if (!result.enabled) throw new Error("db_unavailable");
  return result.value;
}

export async function disableTwoFactor(input: {
  userId: string;
  code: string | null;
  adminOverride: boolean;
  audit: TwoFactorAuditContext;
}): Promise<TwoFactorMutationResult> {
  assertAuditActor(input.userId, input.audit);
  if (input.adminOverride && input.audit.actorType !== "admin") {
    throw new Error("two_factor_admin_override_forbidden");
  }

  const result = await withTx(async (client) => {
    const rowResult = await client.query<TwoFactorRow>(
      `SELECT encrypted_secret, backup_code_hashes, enabled
         FROM user_2fa
        WHERE user_id = $1
        FOR UPDATE`,
      [input.userId],
    );
    const row = rowResult.rows[0];
    if (!row?.enabled) return { ok: false, status: "not_enabled" } as const;

    if (!input.adminOverride) {
      let rawSecret: string;
      try {
        rawSecret = decryptTotpSecret(row.encrypted_secret);
      } catch {
        return { ok: false, status: "secret_corrupt" } as const;
      }
      if (!input.code || !verifyTotp(rawSecret, input.code)) {
        await writeSensitiveMutationAuditTx(client, {
          ...input.audit,
          action: "credential.2fa.disable",
          resourceType: "credential_2fa",
          resourceId: input.userId,
          outcome: "rejected",
          metadata: {
            policyVersion: "2fa-lifecycle-v1",
            reason: "invalid_totp",
            adminOverride: false,
          },
        });
        return { ok: false, status: "invalid_code" } as const;
      }
    }

    await client.query(
      `UPDATE user_2fa
          SET enabled = FALSE,
              enabled_at = NULL,
              last_used_at = NOW()
        WHERE user_id = $1`,
      [input.userId],
    );
    await writeSensitiveMutationAuditTx(client, {
      ...input.audit,
      action: "credential.2fa.disable",
      resourceType: "credential_2fa",
      resourceId: input.userId,
      outcome: "success",
      metadata: {
        policyVersion: "2fa-lifecycle-v1",
        adminOverride: input.adminOverride,
      },
    });
    return { ok: true, status: "disabled" } as const;
  });

  if (!result.enabled) throw new Error("db_unavailable");
  return result.value;
}

export async function consumeTwoFactorBackupCode(input: {
  userId: string;
  code: string;
  audit: TwoFactorAuditContext;
}): Promise<TwoFactorMutationResult> {
  assertAuditActor(input.userId, input.audit);

  const result = await withTx(async (client) => {
    const rowResult = await client.query<TwoFactorRow>(
      `SELECT encrypted_secret, backup_code_hashes, enabled
         FROM user_2fa
        WHERE user_id = $1
        FOR UPDATE`,
      [input.userId],
    );
    const row = rowResult.rows[0];
    if (!row?.enabled) return { ok: false, status: "not_enabled" } as const;

    const matchIndex = findBackupCode(input.code, row.backup_code_hashes);
    if (matchIndex === -1) {
      await writeSensitiveMutationAuditTx(client, {
        ...input.audit,
        action: "credential.2fa.backup.consume",
        resourceType: "credential_2fa",
        resourceId: input.userId,
        outcome: "rejected",
        metadata: {
          policyVersion: "2fa-lifecycle-v1",
          reason: "invalid_backup_code",
          remainingCodes: row.backup_code_hashes.length,
        },
      });
      return { ok: false, status: "invalid_code" } as const;
    }

    const remainingHashes = [
      ...row.backup_code_hashes.slice(0, matchIndex),
      ...row.backup_code_hashes.slice(matchIndex + 1),
    ];
    await client.query(
      `UPDATE user_2fa
          SET backup_code_hashes = $2,
              last_used_at = NOW()
        WHERE user_id = $1`,
      [input.userId, remainingHashes],
    );
    await writeSensitiveMutationAuditTx(client, {
      ...input.audit,
      action: "credential.2fa.backup.consume",
      resourceType: "credential_2fa",
      resourceId: input.userId,
      outcome: "success",
      metadata: {
        policyVersion: "2fa-lifecycle-v1",
        remainingCodes: remainingHashes.length,
      },
    });

    return {
      ok: true,
      status: "enabled",
      remainingCodes: remainingHashes.length,
    } as const;
  });

  if (!result.enabled) throw new Error("db_unavailable");
  return result.value;
}
