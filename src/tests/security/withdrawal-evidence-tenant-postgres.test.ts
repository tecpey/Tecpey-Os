import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Redis } from "ioredis";
import type {
  AMLProvider,
  KYCProvider,
  SanctionsProvider,
} from "../../lib/security/compliance";
import { withDb, withTx } from "../../lib/db";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { PLATFORM } from "../../lib/platform-config";
import {
  canonicalizeWithdrawalCommand,
  issueWithdrawalAuthorizationTx,
  recordWithdrawalPriceSnapshot,
} from "../../lib/security/withdrawal-admission-authority";
import { createAuthoritativeWithdrawal } from "../../lib/security/withdrawal-admission-service";
import {
  adminActOnAuthoritativeWithdrawal,
  type AdminWithdrawalAuthorizationEvidence,
} from "../../lib/security/withdrawal-admin-authority";
import { cancelWithdrawalIdempotently } from "../../lib/security/withdrawal-cancel-authority";
import { hashApiCommand } from "../../lib/security/api-command-idempotency";
import {
  fingerprintWithdrawalReviewReason,
  fingerprintWithdrawalRoleSet,
  fingerprintWithdrawalSession,
} from "../../lib/security/withdrawal-evidence";

// Withdrawal custody evidence must be filed under the tenant that owns the money
// (#20, roadmap 7.3, migration 0072).
//
// Three trigger functions build the append-only evidence for a withdrawal's
// life, and each passed the literal 'tecpey' to tecpey_insert_withdrawal_evidence
// while two also resolved their api_command_receipts row under that literal. A
// withdrawal belonging to another tenant therefore produced custody evidence
// filed under the default tenant — the row naming who approved it named the
// wrong tenant, permanently, in an append-only record.
//
// The two sides have to move together: the trigger reads the receipt by tenant,
// so moving only the writer leaves a non-default-tenant operator unable to act
// at all, and moving only the trigger does the same. That coupling is what makes
// these cases worth having — each one exercises writer and trigger as one chain.

const databaseUrl = process.env.DATABASE_URL?.trim();
const redisUrl = process.env.REDIS_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl &&
    !databaseUrl.includes("CHANGE_ME") &&
    redisUrl &&
    !redisUrl.includes("CHANGE_ME"),
);

const originalProviders = globalThis.tecpeyComplianceProviders;
const originalRedis = globalThis.tecpeyRedisClient;
const originalRealWithdrawals = process.env.TECPEY_REAL_WITHDRAWALS_ENABLED;
let redis: Redis | null = null;
let verificationStep = Math.floor(Date.now() / 30_000) + 500_000;
const cleanupTenants = new Set<string>();

function passingProviders() {
  const kyc: KYCProvider = {
    async createSession() {
      return { sessionId: "session", redirectUrl: "https://kyc.invalid" };
    },
    async getStatus() {
      return {
        status: "approved",
        level: "enhanced",
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        rejectionReason: null,
        documentCountry: "AE",
      };
    },
    async handleWebhook() {
      return null;
    },
  };
  const aml: AMLProvider = {
    async screenTransaction() {
      return {
        riskScore: "low",
        flags: [],
        requiresReview: false,
        screenedAt: new Date(),
      };
    },
    async handleAlert() {
      return null;
    },
  };
  const sanctions: SanctionsProvider = {
    async screenUser() {
      return {
        matched: false,
        listName: null,
        matchedName: null,
        confidence: 0,
        screenedAt: new Date(),
      };
    },
    async screenAddress() {
      return {
        matched: false,
        listName: null,
        matchedName: null,
        confidence: 0,
        screenedAt: new Date(),
      };
    },
  };
  return { kyc, aml, sanctions };
}

function adminAuthorizationEvidence(
  permission: string,
  notes?: string,
): AdminWithdrawalAuthorizationEvidence {
  return {
    permission,
    stepUpWithinSeconds: 300,
    roleSetFingerprint: fingerprintWithdrawalRoleSet(["admin", permission]),
    sessionEvidenceFingerprint: fingerprintWithdrawalSession(
      `withdrawal-evidence-tenant:${permission}`,
    ),
    reviewReasonFingerprint: notes
      ? fingerprintWithdrawalReviewReason(notes)
      : null,
  };
}

