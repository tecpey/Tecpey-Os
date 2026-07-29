import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import type Redis from "ioredis";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  enableTwoFactor,
  startTwoFactorEnrollment,
  verifyTwoFactorCredential,
  type TwoFactorAuditContext,
} from "../../lib/security/two-factor-authority";
import {
  claimPreAuthToken,
  encryptTotpSecret,
  generateBackupCodes,
  generateTotp,
  generateTotpSecret,
  hashBackupCode,
  peekPreAuthToken,
  storePreAuthToken,
} from "../../lib/security/totp";
import {
  hashSensitiveAuditRequest,
  writeSensitiveMutationAuditTx,
} from "../../lib/security/sensitive-mutation-audit";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;
let redis: Redis | null = null;
const testUsers = new Set<string>();
const testTokens = new Set<string>();

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function tenantId(): string {
  return `two-factor-verify-${randomUUID()}`;
}

function auditContext(input: {
  userId: string;
  tenant: string;
  correlationId?: string;
  flow?: "step_up" | "password_2fa";
}): TwoFactorAuditContext {
  const correlationId = input.correlationId ?? `two-factor-verify-${randomUUID()}`;
  const flow = input.flow ?? "step_up";
  return {
    tenantId: input.tenant,
    actorType: "user",
    actorId: input.userId,
    correlationId,
    requestHash: hashSensitiveAuditRequest({
      tenantId: input.tenant,
      action: "credential.2fa.verify",
      userId: input.userId,
      flow,
    }),
  };
}

async function seedEnabledFactor(input: {
  userId: string;
  tenant: string;
}): Promise<{ rawSecret: string; encryptedSecret: string }> {
  testUsers.add(input.userId);
  const rawSecret = generateTotpSecret();
  const encryptedSecret = encryptTotpSecret(rawSecret);
  const backupCodeHashes = generateBackupCodes().map(hashBackupCode);
  const started = await startTwoFactorEnrollment({
    userId: input.userId,
    encryptedSecret,
    backupCodeHashes,
    audit: {
      ...auditContext({ userId: input.userId, tenant: input.tenant }),
      requestHash: hashSensitiveAuditRequest({
        tenantId: input.tenant,
        action: "credential.2fa.enroll.start",
        userId: input.userId,
      }),
    },
  });
  assert.equal(started.ok, true);
  const enabled = await enableTwoFactor({
    userId: input.userId,
    code: generateTotp(rawSecret),
    audit: {
      ...auditContext({ userId: input.userId, tenant: input.tenant }),
      requestHash: hashSensitiveAuditRequest({
        tenantId: input.tenant,
        action: "credential.2fa.enable",
        userId: input.userId,
      }),
    },
  });
  assert.equal(enabled.ok, true);
  return { rawSecret, encryptedSecret };
}

async function lastUsedAt(userId: string): Promise<Date | null> {
  return withClient(async (client) => {
    const result = await client.query<{ last_used_at: Date | null }>(
      "SELECT last_used_at FROM user_2fa WHERE user_id = $1",
      [userId],
    );
    return result.rows[0]?.last_used_at ?? null;
  });
}

function definitelyDifferentCode(validCode: string): string {
  const first = (Number(validCode[0]) + 1) % 10;
  return `${first}${validCode.slice(1)}`;
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

  const { default: RedisClient } = await import("ioredis");
  redis = new RedisClient(process.env.REDIS_URL ?? "redis://localhost:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  await redis.connect();
  await redis.ping();
  globalThis.tecpeyRedisClient = redis;
});

after(async () => {
  if (redis) {
    for (const token of testTokens) await claimPreAuthToken(token);
  }
  globalThis.tecpeyRedisClient = undefined;
  await redis?.quit();
  redis = null;
  if (pool && testUsers.size > 0) {
    await withClient(async (client) => {
      await client.query("DELETE FROM user_2fa WHERE user_id = ANY($1::text[])", [
        [...testUsers],
      ]);
    });
  }
  await pool?.end();
  pool = null;
});

