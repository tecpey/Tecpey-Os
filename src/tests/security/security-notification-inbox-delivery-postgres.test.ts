import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { PLATFORM } from "../../lib/platform-config";
import { resolveNotificationPrincipal } from "../../lib/notifications/principal";
import {
  migrateLegacyNotificationsForPrincipal,
  securityNotificationCorrelationKey,
} from "../../lib/notifications/repository";
import type { NotificationPrincipal } from "../../lib/notifications/principal";

// Delivery guard for security_notifications.
//
// emitSecurityNotification persisted withdrawal/device/2FA security alerts to
// security_notifications, but nothing ever read the table — the alerts were
// stranded and never reached the user. The governed inbox drain now also delivers
// them into the inbox and marks the source row delivered. These cases keep that
// closed.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const TENANT_A = PLATFORM.DEFAULT_TENANT_ID;

async function withRollback<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    return await fn(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

async function seedSecurityNotification(
  client: PoolClient,
  userId: string,
  overrides: Partial<{ type: string; title: string; body: string; read: boolean }> = {},
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO security_notifications (id, user_id, type, title, body, metadata, read, delivered)
       VALUES ($1, $2, $3, $4, $5, '{"asset":"USDT"}'::jsonb, $6, FALSE)`,
    [
      id,
      userId,
      overrides.type ?? "withdrawal_blocked",
      overrides.title ?? "Withdrawal Blocked",
      overrides.body ?? "Your withdrawal was blocked.",
      overrides.read ?? false,
    ],
  );
  return id;
}

async function principalForAccount(
  client: PoolClient,
  accountId: string,
): Promise<NotificationPrincipal> {
  return resolveNotificationPrincipal(
    client,
    { accountId, studentId: null, email: null, locale: "fa" },
    TENANT_A,
  );
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true });
  const client = await pool.connect();
  try {
    await applyDatabaseMigrationsWithLock(client);
  } finally {
    client.release();
  }
});

after(async () => {
  if (!pool) return;
  await pool.end();
  pool = null;
});

describe("security notification inbox delivery", () => {
  it(
    "delivers a persisted security alert into the governed inbox and marks it delivered",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client) => {
        const accountId = `acct-${randomUUID()}`;
        const secId = await seedSecurityNotification(client, accountId, {
          title: "Withdrawal Blocked",
        });

        const principal = await principalForAccount(client, accountId);
        const migrated = await migrateLegacyNotificationsForPrincipal(client, principal);
        assert.ok(migrated >= 1, "the security alert should be delivered into the inbox");

        const inbox = await client.query<{
          notification_class: string;
          source_type: string;
          title: string;
          correlation_key: string;
          delivered_at: Date | null;
        }>(
          `SELECT notification_class, source_type, title, correlation_key, delivered_at
             FROM platform_notifications
            WHERE tenant_id = $1 AND principal_id = $2
              AND source_type = 'legacy_security_notification'`,
          [TENANT_A, principal.id],
        );
        assert.equal(inbox.rows.length, 1);
        assert.equal(inbox.rows[0].notification_class, "security_critical");
        assert.equal(inbox.rows[0].title, "Withdrawal Blocked");
        assert.equal(inbox.rows[0].correlation_key, securityNotificationCorrelationKey(secId));
        assert.ok(inbox.rows[0].delivered_at, "a security alert is delivered, not deferred");

        // The source row is marked delivered — the semantics its schema documented.
        const src = await client.query<{ delivered: boolean }>(
          `SELECT delivered FROM security_notifications WHERE id = $1`,
          [secId],
        );
        assert.equal(src.rows[0].delivered, true);
      });
    },
  );

  it(
    "is idempotent — a redelivery run drains nothing and never duplicates",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client) => {
        const accountId = `acct-${randomUUID()}`;
        await seedSecurityNotification(client, accountId);

        const principal = await principalForAccount(client, accountId);
        const first = await migrateLegacyNotificationsForPrincipal(client, principal);
        assert.ok(first >= 1);

        const second = await migrateLegacyNotificationsForPrincipal(client, principal);
        assert.equal(second, 0, "a second run must not redeliver the same alert");

        const count = await client.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM platform_notifications
            WHERE tenant_id = $1 AND principal_id = $2
              AND source_type = 'legacy_security_notification'`,
          [TENANT_A, principal.id],
        );
        assert.equal(count.rows[0].n, "1");
      });
    },
  );

  it(
    "does not deliver another account's security alerts",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client) => {
        const mine = `acct-${randomUUID()}`;
        const other = `acct-${randomUUID()}`;
        await seedSecurityNotification(client, other, { title: "Not mine" });

        const principal = await principalForAccount(client, mine);
        const migrated = await migrateLegacyNotificationsForPrincipal(client, principal);
        assert.equal(migrated, 0, "another account's alerts must not reach my inbox");
      });
    },
  );
});
