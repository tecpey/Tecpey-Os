import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Redis } from "ioredis";
import { NextRequest } from "next/server";
import { POST as authorizeWithdrawal } from "../../app/api/auth/withdraw/authorize/route";
import { withDb, withTx } from "../../lib/db";
import type {
  AMLProvider,
  KYCProvider,
  SanctionsProvider,
} from "../../lib/security/compliance";
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
import {
  encryptTotpSecret,
  generateTotp,
  generateTotpSecret,
  verifyTotpStep,
} from "../../lib/security/totp";
import { UNIFIED_SESSION_COOKIE } from "../../lib/unified-session";
import {
  cleanupBoundSessions,
  issueBoundSession,
} from "./session-authority-test-fixtures";

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
let verificationStep = Math.floor(Date.now() / 30_000) + 400_000;

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

function destination(): string {
  return `0x${"b".repeat(40)}`;
}

function authorizationRequest(input: {
  accessToken: string;
  idempotencyKey: string;
  code: string;
}): NextRequest {
  return new NextRequest("https://tecpey.ir/api/auth/withdraw/authorize", {
    method: "POST",
    headers: {
      origin: "https://tecpey.ir",
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
      cookie: `${UNIFIED_SESSION_COOKIE}=${input.accessToken}`,
      "user-agent": "withdrawal-evidence-route-test",
    },
    body: JSON.stringify({
      code: input.code,
      idempotencyKey: input.idempotencyKey,
      asset: "USDT",
      amount: "2",
      destinationAddress: destination(),
      destinationTag: null,
      network: "ethereum",
    }),
  });
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
      "withdrawal-prebroadcast-test-session",
    ),
    reviewReasonFingerprint: fingerprintWithdrawalReviewReason(notes),
  };
}

async function seedTwoFactor(userId: string, secret: string): Promise<void> {
  const seeded = await withDb(async (client) => {
    await client.query(
      `INSERT INTO user_2fa
         (user_id, encrypted_secret, backup_code_hashes, enabled, enabled_at,
          last_used_at)
       VALUES ($1, $2, '{}', TRUE, NOW(), NULL)
       ON CONFLICT (user_id) DO UPDATE
         SET encrypted_secret = EXCLUDED.encrypted_secret,
             enabled = TRUE,
             enabled_at = NOW(),
             last_used_at = NULL`,
      [userId, encryptTotpSecret(secret)],
    );
    return true;
  });
  assert.equal(seeded.enabled, true);
}

async function seedBalanceAndPrice(userId: string): Promise<void> {
  const seeded = await withDb(async (client) => {
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
  assert.equal(seeded.enabled, true);

  const price = await recordWithdrawalPriceSnapshot({
    asset: "USDT",
    priceUsd: "1",
    source: "prebroadcast-evidence-test",
    ttlSeconds: 120,
  });
  assert.ok(price);
}

async function seedCanonicalWithdrawal(userId: string): Promise<string> {
  const idempotencyKey = `withdraw-evidence-${randomUUID()}`;
  const canonical = canonicalizeWithdrawalCommand({
    userId,
    asset: "USDT",
    amount: "2",
    destinationAddress: destination(),
    destinationTag: null,
    network: "ethereum",
    idempotencyKey,
  });
  if (!canonical.ok) throw new Error(canonical.reason);

  await seedBalanceAndPrice(userId);
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
    deviceFingerprint: "prebroadcast-evidence-test",
    ip: "127.0.0.1",
    userAgent: "prebroadcast-evidence-test",
  });
  if (!created.ok) throw new Error(`withdrawal_seed_failed:${created.reason}`);
  return created.withdrawal.id;
}

async function cleanupUser(userId: string, accessJtis: string[] = []): Promise<void> {
  const cleaned = await withDb(async (client) => {
    await client.query(
      "DELETE FROM api_command_receipts WHERE principal_id = $1",
      [userId],
    );
    await client.query(
      `DELETE FROM withdrawal_admission_outbox
        WHERE withdrawal_id IN (
          SELECT id FROM withdrawals WHERE user_id = $1
        )`,
      [userId],
    );
    await client.query("DELETE FROM wallet_ledger WHERE wallet_id = $1", [userId]);
    await client.query("DELETE FROM withdrawals WHERE user_id = $1", [userId]);
    await client.query(
      "DELETE FROM withdrawal_authorizations WHERE user_id = $1",
      [userId],
    );
    await client.query("DELETE FROM wallet_balances WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM user_2fa WHERE user_id = $1", [userId]);
    return true;
  });
  assert.equal(cleaned.enabled, true);

  if (accessJtis.length > 0) {
    await cleanupBoundSessions({ userId, accessJtis, redis });
  }
}