describe("Two-factor verification authority", { concurrency: 1 }, () => {
  it(
    "commits last-used state and secret-free verification evidence together",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const userId = `two-factor-verify-user-${randomUUID()}`;
      const tenant = tenantId();
      const factor = await seedEnabledFactor({ userId, tenant });
      const beforeValue = await lastUsedAt(userId);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await verifyTwoFactorCredential({
        userId,
        code: generateTotp(factor.rawSecret),
        audit: auditContext({ userId, tenant }),
      });
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error("verification_failed");
      assert.match(result.acceptedStepFingerprint, /^[0-9a-f]{64}$/);

      const afterValue = await lastUsedAt(userId);
      assert.ok(beforeValue instanceof Date);
      assert.ok(afterValue instanceof Date);
      assert.ok(afterValue.getTime() >= beforeValue.getTime());

      await withClient(async (client) => {
        const evidence = await client.query<{
          outcome: string;
          document: string;
        }>(
          `SELECT outcome, row_to_json(event)::text AS document
             FROM sensitive_mutation_audit_events event
            WHERE tenant_id = $1
              AND actor_id = $2
              AND action = 'credential.2fa.verify'`,
          [tenant, userId],
        );
        assert.equal(evidence.rows.length, 1);
        assert.equal(evidence.rows[0]?.outcome, "success");
        const document = evidence.rows[0]?.document ?? "";
        assert.match(document, /acceptedStepFingerprint/);
        assert.equal(document.includes(factor.rawSecret), false);
        assert.equal(document.includes(factor.encryptedSecret), false);
      });
    },
  );

  it(
    "records invalid verification without changing credential usage state",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const userId = `two-factor-verify-user-${randomUUID()}`;
      const tenant = tenantId();
      const factor = await seedEnabledFactor({ userId, tenant });
      const beforeValue = await lastUsedAt(userId);
      const validCode = generateTotp(factor.rawSecret);
      const invalidCode = definitelyDifferentCode(validCode);

      const result = await verifyTwoFactorCredential({
        userId,
        code: invalidCode,
        audit: auditContext({ userId, tenant }),
      });
      assert.deepEqual(result, { ok: false, status: "invalid_code" });
      assert.deepEqual(await lastUsedAt(userId), beforeValue);

      await withClient(async (client) => {
        const evidence = await client.query<{ outcome: string; document: string }>(
          `SELECT outcome, row_to_json(event)::text AS document
             FROM sensitive_mutation_audit_events event
            WHERE tenant_id = $1
              AND actor_id = $2
              AND action = 'credential.2fa.verify'`,
          [tenant, userId],
        );
        assert.equal(evidence.rows.length, 1);
        assert.equal(evidence.rows[0]?.outcome, "rejected");
        assert.equal(evidence.rows[0]?.document.includes(invalidCode), false);
      });
    },
  );

  it(
    "rolls back last-used state when mandatory verification evidence conflicts",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const userId = `two-factor-verify-user-${randomUUID()}`;
      const tenant = tenantId();
      const correlationId = `two-factor-verify-conflict-${randomUUID()}`;
      const factor = await seedEnabledFactor({ userId, tenant });
      const beforeValue = await lastUsedAt(userId);

      await withClient(async (client) => {
        await writeSensitiveMutationAuditTx(client, {
          tenantId: tenant,
          actorType: "user",
          actorId: userId,
          action: "credential.2fa.verify",
          resourceType: "credential_2fa",
          resourceId: userId,
          outcome: "success",
          correlationId,
          requestHash: "f".repeat(64),
          metadata: { policyVersion: "forced-conflict" },
        });
      });

      await assert.rejects(
        verifyTwoFactorCredential({
          userId,
          code: generateTotp(factor.rawSecret),
          audit: auditContext({ userId, tenant, correlationId }),
        }),
        /sensitive_audit_correlation_conflict/,
      );
      assert.deepEqual(await lastUsedAt(userId), beforeValue);
    },
  );

  it(
    "keeps pre-auth challenge after invalid TOTP and allows one concurrent claimant",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const userId = `two-factor-verify-user-${randomUUID()}`;
      const tenant = tenantId();
      const factor = await seedEnabledFactor({ userId, tenant });
      const token = `preauth-${randomUUID()}`;
      testTokens.add(token);
      await storePreAuthToken(token, userId);

      const initial = await peekPreAuthToken(token);
      assert.deepEqual(initial, { available: true, userId });
      const invalid = await verifyTwoFactorCredential({
        userId,
        code: definitelyDifferentCode(generateTotp(factor.rawSecret)),
        audit: auditContext({ userId, tenant, flow: "password_2fa" }),
      });
      assert.deepEqual(invalid, { ok: false, status: "invalid_code" });
      assert.deepEqual(await peekPreAuthToken(token), { available: true, userId });

      const [first, second] = await Promise.all([
        claimPreAuthToken(token),
        claimPreAuthToken(token),
      ]);
      const claims = [first, second];
      assert.equal(
        claims.filter((claim) => claim.available && claim.userId === userId).length,
        1,
      );
      assert.equal(
        claims.filter((claim) => claim.available && claim.userId === null).length,
        1,
      );
      assert.deepEqual(await peekPreAuthToken(token), {
        available: true,
        userId: null,
      });
    },
  );
});
