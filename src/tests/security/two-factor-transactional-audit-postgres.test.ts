import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  consumeTwoFactorBackupCode,
  disableTwoFactor,
  enableTwoFactor,
  fingerprintTwoFactorGeneration,
  startTwoFactorEnrollment,
  type TwoFactorAuditContext,
} from "../../lib/security/two-factor-authority";
import {
  encryptTotpSecret,
  generateBackupCodes,
  generateTotp,
  generateTotpSecret,
  hashBackupCode,
} from "../../lib/security/totp";
import { hashSensitiveAuditRequest } from "../../lib/security/sensitive-mutation-audit";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;
const testUsers = new Set<string>();

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function tenantId(): string {
  return `two-factor-test-${randomUUID()}`;
}

function auditContext(input: {
  userId: string;
  action: string;
  tenant?: string;
  correlationId?: string;
  actorId?: string;
  actorType?: TwoFactorAuditContext["actorType"];
  evidence?: Record<string, unknown>;
}): TwoFactorAuditContext {
  const tenant = input.tenant ?? tenantId();
  const actorId = input.actorId ?? input.userId;
  const actorType = input.actorType ?? "user";
  return {
    tenantId: tenant,
    actorType,
    actorId,
    correlationId: input.correlationId ?? `two-factor-audit-${randomUUID()}`,
    requestHash: hashSensitiveAuditRequest({
      tenantId: tenant,
      actorType,
      actorId,
      userId: input.userId,
      action: input.action,
      ...input.evidence,
    }),
  };
}

async function factorRow(userId: string): Promise<{
  encrypted_secret: string;
  backup_code_hashes: string[];
  enabled: boolean;
} | null> {
  return withClient(async (client) => {
    const result = await client.query<{
      encrypted_secret: string;
      backup_code_hashes: string[];
      enabled: boolean;
    }>(
      `SELECT encrypted_secret, backup_code_hashes, enabled
         FROM user_2fa
        WHERE user_id = $1
        LIMIT 1`,
      [userId],
    );
    return result.rows[0] ?? null;
  });
}

async function seedEnrollment(input: {
  userId: string;
  tenant?: string;
  correlationId?: string;
  rawSecret?: string;
  backupCodes?: string[];
}): Promise<{
  rawSecret: string;
  encryptedSecret: string;
  backupCodes: string[];
  backupCodeHashes: string[];
  audit: TwoFactorAuditContext;
}> {
  const rawSecret = input.rawSecret ?? generateTotpSecret();
  const encryptedSecret = encryptTotpSecret(rawSecret);
  const backupCodes = input.backupCodes ?? generateBackupCodes();
  const backupCodeHashes = backupCodes.map(hashBackupCode);
  const generationFingerprint = fingerprintTwoFactorGeneration({
    encryptedSecret,
    backupCodeHashes,
  });
  const audit = auditContext({
    userId: input.userId,
    action: "credential.2fa.enroll.start",
    tenant: input.tenant,
    correlationId: input.correlationId,
    evidence: { generationFingerprint, backupCodeCount: backupCodes.length },
  });
  const result = await startTwoFactorEnrollment({
    userId: input.userId,
    encryptedSecret,
    backupCodeHashes,
    audit,
  });
  assert.deepEqual(result, { ok: true, status: "started" });
  return { rawSecret, encryptedSecret, backupCodes, backupCodeHashes, audit };
}

async function cleanup(): Promise<void> {
  if (!pool || testUsers.size === 0) return;
  await withClient(async (client) => {
    await client.query(
      `DELETE FROM user_2fa
        WHERE user_id = ANY($1::text[])`,
      [[...testUsers]],
    );
  });
}

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 8,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await cleanup();
  await pool?.end();
  pool = null;
});