async function installEvidenceRejectionTrigger(): Promise<void> {
  const installed = await withDb(async (client) => {
    await client.query(`
      CREATE OR REPLACE FUNCTION tecpey_test_reject_withdrawal_evidence()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.actor_id LIKE 'withdraw-evidence-reject-auth-%'
           AND NEW.action = 'withdrawal.authorization.issue' THEN
          RAISE EXCEPTION 'forced_withdrawal_authorization_evidence_rejection';
        END IF;
        IF NEW.actor_id LIKE 'withdraw-evidence-reject-admit-%'
           AND NEW.action IN (
             'withdrawal.admit', 'withdrawal.block', 'withdrawal.review'
           ) THEN
          RAISE EXCEPTION 'forced_withdrawal_admission_evidence_rejection';
        END IF;
        IF NEW.actor_id LIKE 'withdraw-evidence-reject-cancel-%'
           AND NEW.action = 'withdrawal.cancel' THEN
          RAISE EXCEPTION 'forced_withdrawal_cancel_evidence_rejection';
        END IF;
        IF NEW.actor_id LIKE 'admin-evidence-reject-%'
           AND NEW.action = 'withdrawal.admin.reject' THEN
          RAISE EXCEPTION 'forced_withdrawal_admin_evidence_rejection';
        END IF;
        RETURN NEW;
      END;
      $$;
      DROP TRIGGER IF EXISTS withdrawal_evidence_test_reject
        ON sensitive_mutation_audit_events;
      CREATE TRIGGER withdrawal_evidence_test_reject
        BEFORE INSERT ON sensitive_mutation_audit_events
        FOR EACH ROW
        EXECUTE FUNCTION tecpey_test_reject_withdrawal_evidence();
    `);
    return true;
  });
  assert.equal(installed.enabled, true);
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
  await installEvidenceRejectionTrigger();
});

