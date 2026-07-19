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
  getAuthoritativeUsdValuation,
  issueWithdrawalAuthorizationTx,
  recordWithdrawalPriceSnapshot,
} from "../../lib/security/withdrawal-admission-authority";
import {
  cancelAuthoritativeWithdrawal,
  createAuthoritativeWithdrawal,
} from "../../lib/security/withdrawal-admission-service";

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
let verificationStep = Math.floor(Date.now() / 30_000) + 100_000;

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

function requestInput(input: {
  userId: string;
  amount: string;
  idempotencyKey: string;
  authorizationId: string;
  destinationAddress?: string;
}) {
  return {
    userId: input.userId,
    asset: "USDT",
    amount: input.amount,
    destinationAddress: input.destinationAddress ?? `0x${"a".repeat(40)}`,
    destinationTag: null,
    network: "ethereum",
    idempotencyKey: input.idempotencyKey,
    authorizationId: input.authorizationId,
    deviceFingerprint: "withdrawal-admission-postgres-test",
    ip: "127.0.0.1",
    userAgent: "tecpey-withdrawal-admission-test",
  };
}

function canonicalOrThrow(input: {
  userId: string;
  amount: string;
  idempotencyKey: string;
  destinationAddress?: string;
}) {
  const result = canonicalizeWithdrawalCommand({
    userId: input.userId,
    asset: "USDT",
    amount: input.amount,
    destinationAddress: input.destinationAddress ?? `0x${"a".repeat(40)}`,
    destinationTag: null,
    network: "ethereum",
    idempotencyKey: input.idempotencyKey,
  });
  if (!result.ok) {
    throw new Error(`canonicalization failed: ${result.reason}`);
  }
  return result;
}

async function seedBalance(userId: string, amount: string): Promise<void> {
  const seeded = await withDb(async (client) => {
    await client.query(
      `INSERT INTO wallet_balances
         (user_id, asset, available_balance, held_balance)
       VALUES ($1, 'USDT', $2::numeric, 0)
       ON CONFLICT (user_id, asset)
       DO UPDATE SET available_balance = EXCLUDED.available_balance,
                     held_balance = 0,
                     updated_at = NOW()`,
      [userId, amount],
    );
    return true;
  });
  assert.equal(seeded.enabled, true);
}

async function createAuthorization(input: {
  userId: string;
  amount: string;
  idempotencyKey: string;
  destinationAddress?: string;
}): Promise<string> {
  const canonical = canonicalOrThrow(input);
  verificationStep += 1;
  const inserted = await withTx((client) =>
    issueWithdrawalAuthorizationTx(client, {
      userId: input.userId,
      requestHash: canonical.requestHash,
      verificationStep,
    }),
  );
  if (!inserted.enabled || !inserted.value) {
    throw new Error("authorization insert failed");
  }
  return inserted.value.id;
}

async function seedPrice(input?: {
  observedAt?: Date;
  ttlSeconds?: number;
}): Promise<void> {
  const id = await recordWithdrawalPriceSnapshot({
    asset: "USDT",
    priceUsd: "1",
    source: "ci-authoritative-price-feed",
    observedAt: input?.observedAt,
    ttlSeconds: input?.ttlSeconds ?? 120,
  });
  assert.ok(id);
}

async function cleanup(userId: string): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      "DELETE FROM withdrawal_admission_outbox WHERE withdrawal_id IN (SELECT id FROM withdrawals WHERE user_id = $1)",
      [userId],
    );
    await client.query("DELETE FROM wallet_ledger WHERE wallet_id = $1", [userId]);
    await client.query("DELETE FROM withdrawals WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM withdrawal_authorizations WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM wallet_balances WHERE user_id = $1", [userId]);
    return true;
  });
}