/** A tenant that is not the platform default, with a workspace of its own. */
async function seedTenant(): Promise<string> {
  const tenantId = `tenant-wd-${randomUUID()}`;
  cleanupTenants.add(tenantId);
  const seeded = await withDb(async (client) => {
    await client.query(
      `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO platform_workspaces
         (id, tenant_id, slug, display_name, products, settings)
       VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
      [`ws-wd-${randomUUID()}`, tenantId],
    );
    return true;
  });
  assert.equal(seeded.enabled, true);
  return tenantId;
}

/**
 * A withdrawal owned by `tenantId`. It is admitted through the real service and
 * then moved, because the admission path has no tenant input of its own — the
 * column carries a default. What matters here is the state the triggers see.
 */
async function seedWithdrawal(userId: string, tenantId: string): Promise<string> {
  const key = `withdrawal-tenant-${randomUUID()}`;
  const amount = "2";
  const destinationAddress = `0x${"b".repeat(40)}`;
  const canonical = canonicalizeWithdrawalCommand({
    userId,
    asset: "USDT",
    amount,
    destinationAddress,
    destinationTag: null,
    network: "ethereum",
    idempotencyKey: key,
  });
  if (!canonical.ok) throw new Error(canonical.reason);

  const seeded = await withDb(async (client) => {
    await client.query(
      `INSERT INTO wallet_balances
         (user_id, asset, available_balance, held_balance)
       VALUES ($1, 'USDT', 5, 0)
       ON CONFLICT (user_id, asset)
       DO UPDATE SET available_balance = 5, held_balance = 0, updated_at = NOW()`,
      [userId],
    );
    return true;
  });
  assert.equal(seeded.enabled, true);

  const price = await recordWithdrawalPriceSnapshot({
    asset: "USDT",
    priceUsd: "1",
    source: "ci-evidence-tenant-price-feed",
    ttlSeconds: 120,
  });
  assert.ok(price);

  verificationStep += 1;
  const authorization = await withTx((client) =>
    issueWithdrawalAuthorizationTx(client, {
      userId,
      requestHash: canonical.requestHash,
      verificationStep,
    }),
  );
  if (!authorization.enabled || !authorization.value) {
    throw new Error("authorization unavailable");
  }

  const created = await createAuthoritativeWithdrawal({
    userId,
    asset: "USDT",
    amount,
    destinationAddress,
    destinationTag: null,
    network: "ethereum",
    idempotencyKey: key,
    authorizationId: authorization.value.id,
    deviceFingerprint: "withdrawal-evidence-tenant-test",
    ip: "127.0.0.1",
    userAgent: "tecpey-withdrawal-evidence-tenant-test",
  });
  if (!created.ok) throw new Error("withdrawal seed failed");

  const moved = await withDb((client) =>
    client.query("UPDATE withdrawals SET tenant_id = $2 WHERE id = $1", [
      created.withdrawal.id,
      tenantId,
    ]),
  );
  assert.equal(moved.enabled, true);
  return created.withdrawal.id;
}

/**
 * Evidence rows are keyed by a hashed resource id, not the withdrawal id, so the
 * lookup recomputes that hash with the same database function the triggers use.
 */
async function evidenceTenants(
  withdrawalId: string,
  action?: string,
): Promise<string[]> {
  const rows = await withDb((client) =>
    client.query<{ tenant_id: string }>(
      `SELECT tenant_id
         FROM sensitive_mutation_audit_events
        WHERE resource_id = tecpey_withdrawal_evidence_hash('withdrawal', $1)
          AND ($2::text IS NULL OR action = $2)
        ORDER BY tenant_id`,
      [withdrawalId, action ?? null],
    ),
  );
  assert.equal(rows.enabled, true);
  return rows.enabled
    ? [...new Set(rows.value.rows.map((row) => row.tenant_id))]
    : [];
}

before(async () => {
  if (!integrationConfigured || !redisUrl) return;
  await withDb((client) => applyDatabaseMigrationsWithLock(client));
  redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  });
  await redis.connect();
  await redis.ping();
  globalThis.tecpeyRedisClient = redis;
  globalThis.tecpeyComplianceProviders = passingProviders();
  delete process.env.TECPEY_REAL_WITHDRAWALS_ENABLED;
});

after(async () => {
  globalThis.tecpeyComplianceProviders = originalProviders;
  globalThis.tecpeyRedisClient = originalRedis;
  if (originalRealWithdrawals === undefined) {
    delete process.env.TECPEY_REAL_WITHDRAWALS_ENABLED;
  } else {
    process.env.TECPEY_REAL_WITHDRAWALS_ENABLED = originalRealWithdrawals;
  }
  if (redis) await redis.quit();
  redis = null;
  // Withdrawals and their evidence are append-only by design, so the tenant rows
  // are left in place rather than cascading a delete through custody records.
  cleanupTenants.clear();
});

describe("Withdrawal custody evidence tenant", () => {
  it(
    "files admin transition evidence under the withdrawal's own tenant",
    { skip: !integrationConfigured, timeout: 60_000 },
    async () => {
      const tenantId = await seedTenant();
      const userId = `wd-tenant-reject-${randomUUID()}`;
      const adminId = `admin-tenant-${randomUUID()}`;
      const withdrawalId = await seedWithdrawal(userId, tenantId);
      const notes = "tenant-scoped rejection";
      const requestHash = hashApiCommand({
        withdrawalId,
        action: "reject",
        notes,
      });

      // Before migration 0072 this call failed outright: the writer filed the
      // receipt under the operator's tenant while the trigger looked for it
      // under the literal 'tecpey', so the transition raised
      // 'withdrawal admin receipt evidence is missing'.
      const acted = await adminActOnAuthoritativeWithdrawal({
        withdrawalId,
        tenantId,
        adminId,
        action: "reject",
        notes,
        authorizationEvidence: adminAuthorizationEvidence(
          "withdrawals.reject",
          notes,
        ),
        idempotencyKey: `admin-tenant-${randomUUID()}`,
        requestHash,
      });
      assert.equal(acted.ok, true, "the admin action must complete in its own tenant");
      if (!acted.ok) return;
      assert.equal(acted.state, "rejected");

      const tenants = await evidenceTenants(withdrawalId, "withdrawal.admin.reject");
      assert.deepEqual(
        tenants,
        [tenantId],
        "custody evidence must name the tenant that owns the withdrawal, and only it",
      );
      assert.ok(
        !tenants.includes(PLATFORM.DEFAULT_TENANT_ID),
        "no evidence row may be filed under the platform default",
      );
    },
  );

  it(
    "files user cancellation evidence under the withdrawal's own tenant",
    { skip: !integrationConfigured, timeout: 60_000 },
    async () => {
      const tenantId = await seedTenant();
      const userId = `wd-tenant-cancel-${randomUUID()}`;
      const withdrawalId = await seedWithdrawal(userId, tenantId);

      const cancelled = await cancelWithdrawalIdempotently({
        withdrawalId,
        userId,
        idempotencyKey: `cancel-tenant-${randomUUID()}`,
        requestHash: hashApiCommand({ withdrawalId, action: "cancel" }),
      });
      assert.equal(cancelled.ok, true, `cancellation must complete in its own tenant: ${JSON.stringify(cancelled)}`);

      const tenants = await evidenceTenants(withdrawalId, "withdrawal.cancel");
      assert.deepEqual(
        tenants,
        [tenantId],
        "cancellation evidence must name the owning tenant, and only it",
      );
    },
  );

  it(
    "records where the chain still begins in the default tenant",
    { skip: !integrationConfigured, timeout: 60_000 },
    async () => {
      // Not a fix — a boundary, stated so it is not mistaken for one.
      //
      // The admission trigger now derives its tenant from the withdrawal row, but
      // it fires as the row is created, and createAuthoritativeWithdrawal has no
      // tenant input at all: withdrawals.tenant_id carries a column default. So
      // admission evidence is filed under the default tenant no matter who the
      // withdrawal ends up belonging to, and only the later transitions land in
      // the owning tenant.
      //
      // Giving the withdrawal admission path a tenant of its own is the next
      // slice. Until then this case pins the exact shape of the gap, so a reader
      // is not left believing the whole chain moved.
      const tenantId = await seedTenant();
      const userId = `wd-tenant-admit-${randomUUID()}`;
      const withdrawalId = await seedWithdrawal(userId, tenantId);

      const cancelled = await cancelWithdrawalIdempotently({
        withdrawalId,
        userId,
        idempotencyKey: `admit-tenant-${randomUUID()}`,
        requestHash: hashApiCommand({ withdrawalId, action: "cancel" }),
      });
      assert.equal(cancelled.ok, true, JSON.stringify(cancelled));

      assert.deepEqual(
        await evidenceTenants(withdrawalId, "withdrawal.cancel"),
        [tenantId],
        "the transition this test controls files under the owning tenant",
      );
      assert.deepEqual(
        await evidenceTenants(withdrawalId, "withdrawal.review"),
        [PLATFORM.DEFAULT_TENANT_ID],
        "admission still files under the default tenant, because creation has no tenant input",
      );
    },
  );
});