after(async () => {
  if (integrationConfigured) {
    await withDb(async (client) => {
      await client.query(
        `DROP TRIGGER IF EXISTS withdrawal_evidence_test_reject
           ON sensitive_mutation_audit_events`,
      );
      await client.query(
        "DROP FUNCTION IF EXISTS tecpey_test_reject_withdrawal_evidence()",
      );
      return true;
    });
  }
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

describe("Withdrawal pre-broadcast mandatory evidence", () => {
  it(
    "rolls back authorization, 2FA timestamp and receipt when evidence is rejected",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const userId = `withdraw-evidence-reject-auth-${randomUUID()}`;
      const session = await issueBoundSession({
        userId,
        deviceInfo: "withdrawal-evidence-route-test",
        ip: "127.0.0.1",
      });
      const secret = generateTotpSecret();
      await seedTwoFactor(userId, secret);
      const idempotencyKey = `withdraw-auth-${randomUUID()}`;

      try {
        const response = await authorizeWithdrawal(
          authorizationRequest({
            accessToken: session.accessToken,
            idempotencyKey,
            code: generateTotp(secret),
          }),
        );
        assert.equal(response.status, 503);

        const state = await withDb(async (client) => {
          const authorizations = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM withdrawal_authorizations WHERE user_id = $1`,
            [userId],
          );
          const factor = await client.query<{ last_used_at: Date | null }>(
            "SELECT last_used_at FROM user_2fa WHERE user_id = $1",
            [userId],
          );
          const receipts = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM api_command_receipts
              WHERE principal_id = $1 AND operation = 'withdrawal.authorize'`,
            [userId],
          );
          return {
            authorizations: Number(authorizations.rows[0]?.count ?? "0"),
            lastUsedAt: factor.rows[0]?.last_used_at ?? null,
            receipts: Number(receipts.rows[0]?.count ?? "0"),
          };
        });
        assert.equal(state.enabled, true);
        if (state.enabled) {
          assert.deepEqual(state.value, {
            authorizations: 0,
            lastUsedAt: null,
            receipts: 0,
          });
        }
      } finally {
        await cleanupUser(userId, [session.accessJti]);
      }
    },
  );

  it(
    "replays invalid TOTP deterministically with one receipt and one rejection event",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const userId = `withdraw-evidence-invalid-totp-${randomUUID()}`;
      const session = await issueBoundSession({
        userId,
        deviceInfo: "withdrawal-evidence-route-test",
        ip: "127.0.0.1",
      });
      const secret = generateTotpSecret();
      await seedTwoFactor(userId, secret);
      let invalidCode = "000000";
      while (verifyTotpStep(secret, invalidCode) !== null) {
        invalidCode = String((Number(invalidCode) + 1) % 1_000_000).padStart(
          6,
          "0",
        );
      }
      const idempotencyKey = `withdraw-invalid-${randomUUID()}`;

      try {
        const first = await authorizeWithdrawal(
          authorizationRequest({
            accessToken: session.accessToken,
            idempotencyKey,
            code: invalidCode,
          }),
        );
        const replay = await authorizeWithdrawal(
          authorizationRequest({
            accessToken: session.accessToken,
            idempotencyKey,
            code: invalidCode,
          }),
        );
        assert.equal(first.status, 401);
        assert.equal(replay.status, 401);

        const state = await withDb(async (client) => {
          const receipts = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM api_command_receipts
              WHERE principal_id = $1
                AND operation = 'withdrawal.authorize'
                AND status = 'completed'`,
            [userId],
          );
          const events = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM sensitive_mutation_audit_events
              WHERE actor_id = $1
                AND action = 'withdrawal.authorization.reject'`,
            [userId],
          );
          const authorizations = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM withdrawal_authorizations WHERE user_id = $1`,
            [userId],
          );
          return {
            receipts: Number(receipts.rows[0]?.count ?? "0"),
            events: Number(events.rows[0]?.count ?? "0"),
            authorizations: Number(authorizations.rows[0]?.count ?? "0"),
          };
        });
        assert.equal(state.enabled, true);
        if (state.enabled) {
          assert.deepEqual(state.value, {
            receipts: 1,
            events: 1,
            authorizations: 0,
          });
        }
      } finally {
        await cleanupUser(userId, [session.accessJti]);
      }
    },
  );

  it(
    "rolls back authorization consumption, withdrawal, hold, ledger and outbox when admission evidence is rejected",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const userId = `withdraw-evidence-reject-admit-${randomUUID()}`;
      const idempotencyKey = `withdraw-reject-admit-${randomUUID()}`;
      const canonical = canonicalizeWithdrawalCommand({
        userId,
        asset: "USDT",
        amount: "2",
        destinationAddress: destination(),
        destinationTag: null,
        network: "ethereum",
        idempotencyKey,
      });
      if (!canonical.ok) throw new Error(canonical.reason);

      await seedBalanceAndPrice(userId);
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

      try {
        const result = await createAuthoritativeWithdrawal({
          ...canonical.command,
          authorizationId: authorization.value.id,
          deviceFingerprint: "prebroadcast-evidence-test",
          ip: "127.0.0.1",
          userAgent: "prebroadcast-evidence-test",
        });
        assert.deepEqual(result, {
          ok: false,
          reason: "withdrawal_admission_failed",
          code: 503,
        });

        const state = await withDb(async (client) => {
          const storedAuthorization = await client.query<{
            consumed_at: Date | null;
          }>(
            `SELECT consumed_at FROM withdrawal_authorizations
              WHERE id = $1`,
            [authorization.value.id],
          );
          const withdrawals = await client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM withdrawals WHERE user_id = $1",
            [userId],
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
          const ledger = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM wallet_ledger
              WHERE wallet_id = $1 AND reference_type = 'withdrawal'`,
            [userId],
          );
          const outbox = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM withdrawal_admission_outbox
              WHERE withdrawal_id IN (
                SELECT id FROM withdrawals WHERE user_id = $1
              )`,
            [userId],
          );
          return {
            consumedAt: storedAuthorization.rows[0]?.consumed_at ?? null,
            withdrawals: Number(withdrawals.rows[0]?.count ?? "0"),
            balance: balance.rows[0],
            ledger: Number(ledger.rows[0]?.count ?? "0"),
            outbox: Number(outbox.rows[0]?.count ?? "0"),
          };
        });
        assert.equal(state.enabled, true);
        if (state.enabled) {
          assert.equal(state.value.consumedAt, null);
          assert.equal(state.value.withdrawals, 0);
          assert.deepEqual(state.value.balance, {
            available_balance: "5.000000000000000000",
            held_balance: "0.000000000000000000",
          });
          assert.equal(state.value.ledger, 0);
          assert.equal(state.value.outbox, 0);
        }
      } finally {
        await cleanupUser(userId);
      }
    },
  );

  it(
    "rolls back cancellation, release, outbox and receipt when cancel evidence is rejected",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const userId = `withdraw-evidence-reject-cancel-${randomUUID()}`;
      const withdrawalId = await seedCanonicalWithdrawal(userId);
      const idempotencyKey = `withdraw-cancel-${randomUUID()}`;

      try {
        const result = await cancelWithdrawalIdempotently({
          withdrawalId,
          userId,
          idempotencyKey,
          requestHash: hashApiCommand({ withdrawalId }),
        });
        assert.deepEqual(result, {
          ok: false,
          reason: "withdrawal_cancel_failed",
          code: 503,
        });

        const state = await withDb(async (client) => {
          const withdrawal = await client.query<{
            state: string;
            funds_reserved_at: Date | null;
          }>(
            `SELECT state, funds_reserved_at FROM withdrawals WHERE id = $1`,
            [withdrawalId],
          );
          const balance = await client.query<{ held_balance: string }>(
            `SELECT held_balance::text AS held_balance
               FROM wallet_balances
              WHERE user_id = $1 AND asset = 'USDT'`,
            [userId],
          );
          const releases = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM wallet_ledger
              WHERE wallet_id = $1
                AND reference_id = $2
                AND type = 'release'`,
            [userId, withdrawalId],
          );
          const receipts = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM api_command_receipts
              WHERE principal_id = $1 AND operation = 'withdrawal.cancel'`,
            [userId],
          );
          const outbox = await client.query<{ status: string }>(
            `SELECT status FROM withdrawal_admission_outbox
              WHERE withdrawal_id = $1`,
            [withdrawalId],
          );
          return {
            withdrawal: withdrawal.rows[0],
            heldBalance: balance.rows[0]?.held_balance,
            releases: Number(releases.rows[0]?.count ?? "0"),
            receipts: Number(receipts.rows[0]?.count ?? "0"),
            outboxStatus: outbox.rows[0]?.status,
          };
        });
        assert.equal(state.enabled, true);
        if (state.enabled) {
          assert.equal(state.value.withdrawal?.state, "compliance_review");
          assert.ok(state.value.withdrawal?.funds_reserved_at);
          assert.equal(state.value.heldBalance, "2.000000000000000000");
          assert.equal(state.value.releases, 0);
          assert.equal(state.value.receipts, 0);
          assert.notEqual(state.value.outboxStatus, "cancelled");
        }
      } finally {
        await cleanupUser(userId);
      }
    },
  );

  it(
    "rolls back Admin reject, release, action, outbox and receipt when evidence is rejected",
    { skip: !integrationConfigured, timeout: 45_000 },
    async () => {
      const userId = `withdraw-admin-target-${randomUUID()}`;
      const adminId = `admin-evidence-reject-${randomUUID()}`;
      const withdrawalId = await seedCanonicalWithdrawal(userId);
      const notes = "mandatory evidence rollback";
      const idempotencyKey = `withdraw-admin-${randomUUID()}`;

      try {
        const result = await adminActOnAuthoritativeWithdrawal({
          withdrawalId,
          adminId,
          action: "reject",
          notes,
          authorizationEvidence: adminEvidence(notes),
          idempotencyKey,
          requestHash: hashApiCommand({
            withdrawalId,
            action: "reject",
            notes,
          }),
        });
        assert.deepEqual(result, {
          ok: false,
          reason: "withdrawal_admin_action_failed",
          code: 503,
        });

        const state = await withDb(async (client) => {
          const withdrawal = await client.query<{
            state: string;
            funds_reserved_at: Date | null;
          }>(
            `SELECT state, funds_reserved_at FROM withdrawals WHERE id = $1`,
            [withdrawalId],
          );
          const balance = await client.query<{ held_balance: string }>(
            `SELECT held_balance::text AS held_balance
               FROM wallet_balances
              WHERE user_id = $1 AND asset = 'USDT'`,
            [userId],
          );
          const releases = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM wallet_ledger
              WHERE wallet_id = $1
                AND reference_id = $2
                AND type = 'release'`,
            [userId, withdrawalId],
          );
          const actions = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM withdrawal_admin_actions
              WHERE withdrawal_id = $1`,
            [withdrawalId],
          );
          const receipts = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM api_command_receipts
              WHERE principal_type = 'admin'
                AND principal_id = $1
                AND operation = 'withdrawal.admin_action'`,
            [adminId],
          );
          const outbox = await client.query<{ status: string }>(
            `SELECT status FROM withdrawal_admission_outbox
              WHERE withdrawal_id = $1`,
            [withdrawalId],
          );
          return {
            withdrawal: withdrawal.rows[0],
            heldBalance: balance.rows[0]?.held_balance,
            releases: Number(releases.rows[0]?.count ?? "0"),
            actions: Number(actions.rows[0]?.count ?? "0"),
            receipts: Number(receipts.rows[0]?.count ?? "0"),
            outboxStatus: outbox.rows[0]?.status,
          };
        });
        assert.equal(state.enabled, true);
        if (state.enabled) {
          assert.equal(state.value.withdrawal?.state, "compliance_review");
          assert.ok(state.value.withdrawal?.funds_reserved_at);
          assert.equal(state.value.heldBalance, "2.000000000000000000");
          assert.equal(state.value.releases, 0);
          assert.equal(state.value.actions, 0);
          assert.equal(state.value.receipts, 0);
          assert.notEqual(state.value.outboxStatus, "cancelled");
        }
      } finally {
        await cleanupUser(userId);
        await withDb(async (client) => {
          await client.query(
            `DELETE FROM api_command_receipts
              WHERE principal_type = 'admin' AND principal_id = $1`,
            [adminId],
          );
          return true;
        });
      }
    },
  );
});
