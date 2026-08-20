import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../lib/db-migration-plan";
import { migrateLegacyNotificationsForPrincipal } from "../lib/notifications/repository";
import { resolveNotificationPrincipal } from "../lib/notifications/principal";

// marketing_campaign is the only class the policy marks consentRequired, so it is
// the platform's single consent gate. The legacy drain used to walk straight past
// it: every migrated row was stamped policy_decision 'allow' with a delivered_at,
// so a Command Center campaign — written through createSmartNotification into
// notification_center with metadata.campaign — reached the inbox of a principal
// who had never granted marketing consent, and the audit trail claimed the policy
// permitted it.
//
// Classification alone did not close that. These tests exercise the real drain
// against PostgreSQL, because the gate lives in the INSERT and a source-scan
// could not tell a working gate from a decorative one.

const databaseUrl = process.env.DATABASE_URL;

async function withRolledBackTest(
  callback: (client: PoolClient) => Promise<void>,
): Promise<void> {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const client = await pool.connect();
  try {
    await applyDatabaseMigrationsWithLock(client);
    await client.query("BEGIN");
    await callback(client);
    await client.query("ROLLBACK");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

type Seeded = {
  principalId: string;
  studentId: string;
  campaignId: string;
  supportId: string;
};

async function seed(client: PoolClient, prefix: string): Promise<Seeded> {
  const studentId = crypto.randomUUID();
  await client.query(
    `INSERT INTO academy_students (id, email) VALUES ($1::uuid, $2)`,
    [studentId, `${prefix}-${studentId}@consent.test`],
  );

  const principal = await resolveNotificationPrincipal(client, {
    accountId: null,
    studentId,
    email: null,
    locale: "fa",
  });

  // A Command Center broadcast: legacy type "system" carrying metadata.campaign.
  const campaign = await client.query<{ id: string }>(
    `INSERT INTO notification_center
       (tenant_id, workspace_id, student_id, type, title, body, priority, metadata)
     VALUES ($1, 'main', $2::uuid, 'system', 'Campaign', 'Body', 1,
             '{"campaign":"command-center"}'::jsonb)
     RETURNING id`,
    [principal.tenantId, studentId],
  );

  // A genuine support notification, which carries no consent requirement.
  const support = await client.query<{ id: string }>(
    `INSERT INTO notification_center
       (tenant_id, workspace_id, student_id, type, title, body, priority, metadata)
     VALUES ($1, 'main', $2::uuid, 'system', 'Support', 'Body', 1, '{}'::jsonb)
     RETURNING id`,
    [principal.tenantId, studentId],
  );

  return {
    principalId: principal.id,
    studentId,
    campaignId: campaign.rows[0].id,
    supportId: support.rows[0].id,
  };
}

async function migratedRow(client: PoolClient, principalId: string, legacyId: string) {
  const result = await client.query<{
    notification_class: string;
    policy_decision: string;
    policy_reason: string;
    delivered_at: Date | null;
  }>(
    `SELECT notification_class, policy_decision, policy_reason, delivered_at
       FROM platform_notifications
      WHERE principal_id = $1 AND correlation_key = $2`,
    [principalId, `legacy:notification_center:${legacyId}`],
  );
  return result.rows[0] ?? null;
}

test("a legacy campaign is withheld from a principal without marketing consent", async () => {
  await withRolledBackTest(async (client) => {
    const seeded = await seed(client, "no-consent");

    const principal = await resolveNotificationPrincipal(client, {
      accountId: null,
      studentId: seeded.studentId,
      email: null,
      locale: "fa",
    });
    await migrateLegacyNotificationsForPrincipal(client, principal);

    const campaign = await migratedRow(client, seeded.principalId, seeded.campaignId);
    assert.ok(campaign, "the campaign row must still be written so it cannot be reprocessed forever");
    assert.equal(campaign.notification_class, "marketing_campaign");
    assert.equal(campaign.policy_reason, "marketing_consent_required");
    assert.equal(
      campaign.delivered_at,
      null,
      "an unconsented marketing campaign must never carry a delivered_at",
    );

    // The inbox surfaces exactly what has been delivered, so the absent
    // delivered_at is what actually keeps this out of the user's view.
    const visible = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM platform_notifications
        WHERE principal_id = $1
          AND notification_class = 'marketing_campaign'
          AND delivered_at IS NOT NULL`,
      [seeded.principalId],
    );
    assert.equal(visible.rows[0].count, "0");
  });
});

test("consent-free classes still migrate and deliver normally", async () => {
  await withRolledBackTest(async (client) => {
    const seeded = await seed(client, "support");

    const principal = await resolveNotificationPrincipal(client, {
      accountId: null,
      studentId: seeded.studentId,
      email: null,
      locale: "fa",
    });
    await migrateLegacyNotificationsForPrincipal(client, principal);

    const support = await migratedRow(client, seeded.principalId, seeded.supportId);
    assert.ok(support, "the support row must migrate");
    assert.equal(support.notification_class, "product_support");
    assert.equal(support.policy_decision, "allow");
    assert.equal(support.policy_reason, "legacy_migrated");
    assert.ok(support.delivered_at, "a consent-free notification must still be delivered");
  });
});

test("a granted marketing consent lets the campaign through", async () => {
  await withRolledBackTest(async (client) => {
    const seeded = await seed(client, "granted");

    await client.query(
      `INSERT INTO notification_consents
         (principal_id, purpose, status, policy_version, source, idempotency_key, event_sequence)
       VALUES ($1, 'marketing', 'granted', 'v1', 'test', $2, 1)`,
      [seeded.principalId, `${seeded.principalId}:grant`],
    );

    const principal = await resolveNotificationPrincipal(client, {
      accountId: null,
      studentId: seeded.studentId,
      email: null,
      locale: "fa",
    });
    await migrateLegacyNotificationsForPrincipal(client, principal);

    const campaign = await migratedRow(client, seeded.principalId, seeded.campaignId);
    assert.ok(campaign);
    assert.equal(campaign.notification_class, "marketing_campaign");
    assert.equal(campaign.policy_decision, "allow");
    assert.ok(campaign.delivered_at, "a consented campaign must deliver");
  });
});

test("the latest consent event wins, so a revocation re-closes the gate", async () => {
  await withRolledBackTest(async (client) => {
    const seeded = await seed(client, "revoked");

    // Granted first, then revoked: ordering by event_sequence is what makes
    // the revocation authoritative rather than the earlier grant.
    await client.query(
      `INSERT INTO notification_consents
         (principal_id, purpose, status, policy_version, source, idempotency_key, event_sequence)
       VALUES ($1, 'marketing', 'granted', 'v1', 'test', $2, 1),
              ($1, 'marketing', 'revoked', 'v1', 'test', $3, 2)`,
      [seeded.principalId, `${seeded.principalId}:grant`, `${seeded.principalId}:withdraw`],
    );

    const principal = await resolveNotificationPrincipal(client, {
      accountId: null,
      studentId: seeded.studentId,
      email: null,
      locale: "fa",
    });
    await migrateLegacyNotificationsForPrincipal(client, principal);

    const campaign = await migratedRow(client, seeded.principalId, seeded.campaignId);
    assert.ok(campaign);
    assert.equal(campaign.delivered_at, null, "a revoked consent must withhold the campaign");
    assert.equal(campaign.policy_reason, "marketing_consent_required");
  });
});

test("consent is evaluated inside each insert, not captured once per batch", () => {
  // A batch drains up to LEGACY_NOTIFICATION_MIGRATION_BATCH_SIZE rows. Under
  // READ COMMITTED a revocation committed part-way through that loop is visible
  // to every later statement — but not to a boolean captured before the loop
  // began, which would keep stamping the campaigns queued behind it as
  // delivered. The decision must therefore live in the statement that performs
  // the insert.
  //
  // This is asserted structurally rather than behaviourally on purpose: proving
  // it at runtime needs a second connection committing a revocation at an exact
  // point inside the loop, which is inherently timing-dependent. A test that
  // cannot fail for its stated reason is worse than no test.
  const repo = readFileSync("src/lib/notifications/repository.ts", "utf8");

  // The insert's decision reads the consent CTE directly.
  assert.match(
    repo,
    /decision AS \(\s*SELECT \(\$15::boolean AND NOT consent\.granted\) AS withheld FROM consent\s*\)/,
    "the withheld decision must read consent.granted from within the insert statement",
  );
  assert.match(repo, /WITH consent AS \(\$\{MARKETING_CONSENT_SQL\}\)/);

  // And no consent boolean is resolved before the loop.
  const drainStart = repo.indexOf("async function drainNotificationCenterForPrincipal");
  const loopStart = repo.indexOf("for (const item of legacy.rows)", drainStart);
  const preamble = repo.slice(drainStart, loopStart);
  assert.doesNotMatch(
    preamble,
    /purpose = 'marketing'/,
    "consent must not be resolved once for the whole batch — a revocation would not reach the rows behind it",
  );
});