describe("Two-factor transactional audit authority", { concurrency: 1 }, () => {
  it(
    "commits enrollment, enablement and disablement with secret-free audit evidence",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const userId = `two-factor-user-${randomUUID()}`;
      const tenant = tenantId();
      testUsers.add(userId);
      const enrollment = await seedEnrollment({ userId, tenant });

      const enableAudit = auditContext({
        userId,
        tenant,
        action: "credential.2fa.enable",
      });
      assert.deepEqual(
        await enableTwoFactor({
          userId,
          code: generateTotp(enrollment.rawSecret),
          audit: enableAudit,
        }),
        { ok: true, status: "enabled" },
      );

      const disableAudit = auditContext({
        userId,
        tenant,
        action: "credential.2fa.disable",
        evidence: { adminOverride: false },
      });
      assert.deepEqual(
        await disableTwoFactor({
          userId,
          code: generateTotp(enrollment.rawSecret),
          adminOverride: false,
          audit: disableAudit,
        }),
        { ok: true, status: "disabled" },
      );

      const stored = await factorRow(userId);
      assert.ok(stored);
      assert.equal(stored.enabled, false);

      await withClient(async (client) => {
        const evidence = await client.query<{ action: string; document: string }>(
          `SELECT action, row_to_json(event)::text AS document
             FROM sensitive_mutation_audit_events event
            WHERE tenant_id = $1
              AND actor_id = $2
              AND action = ANY($3::text[])
            ORDER BY created_at, action`,
          [
            tenant,
            userId,
            [
              "credential.2fa.enroll.start",
              "credential.2fa.enable",
              "credential.2fa.disable",
            ],
          ],
        );
        assert.deepEqual(
          evidence.rows.map((row) => row.action).sort(),
          [
            "credential.2fa.disable",
            "credential.2fa.enable",
            "credential.2fa.enroll.start",
          ],
        );
        const document = evidence.rows.map((row) => row.document).join("\n");
        assert.match(document, /factorGenerationFingerprint/);
        assert.match(document, /2fa-lifecycle-v1/);
        assert.equal(document.includes(enrollment.rawSecret), false);
        assert.equal(document.includes(enrollment.encryptedSecret), false);
        for (const code of enrollment.backupCodes) assert.equal(document.includes(code), false);
        for (const hash of enrollment.backupCodeHashes) assert.equal(document.includes(hash), false);
      });
    },
  );

  it(
    "rolls back pending enrollment when mandatory audit admission fails",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const userId = `two-factor-user-${randomUUID()}`;
      testUsers.add(userId);
      const rawSecret = generateTotpSecret();
      const encryptedSecret = encryptTotpSecret(rawSecret);
      const backupCodeHashes = generateBackupCodes().map(hashBackupCode);

      await assert.rejects(
        startTwoFactorEnrollment({
          userId,
          encryptedSecret,
          backupCodeHashes,
          audit: auditContext({
            userId,
            action: "credential.2fa.enroll.start",
            tenant: "INVALID TENANT",
          }),
        }),
        /invalid_sensitive_audit_tenant/,
      );
      assert.equal(await factorRow(userId), null);
    },
  );

  it(
    "allows at most one concurrent success for the same backup code",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const userId = `two-factor-user-${randomUUID()}`;
      const tenant = tenantId();
      testUsers.add(userId);
      const enrollment = await seedEnrollment({ userId, tenant });
      const enabled = await enableTwoFactor({
        userId,
        code: generateTotp(enrollment.rawSecret),
        audit: auditContext({ userId, tenant, action: "credential.2fa.enable" }),
      });
      assert.equal(enabled.ok, true);

      const submittedCode = enrollment.backupCodes[0];
      const [first, second] = await Promise.all([
        consumeTwoFactorBackupCode({
          userId,
          code: submittedCode,
          audit: auditContext({
            userId,
            tenant,
            action: "credential.2fa.backup.consume",
            evidence: { attempt: 1 },
          }),
        }),
        consumeTwoFactorBackupCode({
          userId,
          code: submittedCode,
          audit: auditContext({
            userId,
            tenant,
            action: "credential.2fa.backup.consume",
            evidence: { attempt: 2 },
          }),
        }),
      ]);

      const results = [first, second];
      assert.equal(results.filter((result) => result.ok).length, 1);
      assert.equal(
        results.filter((result) => !result.ok && result.status === "invalid_code").length,
        1,
      );
      assert.equal((await factorRow(userId))?.backup_code_hashes.length, enrollment.backupCodes.length - 1);

      await withClient(async (client) => {
        const result = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM sensitive_mutation_audit_events
            WHERE tenant_id = $1
              AND actor_id = $2
              AND action = 'credential.2fa.backup.consume'
              AND outcome = 'success'`,
          [tenant, userId],
        );
        assert.equal(Number(result.rows[0]?.count ?? "0"), 1);
      });
    },
  );

  it(
    "rejects changed enrollment replay and preserves the first credential generation",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const userId = `two-factor-user-${randomUUID()}`;
      const tenant = tenantId();
      const correlationId = `two-factor-replay-${randomUUID()}`;
      testUsers.add(userId);
      const first = await seedEnrollment({ userId, tenant, correlationId });

      const secondRawSecret = generateTotpSecret();
      const secondEncryptedSecret = encryptTotpSecret(secondRawSecret);
      const secondBackupCodes = generateBackupCodes();
      const secondBackupCodeHashes = secondBackupCodes.map(hashBackupCode);
      const secondFingerprint = fingerprintTwoFactorGeneration({
        encryptedSecret: secondEncryptedSecret,
        backupCodeHashes: secondBackupCodeHashes,
      });

      await assert.rejects(
        startTwoFactorEnrollment({
          userId,
          encryptedSecret: secondEncryptedSecret,
          backupCodeHashes: secondBackupCodeHashes,
          audit: auditContext({
            userId,
            tenant,
            correlationId,
            action: "credential.2fa.enroll.start",
            evidence: {
              generationFingerprint: secondFingerprint,
              backupCodeCount: secondBackupCodes.length,
            },
          }),
        }),
        /sensitive_audit_correlation_conflict/,
      );

      const stored = await factorRow(userId);
      assert.ok(stored);
      assert.equal(stored.encrypted_secret, first.encryptedSecret);
      assert.deepEqual(stored.backup_code_hashes, first.backupCodeHashes);
      assert.equal(stored.enabled, false);
    },
  );

  it(
    "rejects cross-principal and forged admin authority before mutation",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const ownerId = `two-factor-user-${randomUUID()}`;
      const attackerId = `two-factor-user-${randomUUID()}`;
      const tenant = tenantId();
      testUsers.add(ownerId);
      testUsers.add(attackerId);

      const rawSecret = generateTotpSecret();
      const encryptedSecret = encryptTotpSecret(rawSecret);
      const backupCodeHashes = generateBackupCodes().map(hashBackupCode);
      await assert.rejects(
        startTwoFactorEnrollment({
          userId: ownerId,
          encryptedSecret,
          backupCodeHashes,
          audit: auditContext({
            userId: ownerId,
            actorId: attackerId,
            tenant,
            action: "credential.2fa.enroll.start",
          }),
        }),
        /two_factor_audit_actor_mismatch/,
      );
      assert.equal(await factorRow(ownerId), null);

      const enrollment = await seedEnrollment({ userId: ownerId, tenant, rawSecret });
      const enabled = await enableTwoFactor({
        userId: ownerId,
        code: generateTotp(enrollment.rawSecret),
        audit: auditContext({ userId: ownerId, tenant, action: "credential.2fa.enable" }),
      });
      assert.equal(enabled.ok, true);

      await assert.rejects(
        disableTwoFactor({
          userId: ownerId,
          code: null,
          adminOverride: true,
          audit: auditContext({
            userId: ownerId,
            tenant,
            actorType: "user",
            action: "credential.2fa.disable",
            evidence: { adminOverride: true },
          }),
        }),
        /two_factor_admin_override_forbidden/,
      );
      assert.equal((await factorRow(ownerId))?.enabled, true);
    },
  );
});
