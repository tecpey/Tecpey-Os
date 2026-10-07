import assert from "node:assert/strict";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../lib/db-migration-plan";
import {
  createInAppNotification,
  type InAppNotificationRequest,
  type NotificationCreationResult,
} from "../lib/notifications/creation";
import {
  resolveNotificationPrincipal,
  type NotificationPrincipal,
} from "../lib/notifications/principal";

const databaseUrl = process.env.DATABASE_URL;

function hhmm(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(
    date.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

function request(
  correlationKey: string,
  now: string,
  overrides: Partial<InAppNotificationRequest> = {},
): InAppNotificationRequest {
  return {
    notificationClass: "academy",
    sourceType: "fatigue_concurrency_proof",
    sourceId: crypto.randomUUID(),
    title: "Learning update",
    body: "A governed learning update is ready in TecPey Academy.",
    locale: "en",
    actionUrl: "/academy/profile",
    urgency: "normal",
    priority: 3,
    cadence: "instant",
    correlationKey,
    expiresAt: new Date(Date.parse(now) + 86_400_000).toISOString(),
    templateAvailable: true,
    metadata: { proof: "notification-fatigue-v2" },
    ...overrides,
  };
}

async function inTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await operation(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function createTenantPrincipal(
  pool: Pool,
  tenantId: string,
  accountId: string,
): Promise<NotificationPrincipal> {
  return inTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO platform_tenants (id, slug, display_name, plan)
       VALUES ($1, $1, $1, 'enterprise')`,
      [tenantId],
    );
    return resolveNotificationPrincipal(
      client,
      {
        accountId,
        studentId: null,
        email: `${tenantId}@notification-fatigue.test`,
        locale: "en",
      },
      tenantId,
    );
  });
}

async function createCommitted(
  pool: Pool,
  principal: NotificationPrincipal,
  notificationRequest: InAppNotificationRequest,
  now: string,
): Promise<NotificationCreationResult> {
  return inTransaction(pool, (client) =>
    createInAppNotification(client, principal, notificationRequest, { now }),
  );
}

async function setQuietHours(
  pool: Pool,
  principal: NotificationPrincipal,
  now: Date,
): Promise<void> {
  await inTransaction(pool, async (client) => {
    await client.query(
      `UPDATE notification_settings
          SET timezone = 'UTC',
              quiet_start = $2::time,
              quiet_end = $3::time,
              updated_at = NOW()
        WHERE principal_id = $1`,
      [
        principal.id,
        hhmm(new Date(now.getTime() - 60 * 60 * 1000)),
        hhmm(new Date(now.getTime() + 60 * 60 * 1000)),
      ],
    );
  });
}

function decisionCount(
  results: readonly NotificationCreationResult[],
  decision: NotificationCreationResult["decision"],
): number {
  return results.filter((result) => result.decision === decision).length;
}

test(
  "fatigue admission serializes distinct correlations, reserves pending work, and isolates tenants",
  { skip: !databaseUrl, timeout: 30_000 },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 20 });
    try {
      const migrationClient = await pool.connect();
      try {
        await applyDatabaseMigrationsWithLock(migrationClient);
      } finally {
        migrationClient.release();
      }

      const proofId = crypto.randomUUID();
      const tenantA = `fatigue-a-${proofId}`;
      const tenantB = `fatigue-b-${proofId}`;
      const sharedAccountId = `academy:fatigue-${proofId}@test.local`;
      const principalA = await createTenantPrincipal(
        pool,
        tenantA,
        sharedAccountId,
      );
      const nowDate = new Date();
      const now = nowDate.toISOString();
      await setQuietHours(pool, principalA, nowDate);

      const burstPrefix = `academy:fatigue-burst:${proofId}`;
      const burst = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          createCommitted(
            pool,
            principalA,
            request(`${burstPrefix}:${index}`, now),
            now,
          ),
        ),
      );

      // Academy's optional interruption budget is 4. Distinct correlations are
      // concurrent here, so this is the proof that the class budget lock — not
      // the correlation lock — owns admission. Quiet-hours work occupies those
      // four reservations and the rest is moved to digest.
      assert.equal(decisionCount(burst, "defer"), 4);
      assert.equal(decisionCount(burst, "digest"), 4);
      assert.equal(decisionCount(burst, "allow"), 0);

      const inspector = await pool.connect();
      try {
        const active = await inspector.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM platform_notifications n
             JOIN notification_outbox o
               ON o.notification_id = n.id
              AND o.channel = 'in_app'
            WHERE n.tenant_id = $1
              AND n.principal_id = $2
              AND n.notification_class = 'academy'
              AND n.policy_decision IN ('allow', 'defer')
              AND n.delivered_at IS NULL
              AND o.status IN ('pending', 'processing', 'failed_retryable')`,
          [tenantA, principalA.id],
        );
        assert.equal(active.rows[0]?.count, "4");
      } finally {
        inspector.release();
      }

      // Retryable work continues to own its reservation; it must not reopen a
      // fifth interruptive slot.
      const retryCandidate = burst.find(
        (result) => result.decision === "defer" && result.outboxId,
      );
      assert.ok(retryCandidate?.outboxId);
      await inTransaction(pool, async (client) => {
        await client.query(
          `UPDATE notification_outbox
              SET status = 'failed_retryable', updated_at = NOW()
            WHERE id = $1`,
          [retryCandidate.outboxId],
        );
      });
      const underRetryPressure = await createCommitted(
        pool,
        principalA,
        request(`academy:fatigue-retry-pressure:${proofId}`, now),
        now,
      );
      assert.equal(underRetryPressure.decision, "digest");
      assert.equal(underRetryPressure.reason, "frequency_cap");

      // A terminal cancellation releases exactly one derived reservation. The
      // replacement is still quiet-hours work, so it is deferred rather than
      // delivered immediately.
      await inTransaction(pool, async (client) => {
        await client.query(
          `UPDATE notification_outbox
              SET status = 'cancelled', terminal_at = NOW(), updated_at = NOW()
            WHERE id = $1`,
          [retryCandidate.outboxId],
        );
      });
      const afterCancel = await createCommitted(
        pool,
        principalA,
        request(`academy:fatigue-after-cancel:${proofId}`, now),
        now,
      );
      assert.equal(afterCancel.decision, "defer");
      assert.equal(afterCancel.reason, "quiet_hours");

      // Expired/terminal work also releases capacity. Keep this transition
      // local to the proof row so the test cannot sweep unrelated test data.
      const expiryCandidate = burst.find(
        (result) =>
          result.decision === "defer" &&
          result.outboxId &&
          result.outboxId !== retryCandidate.outboxId,
      );
      assert.ok(expiryCandidate?.outboxId);
      await inTransaction(pool, async (client) => {
        await client.query(
          `UPDATE notification_outbox
              SET status = 'expired', terminal_at = NOW(), updated_at = NOW()
            WHERE id = $1`,
          [expiryCandidate.outboxId],
        );
      });
      const afterExpiry = await createCommitted(
        pool,
        principalA,
        request(`academy:fatigue-after-expiry:${proofId}`, now),
        now,
      );
      assert.equal(afterExpiry.decision, "defer");
      assert.equal(afterExpiry.reason, "quiet_hours");

      // Mandatory security delivery is outside the optional Academy fatigue
      // budget and high urgency retains its governed quiet-hours bypass.
      const mandatory = await createCommitted(
        pool,
        principalA,
        request(`security:fatigue-negative:${proofId}`, now, {
          notificationClass: "security_critical",
          sourceType: "security_control_plane",
          title: "Security alert",
          body: "A security-sensitive account event requires your attention.",
          actionUrl: "/account/security",
          urgency: "high",
          priority: 10,
          cadence: "instant",
        }),
        now,
      );
      assert.equal(mandatory.decision, "allow");
      assert.equal(mandatory.reason, "critical_policy_allowed");

      // The correlation lock remains an independent replay authority even after
      // the class-wide budget has serialized admission.
      const replayKey = `academy:fatigue-replay:${proofId}`;
      const replayRequest = request(replayKey, now);
      const replayPair = await Promise.all([
        createCommitted(pool, principalA, replayRequest, now),
        createCommitted(pool, principalA, replayRequest, now),
      ]);
      assert.deepEqual(
        replayPair.map((result) => result.status).sort(),
        ["created", "replayed"],
      );
      assert.equal(replayPair[0]?.intentId, replayPair[1]?.intentId);
      assert.equal(replayPair[0]?.notificationId, replayPair[1]?.notificationId);
      assert.equal(replayPair[0]?.outboxId, replayPair[1]?.outboxId);

      // The same account-shaped identity in a different tenant receives an
      // independent budget. Tenant A being full must not suppress Tenant B.
      const principalB = await createTenantPrincipal(
        pool,
        tenantB,
        sharedAccountId,
      );
      const tenantBBurst = await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          createCommitted(
            pool,
            principalB,
            request(`academy:tenant-b:${proofId}:${index}`, now),
            now,
          ),
        ),
      );
      assert.equal(decisionCount(tenantBBurst, "allow"), 4);
      assert.equal(decisionCount(tenantBBurst, "digest"), 1);
    } finally {
      await pool.end();
    }
  },
);
