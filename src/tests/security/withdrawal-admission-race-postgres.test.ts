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
import { hashApiCommand } from "../../lib/security/api-command-idempotency";
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
import {
  fingerprintWithdrawalReviewReason,
  fingerprintWithdrawalRoleSet,
  fingerprintWithdrawalSession,
} from "../../lib/security/withdrawal-evidence";

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
let verificationStep = Math.floor(Date.now() / 30_000) + 600_000;

function passingProviders(): {
  kyc: KYCProvider;
  aml: AMLProvider;
  sanctions: SanctionsProvider;
} {
  return {
    kyc: {
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
    },
    aml: {
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
    },
    sanctions: {
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
    },
  };
}

function adminEvidence(notes: string): AdminWithdrawalAuthorizationEvidence {
  return {
    permission: "withdrawals.reject",
    stepUpWithinSeconds: 300,
    roleSetFingerprint: fingerprintWithdrawalRoleSet([
      "admin",
      "withdrawals.reject",
    ]),
    sessionEvidenceFingerprint: fingerprintWithdrawalSession(
      "withdrawal-race-admin-session",
    ),
    reviewReasonFingerprint: fingerprintWithdrawalReviewReason(notes),
  };
}

async function seedWithdrawal(userId: string): Promise<string> {
  const idempotencyKey = `withdrawal-race-${randomUUID()}`;
  const destinationAddress = `0x${"c".repeat(40)}`;
  const canonical = canonicalizeWithdrawalCommand({
    userId,
    asset: "USDT",
    amount: "2",
    destinationAddress,
    destinationTag: null,
    network: "ethereum",
    idempotencyKey,
  });
  if (!canonical.ok) throw new Error(canonical.reason);

  const balance = await withDb(async (client) => {
    await client.query(
      `INSERT INTO wallet_balances
         (user_id, asset, available_balance, held_balance)
       VALUES ($1, 'USDT', 5, 0)
       ON CONFLICT (user_id, asset) DO UPDATE
         SET available_balance = 5,
             held_balance = 0,
             updated_at = NOW()`,
      [userId],
    );
    return true;
  });
  assert.equal(balance.enabled, true);

  const price = await recordWithdrawalPriceSnapshot({
    asset: "USDT",
    priceUsd: "1",
    source: "withdrawal-race-test",
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
    throw new Error("authorization_unavailable");
  }

  const created = await createAuthoritativeWithdrawal({
    ...canonical.command,
    authorizationId: authorization.value.id,
    deviceFingerprint: "withdrawal-race-test",
    ip: "127.0.0.1",
    userAgent: "withdrawal-race-test",
  });
  if (!created.ok) throw new Error(`withdrawal_seed_failed:${created.reason}`);
  assert.equal(created.withdrawal.state, "compliance_review");
  return created.withdrawal.id;
}

async function cleanupIfNoAdminAction(
  userId: string,
  withdrawalId: string,
  otherPrincipalIds: string[] = [],
): Promise<void> {
  await withDb(async (client) => {
    for (const principalId of [userId, ...otherPrincipalIds]) {
      await client.query(
        "DELETE FROM api_command_receipts WHERE principal_id = $1",
        [principalId],
      );
    }
    const immutable = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM withdrawal_admin_actions
        WHERE withdrawal_id = $1`,
      [withdrawalId],
    );
    if (Number(immutable.rows[0]?.count ?? "0") > 0) return true;

    await client.query(
      "DELETE FROM withdrawal_admission_outbox WHERE withdrawal_id = $1",
      [withdrawalId],
    );
    await client.query(
      `DELETE FROM wallet_ledger
        WHERE reference_type = 'withdrawal' AND reference_id = $1`,
      [withdrawalId],
    );
    await client.query("DELETE FROM withdrawals WHERE id = $1", [withdrawalId]);
    await client.query(
      "DELETE FROM withdrawal_authorizations WHERE user_id = $1",
      [userId],
    );
    await client.query("DELETE FROM wallet_balances WHERE user_id = $1", [userId]);
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

describe("Withdrawal owner isolation and terminal race authority", () => {
  it(
    "cross-principal cancellation cannot reveal, mutate or release another user's withdrawal",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const ownerId = `withdraw-owner-${randomUUID()}`;
      const attackerId = `withdraw-attacker-${randomUUID()}`;
      const withdrawalId = await seedWithdrawal(ownerId);

      try {
        const result = await cancelWithdrawalIdempotently({
          withdrawalId,
          userId: attackerId,
          idempotencyKey: `withdraw-attacker-cancel-${randomUUID()}`,
          requestHash: hashApiCommand({ withdrawalId }),
        });
        assert.deepEqual(result, {
          ok: false,
          reason: "withdrawal_not_found",
          code: 404,
        });

        const authority = await withDb(async (client) => {
          const withdrawal = await client.query<{
            state: string;
            funds_reserved_at: Date | null;
          }>(
            "SELECT state, funds_reserved_at FROM withdrawals WHERE id = $1",
            [withdrawalId],
          );
          const balance = await client.query<{ held_balance: string }>(
            `SELECT held_balance::text AS held_balance
               FROM wallet_balances
              WHERE user_id = $1 AND asset = 'USDT'`,
            [ownerId],
          );
          const releases = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM wallet_ledger
              WHERE reference_type = 'withdrawal'
                AND reference_id = $1
                AND type = 'release'`,
            [withdrawalId],
          );
          const attackerReceipts = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM api_command_receipts
              WHERE principal_id = $1
                AND operation = 'withdrawal.cancel'`,
            [attackerId],
          );
          return {
            withdrawal: withdrawal.rows[0],
            heldBalance: balance.rows[0]?.held_balance,
            releases: Number(releases.rows[0]?.count ?? "0"),
            attackerReceipts: Number(attackerReceipts.rows[0]?.count ?? "0"),
          };
        });
        assert.equal(authority.enabled, true);
        if (authority.enabled) {
          assert.equal(authority.value.withdrawal?.state, "compliance_review");
          assert.ok(authority.value.withdrawal?.funds_reserved_at);
          assert.equal(authority.value.heldBalance, "2.000000000000000000");
          assert.equal(authority.value.releases, 0);
          assert.equal(authority.value.attackerReceipts, 0);
        }
      } finally {
        await cleanupIfNoAdminAction(ownerId, withdrawalId, [attackerId]);
      }
    },
  );

  it(
    "cancel racing Admin reject produces one terminal result, one release and one mandatory event",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const userId = `withdraw-race-owner-${randomUUID()}`;
      const adminId = `withdraw-race-admin-${randomUUID()}`;
      const withdrawalId = await seedWithdrawal(userId);
      const notes = "race terminal decision";

      try {
        const [cancelResult, adminResult] = await Promise.all([
          cancelWithdrawalIdempotently({
            withdrawalId,
            userId,
            idempotencyKey: `withdraw-race-cancel-${randomUUID()}`,
            requestHash: hashApiCommand({ withdrawalId }),
          }),
          adminActOnAuthoritativeWithdrawal({
            withdrawalId,
            adminId,
            action: "reject",
            notes,
            authorizationEvidence: adminEvidence(notes),
            idempotencyKey: `withdraw-race-admin-${randomUUID()}`,
            requestHash: hashApiCommand({
              withdrawalId,
              action: "reject",
              notes,
            }),
          }),
        ]);

        assert.equal(
          [cancelResult.ok, adminResult.ok].filter(Boolean).length,
          1,
        );
        const loser = cancelResult.ok ? adminResult : cancelResult;
        assert.equal(loser.ok, false);
        if (!loser.ok) {
          assert.equal(
            new Set([
              "invalid_state_transition",
              "withdrawal_cannot_be_cancelled",
            ]).has(loser.reason),
            true,
          );
          assert.equal(loser.code, 409);
        }

        const authority = await withDb(async (client) => {
          const withdrawal = await client.query<{
            state: string;
            funds_reserved_at: Date | null;
          }>(
            "SELECT state, funds_reserved_at FROM withdrawals WHERE id = $1",
            [withdrawalId],
          );
          const balance = await client.query<{
            available_balance: string;
            held_balance: string;
          }>(
            `SELECT available_balance::text AS available_balance,
                    held_balance::text AS held_balance
               FROM wallet_balances
              WHERE user_id = $1 AND asset = 'USDT'`,
            [userId],
          );
          const releases = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM wallet_ledger
              WHERE reference_type = 'withdrawal'
                AND reference_id = $1
                AND type = 'release'`,
            [withdrawalId],
          );
          const actions = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM withdrawal_admin_actions
              WHERE withdrawal_id = $1`,
            [withdrawalId],
          );
          const receipts = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM api_command_receipts
              WHERE status = 'completed'
                AND operation IN ('withdrawal.cancel', 'withdrawal.admin_action')
                AND response_body->>'withdrawalId' = $1`,
            [withdrawalId],
          );
          const events = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM sensitive_mutation_audit_events
              WHERE action IN ('withdrawal.cancel', 'withdrawal.admin.reject')
                AND resource_id = tecpey_withdrawal_evidence_hash(
                  'withdrawal', $1
                )`,
            [withdrawalId],
          );
          return {
            withdrawal: withdrawal.rows[0],
            balance: balance.rows[0],
            releases: Number(releases.rows[0]?.count ?? "0"),
            actions: Number(actions.rows[0]?.count ?? "0"),
            receipts: Number(receipts.rows[0]?.count ?? "0"),
            events: Number(events.rows[0]?.count ?? "0"),
          };
        });
        assert.equal(authority.enabled, true);
        if (authority.enabled) {
          assert.equal(
            new Set(["cancelled", "rejected"]).has(
              authority.value.withdrawal?.state ?? "",
            ),
            true,
          );
          assert.equal(authority.value.withdrawal?.funds_reserved_at, null);
          assert.deepEqual(authority.value.balance, {
            available_balance: "5.000000000000000000",
            held_balance: "0.000000000000000000",
          });
          assert.equal(authority.value.releases, 1);
          assert.equal(authority.value.receipts, 1);
          assert.equal(authority.value.events, 1);
          assert.equal(
            authority.value.actions,
            authority.value.withdrawal?.state === "rejected" ? 1 : 0,
          );
        }
      } finally {
        await cleanupIfNoAdminAction(userId, withdrawalId, [adminId]);
      }
    },
  );
});