async function create(input: {
  userId: string;
  amount: string;
  key: string;
  authorizationId: string;
}) {
  return createAuthoritativeWithdrawal(
    requestInput({
      userId: input.userId,
      amount: input.amount,
      idempotencyKey: input.key,
      authorizationId: input.authorizationId,
    }),
  );
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

describe("PostgreSQL withdrawal admission authority", () => {
  it(
    "idempotent response-loss replay keeps one withdrawal and one hold",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const userId = `withdraw-replay-${randomUUID()}`;
      const key = `withdrawal-replay-${randomUUID()}`;
      await seedBalance(userId, "10");
      await seedPrice();
      const authorizationId = await createAuthorization({
        userId,
        amount: "2",
        idempotencyKey: key,
      });
      try {
        const first = await create({ userId, amount: "2", key, authorizationId });
        assert.equal(first.ok, true);
        if (!first.ok) return;
        assert.equal(first.replayed, false);
        assert.equal(first.withdrawal.state, "compliance_review");

        const replay = await create({ userId, amount: "2", key, authorizationId });
        assert.equal(replay.ok, true);
        if (!replay.ok) return;
        assert.equal(replay.replayed, true);
        assert.equal(replay.withdrawal.id, first.withdrawal.id);

        const evidence = await withDb(async (client) => {
          const withdrawals = await client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM withdrawals WHERE user_id = $1",
            [userId],
          );
          const holds = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM wallet_ledger
              WHERE wallet_id = $1 AND reference_type = 'withdrawal'
                AND type = 'hold'`,
            [userId],
          );
          const balance = await client.query<{
            available_balance: string;
            held_balance: string;
          }>(
            `SELECT available_balance::text AS available_balance,
                    held_balance::text AS held_balance
               FROM wallet_balances WHERE user_id = $1 AND asset = 'USDT'`,
            [userId],
          );
          return {
            withdrawals: Number(withdrawals.rows[0]?.count ?? "0"),
            holds: Number(holds.rows[0]?.count ?? "0"),
            balance: balance.rows[0],
          };
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) {
          assert.equal(evidence.value.withdrawals, 1);
          assert.equal(evidence.value.holds, 1);
          assert.equal(evidence.value.balance?.available_balance, "8.000000000000000000");
          assert.equal(evidence.value.balance?.held_balance, "2.000000000000000000");
        }
      } finally {
        await cleanup(userId);
      }
    },
  );

  it(
    "changed payload conflicts under the same idempotency key",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const userId = `withdraw-conflict-${randomUUID()}`;
      const key = `withdrawal-conflict-${randomUUID()}`;
      await seedBalance(userId, "10");
      await seedPrice();
      const authorizationId = await createAuthorization({
        userId,
        amount: "1",
        idempotencyKey: key,
      });
      try {
        assert.equal((await create({ userId, amount: "1", key, authorizationId })).ok, true);
        assert.deepEqual(
          await create({
            userId,
            amount: "2",
            key,
            authorizationId: randomUUID(),
          }),
          { ok: false, reason: "idempotency_conflict", code: 409 },
        );
      } finally {
        await cleanup(userId);
      }
    },
  );

  it(
    "authorization cannot be replayed for a second request",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const userId = `withdraw-auth-replay-${randomUUID()}`;
      const firstKey = `withdrawal-auth-a-${randomUUID()}`;
      const secondKey = `withdrawal-auth-b-${randomUUID()}`;
      await seedBalance(userId, "10");
      await seedPrice();
      const authorizationId = await createAuthorization({
        userId,
        amount: "1",
        idempotencyKey: firstKey,
      });
      try {
        assert.equal(
          (await create({ userId, amount: "1", key: firstKey, authorizationId })).ok,
          true,
        );
        assert.deepEqual(
          await create({ userId, amount: "1", key: secondKey, authorizationId }),
          { ok: false, reason: "withdrawal_authorization_invalid", code: 403 },
        );
      } finally {
        await cleanup(userId);
      }
    },
  );

  it(
    "insufficient balance rolls back the withdrawal and authorization consumption",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const userId = `withdraw-insufficient-${randomUUID()}`;
      const key = `withdrawal-insufficient-${randomUUID()}`;
      await seedBalance(userId, "0.5");
      await seedPrice();
      const authorizationId = await createAuthorization({
        userId,
        amount: "1",
        idempotencyKey: key,
      });
      try {
        assert.deepEqual(
          await create({ userId, amount: "1", key, authorizationId }),
          { ok: false, reason: "insufficient_balance", code: 409 },
        );
        const evidence = await withDb(async (client) => {
          const withdrawals = await client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM withdrawals WHERE user_id = $1",
            [userId],
          );
          const authorization = await client.query<{ consumed_at: Date | null }>(
            "SELECT consumed_at FROM withdrawal_authorizations WHERE id = $1",
            [authorizationId],
          );
          return {
            withdrawalCount: Number(withdrawals.rows[0]?.count ?? "0"),
            consumedAt: authorization.rows[0]?.consumed_at ?? null,
          };
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) {
          assert.equal(evidence.value.withdrawalCount, 0);
          assert.equal(evidence.value.consumedAt, null);
        }
      } finally {
        await cleanup(userId);
      }
    },
  );

  it(
    "concurrent requests cannot reserve more than the available balance",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const userId = `withdraw-concurrent-${randomUUID()}`;
      const keyA = `withdrawal-concurrent-a-${randomUUID()}`;
      const keyB = `withdrawal-concurrent-b-${randomUUID()}`;
      await seedBalance(userId, "1.5");
      await seedPrice();
      const [authorizationA, authorizationB] = await Promise.all([
        createAuthorization({ userId, amount: "1", idempotencyKey: keyA }),
        createAuthorization({ userId, amount: "1", idempotencyKey: keyB }),
      ]);
      try {
        const results = await Promise.all([
          create({ userId, amount: "1", key: keyA, authorizationId: authorizationA }),
          create({ userId, amount: "1", key: keyB, authorizationId: authorizationB }),
        ]);
        assert.equal(results.filter((result) => result.ok).length, 1);
        assert.equal(
          results.filter(
            (result) => !result.ok && result.reason === "insufficient_balance",
          ).length,
          1,
        );
      } finally {
        await cleanup(userId);
      }
    },
  );

  it(
    "stale price evidence cannot authorize valuation",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      await seedPrice({
        observedAt: new Date(Date.now() - 3 * 60_000),
        ttlSeconds: 300,
      });
      assert.deepEqual(await getAuthoritativeUsdValuation("USDT", "1"), {
        ok: false,
        reason: "price_snapshot_stale",
      });
    },
  );

  it(
    "cancellation releases the hold and cancels the outbox event",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const userId = `withdraw-cancel-${randomUUID()}`;
      const key = `withdrawal-cancel-${randomUUID()}`;
      await seedBalance(userId, "5");
      await seedPrice();
      const authorizationId = await createAuthorization({
        userId,
        amount: "2",
        idempotencyKey: key,
      });
      try {
        const created = await create({ userId, amount: "2", key, authorizationId });
        assert.equal(created.ok, true);
        if (!created.ok) return;
        assert.deepEqual(
          await cancelAuthoritativeWithdrawal(created.withdrawal.id, userId),
          { ok: true },
        );

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
          const withdrawal = await client.query<{ state: string }>(
            "SELECT state FROM withdrawals WHERE id = $1",
            [created.withdrawal.id],
          );
          const outbox = await client.query<{ status: string }>(
            "SELECT status FROM withdrawal_admission_outbox WHERE withdrawal_id = $1",
            [created.withdrawal.id],
          );
          const releases = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM wallet_ledger
              WHERE wallet_id = $1 AND reference_id = $2 AND type = 'release'`,
            [userId, created.withdrawal.id],
          );
          return {
            balance: balance.rows[0],
            state: withdrawal.rows[0]?.state,
            outboxStatus: outbox.rows[0]?.status,
            releases: Number(releases.rows[0]?.count ?? "0"),
          };
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) {
          assert.equal(evidence.value.balance?.available_balance, "5.000000000000000000");
          assert.equal(evidence.value.balance?.held_balance, "0.000000000000000000");
          assert.equal(evidence.value.state, "cancelled");
          assert.equal(evidence.value.outboxStatus, "cancelled");
          assert.equal(evidence.value.releases, 1);
        }
      } finally {
        await cleanup(userId);
      }
    },
  );
});
