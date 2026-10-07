import assert from "node:assert/strict";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../lib/db-migration-plan";
import {
  createInAppNotification,
  type InAppNotificationRequest,
  type NotificationCreationResult,
} from "../lib/notifications/creation";
import { NOTIFICATION_DIGEST_MAX_CONSTITUENTS } from "../lib/notifications/digest";
import {
  resolveNotificationPrincipal,
  type NotificationPrincipal,
} from "../lib/notifications/principal";
import { upsertNotificationPreference } from "../lib/notifications/preferences";

const databaseUrl = process.env.DATABASE_URL;

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
    const principal = await resolveNotificationPrincipal(
      client,
      {
        accountId,
        studentId: null,
        email: `${tenantId}@notification-digest.test`,
        locale: "en",
      },
      tenantId,
    );
    await upsertNotificationPreference(client, principal.id, {
      notificationClass: "academy",
      channel: "in_app",
      enabled: true,
      cadence: "digest",
    });
    return principal;
  });
}

function digestRequest(
  correlationKey: string,
  now: string,
  locale: "fa" | "en" = "en",
): InAppNotificationRequest {
  return {
    notificationClass: "academy",
    sourceType: "academy_progress",
    sourceId: crypto.randomUUID(),
    title: locale === "fa" ? "به‌روزرسانی آکادمی" : "Academy update",
    body:
      locale === "fa"
        ? "یک به‌روزرسانی جدید در مسیر یادگیری شما آماده است."
        : "A new learning-path update is ready for you.",
    locale,
    actionUrl: "/academy/profile",
    urgency: "normal",
    priority: 3,
    cadence: "digest",
    correlationKey,
    expiresAt: new Date(Date.parse(now) + 48 * 60 * 60 * 1000).toISOString(),
    templateAvailable: true,
    metadata: { lessonFamily: "academy-progress" },
  };
}

function nonNullIds(
  results: readonly NotificationCreationResult[],
  field: "notificationId" | "outboxId",
): Set<string> {
  return new Set(
    results
      .map((result) => result[field])
      .filter((value): value is string => value !== null),
  );
}

test(
  "digest cadence coalesces bounded constituents with replay, locale, and tenant isolation",
  { skip: !databaseUrl, timeout: 30_000 },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 8 });
    try {
      const migrationClient = await pool.connect();
      try {
        await applyDatabaseMigrationsWithLock(migrationClient);
      } finally {
        migrationClient.release();
      }

      const proofId = crypto.randomUUID();
      const accountId = `academy:digest-${proofId}@test.local`;
      const principalA = await createTenantPrincipal(
        pool,
        `digest-a-${proofId}`,
        accountId,
      );
      const now = new Date().toISOString();
      const requests = Array.from(
        { length: NOTIFICATION_DIGEST_MAX_CONSTITUENTS + 1 },
        (_, index) => digestRequest(`academy:digest:${proofId}:${index}`, now),
      );

      const results = await inTransaction(pool, async (client) => {
        const created: NotificationCreationResult[] = [];
        for (const item of requests) {
          created.push(
            await createInAppNotification(client, principalA, item, { now }),
          );
        }
        return created;
      });

      assert.equal(results.every((result) => result.decision === "digest"), true);
      assert.equal(results.every((result) => result.status === "created"), true);
      assert.equal(nonNullIds(results, "notificationId").size, 2);
      assert.equal(nonNullIds(results, "outboxId").size, 2);

      const inspector = await pool.connect();
      try {
        const groups = await inspector.query<{
          notification_id: string;
          constituent_count: number;
        }>(
          `SELECT notification_id, COUNT(*)::int AS constituent_count
             FROM notification_intents
            WHERE tenant_id = $1
              AND principal_id = $2
              AND notification_class = 'academy'
              AND policy_decision = 'digest'
              AND source_type = 'academy_progress'
            GROUP BY notification_id
            ORDER BY constituent_count DESC`,
          [principalA.tenantId, principalA.id],
        );
        assert.deepEqual(
          groups.rows.map((row) => row.constituent_count),
          [NOTIFICATION_DIGEST_MAX_CONSTITUENTS, 1],
        );
      } finally {
        inspector.release();
      }

      const replay = await inTransaction(pool, (client) =>
        createInAppNotification(client, principalA, requests[0]!, { now }),
      );
      assert.equal(replay.status, "replayed");
      assert.equal(replay.intentId, results[0]?.intentId);
      assert.equal(replay.notificationId, results[0]?.notificationId);
      assert.equal(replay.outboxId, results[0]?.outboxId);

      const fa = await inTransaction(pool, (client) =>
        createInAppNotification(
          client,
          principalA,
          digestRequest(`academy:digest:${proofId}:fa`, now, "fa"),
          { now },
        ),
      );
      assert.equal(fa.decision, "digest");
      assert.equal(
        nonNullIds([...results, fa], "notificationId").size,
        3,
      );

      const principalB = await createTenantPrincipal(
        pool,
        `digest-b-${proofId}`,
        accountId,
      );
      const tenantB = await inTransaction(pool, (client) =>
        createInAppNotification(
          client,
          principalB,
          digestRequest(`academy:digest:${proofId}:tenant-b`, now),
          { now },
        ),
      );
      assert.equal(tenantB.decision, "digest");
      assert.notEqual(tenantB.notificationId, results[0]?.notificationId);
      assert.notEqual(tenantB.outboxId, results[0]?.outboxId);
    } finally {
      await pool.end();
    }
  },
);
