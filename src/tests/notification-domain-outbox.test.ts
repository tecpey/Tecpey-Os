import assert from "node:assert/strict";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { storeLearningCommand } from "../lib/academy-authority";
import { applyDatabaseMigrationsWithLock } from "../lib/db-migration-plan";
import {
  claimNotificationDomainOutbox,
  enqueueNotificationDomainEvent,
  failNotificationDomainEvent,
  recoverExpiredNotificationDomainLeases,
  type NotificationDomainOutboxClaim,
} from "../lib/notifications/domain-outbox";
import { processAuthoritativeNotificationDomainClaim } from "../lib/notifications/domain-processing";
import { resolveNotificationPrincipal } from "../lib/notifications/principal";

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

async function createPrincipal(client: PoolClient, prefix: string) {
  const studentId = crypto.randomUUID();
  const email = `${prefix}-${studentId}@notification.test`;
  await client.query(
    `INSERT INTO academy_students (id, locale, email, display_name)
     VALUES ($1, 'fa', $2, $3)`,
    [studentId, email, prefix],
  );
  const principal = await resolveNotificationPrincipal(client, {
    accountId: `academy:${email}`,
    studentId,
    email,
    locale: "fa",
  });
  return { studentId, principal };
}

async function count(
  client: PoolClient,
  sql: string,
  values: unknown[] = [],
): Promise<number> {
  const result = await client.query<{ count: string }>(sql, values);
  return Number.parseInt(result.rows[0]?.count ?? "0", 10);
}

test(
  "term command and domain event commit, replay and roll back atomically",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const { studentId } = await createPrincipal(client, "domain-assessment");
      const command = {
        studentId,
        commandType: "term_assessment:fa:1",
        requestHash: "a".repeat(64),
        idempotencyKey: "assessment-domain-outbox-1",
        result: {
          score: 4,
          percent: 86,
          passed: true,
          termNumber: 1,
          state: {},
          revision: 1,
        },
      };

      await storeLearningCommand(client, command);
      await storeLearningCommand(client, command);
      assert.equal(
        await count(
          client,
          `SELECT COUNT(*)::text AS count
             FROM academy_learning_commands
            WHERE student_id = $1::uuid AND request_hash = $2`,
          [studentId, command.requestHash],
        ),
        1,
      );
      assert.equal(
        await count(
          client,
          `SELECT COUNT(*)::text AS count
             FROM notification_domain_outbox
            WHERE principal_id = (
              SELECT id FROM platform_principals WHERE student_id = $1::uuid
            )`,
          [studentId],
        ),
        1,
      );

      await client.query("SAVEPOINT domain_event_rollback");
      await storeLearningCommand(client, {
        ...command,
        requestHash: "b".repeat(64),
        idempotencyKey: "assessment-domain-outbox-rollback",
        result: { ...command.result, percent: 60, passed: false },
      });
      await client.query("ROLLBACK TO SAVEPOINT domain_event_rollback");
      assert.equal(
        await count(
          client,
          `SELECT COUNT(*)::text AS count
             FROM academy_learning_commands
            WHERE student_id = $1::uuid`,
          [studentId],
        ),
        1,
      );
      assert.equal(
        await count(
          client,
          `SELECT COUNT(*)::text AS count
             FROM notification_domain_outbox
            WHERE principal_id = (
              SELECT id FROM platform_principals WHERE student_id = $1::uuid
            )`,
          [studentId],
        ),
        1,
      );
    });
  },
);

test(
  "claim is payload-free and processing reloads authoritative PostgreSQL state",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const { studentId } = await createPrincipal(client, "domain-authority");
      await storeLearningCommand(client, {
        studentId,
        commandType: "term_assessment:fa:2",
        requestHash: "c".repeat(64),
        idempotencyKey: "assessment-domain-authority-2",
        result: {
          score: 5,
          percent: 91,
          passed: true,
          termNumber: 2,
          state: {},
          revision: 2,
        },
      });

      const claims = await claimNotificationDomainOutbox(client, {
        workerId: "domain-authority-worker",
        limit: 10,
        leaseSeconds: 120,
      });
      assert.deepEqual(Object.keys(claims[0]).sort(), [
        "attemptNumber",
        "maxAttempts",
        "outboxId",
      ]);

      const tamperedReference = {
        ...claims[0],
        event: { payload: { title: "متن دست‌کاری‌شده", score: 1 } },
      } as unknown as NotificationDomainOutboxClaim;
      const processed = await processAuthoritativeNotificationDomainClaim(
        client,
        tamperedReference,
        "domain-authority-worker",
      );
      const intent = await client.query<{ body: string }>(
        `SELECT body FROM notification_intents WHERE id = $1`,
        [processed.intentId],
      );
      assert.match(intent.rows[0]?.body ?? "", /۹۱/);
      assert.equal((intent.rows[0]?.body ?? "").includes("دست‌کاری"), false);
    });
  },
);

