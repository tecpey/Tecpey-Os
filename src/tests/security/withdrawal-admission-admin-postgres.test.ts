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
import {
  canonicalizeWithdrawalCommand,
  issueWithdrawalAuthorizationTx,
  recordWithdrawalPriceSnapshot,
} from "../../lib/security/withdrawal-admission-authority";
import { createAuthoritativeWithdrawal } from "../../lib/security/withdrawal-admission-service";
import { adminActOnAuthoritativeWithdrawal } from "../../lib/security/withdrawal-admin-authority";
import { hashApiCommand } from "../../lib/security/api-command-idempotency";

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
let verificationStep = Math.floor(Date.now() / 30_000) + 200_000;

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

async function seedWithdrawal(userId: string): Promise<string> {
  const key = `withdrawal-admin-${randomUUID()}`;
  const amount = "2";
  const destinationAddress = `0x${"a".repeat(40)}`;
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
    source: "ci-admin-price-feed",
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
    deviceFingerprint: "withdrawal-admin-test",
    ip: "127.0.0.1",
    userAgent: "tecpey-withdrawal-admin-test",
  });
  if (!created.ok) throw new Error("withdrawal seed failed");
  assert.equal(created.withdrawal.state, "compliance_review");
  return created.withdrawal.id;
}

async function cleanup(userId: string, adminId?: string): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      "DELETE FROM withdrawal_admin_actions WHERE withdrawal_id IN (SELECT id FROM withdrawals WHERE user_id = $1)",
      [userId],
    );
    await client.query(
      "DELETE FROM withdrawal_admission_outbox WHERE withdrawal_id IN (SELECT id FROM withdrawals WHERE user_id = $1)",
      [userId],
    );
    await client.query("DELETE FROM wallet_ledger WHERE wallet_id = $1", [userId]);
    await client.query("DELETE FROM withdrawals WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM withdrawal_authorizations WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM wallet_balances WHERE user_id = $1", [userId]);
    if (adminId) {
      await client.query(
        "DELETE FROM api_command_receipts WHERE principal_type = 'admin' AND principal_id = $1",
        [adminId],
      );
    }
    return true;
  });
}

before(async () => {
  if (!integrationConfigured || !redisUrl) return;
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
});

describe("Authoritative admin withdrawal transitions", () => {
  it(
    "approve remains blocked behind the custody launch gate",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const userId = `withdraw-admin-approve-${randomUUID()}`;
      const adminId = `admin-approve-${randomUUID()}`;
      const withdrawalId = await seedWithdrawal(userId);
      const idempotencyKey = `admin-approve-${randomUUID()}`;
      try {
        assert.deepEqual(
          await adminActOnAuthoritativeWithdrawal({
            withdrawalId,
            adminId,
            action: "approve",
            idempotencyKey,
            requestHash: hashApiCommand({
              withdrawalId,
              action: "approve",
              notes: null,
            }),
          }),
          { ok: false, reason: "custody_launch_gate_disabled", code: 409 },
        );

        const evidence = await withDb(async (client) => {
          const withdrawal = await client.query<{ state: string }>(
            "SELECT state FROM withdrawals WHERE id = $1",
            [withdrawalId],
          );
          const balance = await client.query<{ held_balance: string }>(
            `SELECT held_balance::text AS held_balance
               FROM wallet_balances WHERE user_id = $1 AND asset = 'USDT'`,
            [userId],
          );
          return {
            state: withdrawal.rows[0]?.state,
            heldBalance: balance.rows[0]?.held_balance,
          };
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) {
          assert.equal(evidence.value.state, "compliance_review");
          assert.equal(evidence.value.heldBalance, "2.000000000000000000");
        }
      } finally {
        await cleanup(userId, adminId);
      }
    },
  );

  it(
    "reject releases the reservation once and makes retry idempotent",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const userId = `withdraw-admin-reject-${randomUUID()}`;
      const adminId = `admin-reject-${randomUUID()}`;
      const withdrawalId = await seedWithdrawal(userId);
      const idempotencyKey = `admin-reject-${randomUUID()}`;
      const requestHash = hashApiCommand({
        withdrawalId,
        action: "reject",
        notes: "verified rejection",
      });
      try {
        const first = await adminActOnAuthoritativeWithdrawal({
          withdrawalId,
          adminId,
          action: "reject",
          notes: "verified rejection",
          idempotencyKey,
          requestHash,
        });
        assert.equal(first.ok, true);
        if (!first.ok) return;
        assert.equal(first.replayed, false);
        assert.equal(first.state, "rejected");

        const replay = await adminActOnAuthoritativeWithdrawal({
          withdrawalId,
          adminId,
          action: "reject",
          notes: "verified rejection",
          idempotencyKey,
          requestHash,
        });
        assert.equal(replay.ok, true);
        if (!replay.ok) return;
        assert.equal(replay.replayed, true);

        const evidence = await withDb(async (client) => {
          const balance = await client.query<{
            available_balance: string;
            held_balance: string;
          }>(
            `SELECT available_balance::text AS available_balance,
                    held_balance::text AS held_balance
               FROM wallet_balances WHERE user_id = $1 AND asset = 'USDT'`,
            [userId],
          );
          const releases = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM wallet_ledger
              WHERE wallet_id = $1 AND reference_id = $2 AND type = 'release'`,
            [userId, withdrawalId],
          );
          const actions = await client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM withdrawal_admin_actions WHERE withdrawal_id = $1",
            [withdrawalId],
          );
          const outbox = await client.query<{ status: string }>(
            "SELECT status FROM withdrawal_admission_outbox WHERE withdrawal_id = $1",
            [withdrawalId],
          );
          const receipts = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM api_command_receipts
              WHERE principal_type = 'admin'
                AND principal_id = $1
                AND operation = 'withdrawal.admin_action'
                AND idempotency_key = $2
                AND status = 'completed'`,
            [adminId, idempotencyKey],
          );
          return {
            balance: balance.rows[0],
            releases: Number(releases.rows[0]?.count ?? "0"),
            actions: Number(actions.rows[0]?.count ?? "0"),
            receipts: Number(receipts.rows[0]?.count ?? "0"),
            outboxStatus: outbox.rows[0]?.status,
          };
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) {
          assert.equal(evidence.value.balance?.available_balance, "5.000000000000000000");
          assert.equal(evidence.value.balance?.held_balance, "0.000000000000000000");
          assert.equal(evidence.value.releases, 1);
          assert.equal(evidence.value.actions, 1);
          assert.equal(evidence.value.receipts, 1);
          assert.equal(evidence.value.outboxStatus, "cancelled");
        }
      } finally {
        await cleanup(userId, adminId);
      }
    },
  );
});