test(
  "delayed event uses current locale while preserving occurrence evidence",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const { principal } = await createPrincipal(client, "domain-locale");
      const occurredAt = new Date(Date.now() - 60_000).toISOString();
      await enqueueNotificationDomainEvent(client, {
        id: `academy-assessment-locale:${crypto.randomUUID()}`,
        tenantId: principal.tenantId,
        principalId: principal.id,
        occurredAt,
        locale: "fa",
        version: 1,
        type: "academy.assessment_completed",
        payload: {
          assessmentId: "term-3",
          title: "ارزیابی ترم ۳",
          score: 88,
          passed: true,
        },
      });
      const claims = await claimNotificationDomainOutbox(client, {
        workerId: "domain-locale-worker",
        limit: 1,
        leaseSeconds: 120,
      });
      await client.query(
        `UPDATE platform_principals SET locale = 'en', updated_at = NOW()
          WHERE id = $1`,
        [principal.id],
      );

      const processed = await processAuthoritativeNotificationDomainClaim(
        client,
        claims[0],
        "domain-locale-worker",
      );
      const intent = await client.query<{
        locale: string;
        action_url: string | null;
        body: string;
      }>(
        `SELECT locale, action_url, body FROM notification_intents WHERE id = $1`,
        [processed.intentId],
      );
      assert.equal(intent.rows[0]?.locale, "en");
      assert.equal(intent.rows[0]?.action_url, "/en/academy/profile");
      assert.match(intent.rows[0]?.body ?? "", /Term 3 assessment/);

      const attempt = await client.query<{ metadata: Record<string, unknown> }>(
        `SELECT metadata FROM notification_domain_outbox_attempts
          WHERE domain_outbox_id = $1 AND attempt_number = 1`,
        [claims[0].outboxId],
      );
      assert.equal(attempt.rows[0]?.metadata.eventLocale, "fa");
      assert.equal(attempt.rows[0]?.metadata.effectiveLocale, "en");
      assert.equal(attempt.rows[0]?.metadata.eventFingerprint?.toString().length, 64);

      const stored = await client.query<{ locale: string; occurred_at: Date }>(
        `SELECT locale, occurred_at FROM notification_domain_outbox WHERE id = $1`,
        [claims[0].outboxId],
      );
      assert.equal(stored.rows[0]?.locale, "fa");
      assert.equal(stored.rows[0]?.occurred_at.toISOString(), occurredAt);
    });
  },
);

test(
  "event identity is immutable and changed replay content fails closed",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const { principal } = await createPrincipal(client, "domain-conflict");
      const eventId = `support-event:${crypto.randomUUID()}`;
      const base = {
        id: eventId,
        tenantId: principal.tenantId,
        principalId: principal.id,
        occurredAt: new Date().toISOString(),
        locale: "fa" as const,
        version: 1 as const,
        type: "support.ticket_status_changed" as const,
      };
      const queued = await enqueueNotificationDomainEvent(client, {
        ...base,
        payload: { ticketId: "ticket-12345678", status: "received" },
      });
      await assert.rejects(
        enqueueNotificationDomainEvent(client, {
          ...base,
          payload: { ticketId: "ticket-12345678", status: "resolved" },
        }),
        /notification_domain_event_identity_conflict/,
      );

      await assert.rejects(
        client.query(
          `UPDATE notification_domain_outbox
              SET payload = '{"ticketId":"ticket-12345678","status":"resolved"}'::jsonb
            WHERE id = $1`,
          [queued.outboxId],
        ),
        /event identity is immutable/,
      );
    });
  },
);

test(
  "valid-shape row with wrong fingerprint is claimable and dead-lettered",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const { principal } = await createPrincipal(client, "domain-fingerprint");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO notification_domain_outbox
          (tenant_id, principal_id, event_type, event_version, event_id,
           occurred_at, locale, payload, payload_hash)
         VALUES ($1, $2, 'support.ticket_status_changed', 1, $3,
                 NOW(), 'fa', $4::jsonb, $5)
         RETURNING id`,
        [
          principal.tenantId,
          principal.id,
          `support-fingerprint:${crypto.randomUUID()}`,
          JSON.stringify({ ticketId: "ticket-87654321", status: "received" }),
          "0".repeat(64),
        ],
      );
      const claims = await claimNotificationDomainOutbox(client, {
        workerId: "domain-fingerprint-worker",
        limit: 1,
        leaseSeconds: 120,
      });
      assert.equal(claims[0].outboxId, inserted.rows[0].id);
      await assert.rejects(
        processAuthoritativeNotificationDomainClaim(
          client,
          claims[0],
          "domain-fingerprint-worker",
        ),
        /notification_domain_event_fingerprint_mismatch/,
      );
      const failed = await failNotificationDomainEvent(
        client,
        claims[0],
        "domain-fingerprint-worker",
        {
          errorCode: "notification_domain_event_fingerprint_mismatch",
          errorDetail: null,
          retryable: false,
        },
      );
      assert.equal(failed.terminal, true);
      assert.equal(
        await count(
          client,
          `SELECT COUNT(*)::text AS count FROM notification_domain_dead_letters
            WHERE domain_outbox_id = $1`,
          [claims[0].outboxId],
        ),
        1,
      );
    });
  },
);

test(
  "expired lease is recovered for a later worker",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const { principal } = await createPrincipal(client, "domain-recovery");
      await enqueueNotificationDomainEvent(client, {
        id: `security-event:${crypto.randomUUID()}`,
        tenantId: principal.tenantId,
        principalId: principal.id,
        occurredAt: new Date().toISOString(),
        locale: "fa",
        version: 1,
        type: "security.new_login",
        payload: {},
      });
      const first = await claimNotificationDomainOutbox(client, {
        workerId: "domain-recovery-worker",
        limit: 1,
        leaseSeconds: 60,
      });
      await client.query(
        `UPDATE notification_domain_outbox
            SET lease_expires_at = NOW() - INTERVAL '1 second'
          WHERE id = $1`,
        [first[0].outboxId],
      );
      assert.deepEqual(await recoverExpiredNotificationDomainLeases(client, 10), {
        recovered: 1,
        terminal: 0,
      });
      const second = await claimNotificationDomainOutbox(client, {
        workerId: "domain-recovery-worker-2",
        limit: 1,
        leaseSeconds: 60,
      });
      assert.equal(second[0].outboxId, first[0].outboxId);
      assert.equal(second[0].attemptNumber, 2);
    });
  },
);
