import assert from "node:assert/strict";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../lib/db-migration-plan";
import { storeLearningCommand } from "../lib/academy-authority";
import {
  claimNotificationDomainOutbox,
  enqueueNotificationDomainEvent,
  failNotificationDomainEvent,
  processClaimedNotificationDomainEvent,
  recoverExpiredNotificationDomainLeases,
} from "../lib/notifications/domain-outbox";
import { loadEffectiveNotificationDomainClaim } from "../lib/notifications/domain-worker";
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

async function createStudent(client: PoolClient, prefix: string) {
  const studentId = crypto.randomUUID();
  const email = `${prefix}-${studentId}@notification.test`;
  await client.query(
    `INSERT INTO academy_students (id, locale, email, display_name)
     VALUES ($1, 'fa', $2, $3)`,
    [studentId, email, prefix],
  );
  return { studentId, email };
}

async function count(
  client: PoolClient,
  sql: string,
  values: unknown[],
): Promise<number> {
  const result = await client.query<{ count: string }>(sql, values);
  return Number.parseInt(result.rows[0]?.count ?? "0", 10);
}

test(
  "new authoritative term command atomically enqueues one durable domain event",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const { studentId } = await createStudent(client, "domain-assessment");
      const requestHash = "a".repeat(64);
      const command = {
        studentId,
        commandType: "term_assessment:fa:1",
        requestHash,
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
      assert.equal(
        await count(
          client,
          `SELECT COUNT(*)::text AS count
             FROM academy_learning_commands
            WHERE student_id = $1::uuid AND request_hash = $2`,
          [studentId, requestHash],
        ),
        1,
      );
      assert.equal(
        await count(
          client,
          `SELECT COUNT(*)::text AS count
             FROM notification_domain_outbox
            WHERE event_type = 'academy.assessment_completed'
              AND payload->>'assessmentId' = 'term-1'`,
          [],
        ),
        1,
      );

      await storeLearningCommand(client, command);
      assert.equal(
        await count(
          client,
          `SELECT COUNT(*)::text AS count
             FROM notification_domain_outbox
            WHERE event_type = 'academy.assessment_completed'
              AND payload->>'assessmentId' = 'term-1'`,
          [],
        ),
        1,
      );

      await client.query("SAVEPOINT notification_domain_rollback");
      await storeLearningCommand(client, {
        ...command,
        requestHash: "b".repeat(64),
        idempotencyKey: "assessment-domain-outbox-rollback",
        result: { ...command.result, percent: 60, passed: false },
      });
      await client.query("ROLLBACK TO SAVEPOINT notification_domain_rollback");
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
            WHERE event_type = 'academy.assessment_completed'`,
          [],
        ),
        1,
      );
    });
  },
);

test(
  "domain worker processes an Academy event and records immutable intent linkage",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const { studentId } = await createStudent(client, "domain-worker");
      await storeLearningCommand(client, {
        studentId,
        commandType: "term_assessment:fa:2",
        requestHash: "c".repeat(64),
        idempotencyKey: "assessment-domain-worker-2",
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
        workerId: "domain-worker-test",
        limit: 10,
        leaseSeconds: 120,
      });
      assert.equal(claims.length, 1);
      const effective = await loadEffectiveNotificationDomainClaim(
        client,
        claims[0],
      );
      const processed = await processClaimedNotificationDomainEvent(
        client,
        effective,
        "domain-worker-test",
      );
      assert.ok(processed.intentId);
      assert.equal(processed.status, "created");

      const event = await client.query<{
        status: string;
        notification_intent_id: string | null;
      }>(
        `SELECT status, notification_intent_id
           FROM notification_domain_outbox
          WHERE id = $1`,
        [claims[0].outboxId],
      );
      assert.equal(event.rows[0]?.status, "processed");
      assert.equal(event.rows[0]?.notification_intent_id, processed.intentId);

      const attempt = await client.query<{
        status: string;
        metadata: Record<string, unknown>;
      }>(
        `SELECT status, metadata
           FROM notification_domain_outbox_attempts
          WHERE domain_outbox_id = $1 AND attempt_number = 1`,
        [claims[0].outboxId],
      );
      assert.equal(attempt.rows[0]?.status, "processed");
      assert.equal(attempt.rows[0]?.metadata.intentId, processed.intentId);
    });
  },
);

test(
  "delayed domain event renders in current principal locale without changing occurrence evidence",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const { studentId, email } = await createStudent(client, "domain-locale");
      const principal = await resolveNotificationPrincipal(client, {
        accountId: `academy:${email}`,
        studentId,
        email,
        locale: "fa",
      });
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
        limit: 10,
        leaseSeconds: 120,
      });
      assert.equal(claims.length, 1);
      assert.equal(claims[0].event.locale, "fa");

      await client.query(
        `UPDATE platform_principals
            SET locale = 'en', updated_at = NOW()
          WHERE id = $1`,
        [principal.id],
      );
      const effective = await loadEffectiveNotificationDomainClaim(
        client,
        claims[0],
      );
      assert.equal(effective.event.locale, "en");
      assert.equal(effective.event.occurredAt, occurredAt);

      const processed = await processClaimedNotificationDomainEvent(
        client,
        effective,
        "domain-locale-worker",
      );
      const intent = await client.query<{
        locale: string;
        action_url: string | null;
      }>(
        `SELECT locale, action_url FROM notification_intents WHERE id = $1`,
        [processed.intentId],
      );
      assert.equal(intent.rows[0]?.locale, "en");
      assert.equal(intent.rows[0]?.action_url, "/en/academy/profile");

      const stored = await client.query<{ locale: string; occurred_at: Date }>(
        `SELECT locale, occurred_at
           FROM notification_domain_outbox
          WHERE id = $1`,
        [claims[0].outboxId],
      );
      assert.equal(stored.rows[0]?.locale, "fa");
      assert.equal(stored.rows[0]?.occurred_at.toISOString(), occurredAt);
    });
  },
);

test(
  "event identity conflicts fail closed without overwriting durable evidence",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const { studentId, email } = await createStudent(client, "domain-conflict");
      const principal = await resolveNotificationPrincipal(client, {
        accountId: `academy:${email}`,
        studentId,
        email,
        locale: "fa",
      });
      const id = `support-event:${crypto.randomUUID()}`;
      const base = {
        id,
        tenantId: principal.tenantId,
        principalId: principal.id,
        occurredAt: new Date().toISOString(),
        locale: "fa" as const,
        version: 1 as const,
        type: "support.ticket_status_changed" as const,
      };
      await enqueueNotificationDomainEvent(client, {
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
    });
  },
);

test(
  "expired lease is recoverable and terminal failure creates one dead letter",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const { studentId, email } = await createStudent(client, "domain-recovery");
      const principal = await resolveNotificationPrincipal(client, {
        accountId: `academy:${email}`,
        studentId,
        email,
        locale: "fa",
      });
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
      assert.equal(first.length, 1);
      await client.query(
        `UPDATE notification_domain_outbox
            SET lease_expires_at = NOW() - INTERVAL '1 second'
          WHERE id = $1`,
        [first[0].outboxId],
      );
      const recovered = await recoverExpiredNotificationDomainLeases(client, 10);
      assert.equal(recovered.recovered, 1);
      assert.equal(recovered.terminal, 0);

      const second = await claimNotificationDomainOutbox(client, {
        workerId: "domain-recovery-worker-2",
        limit: 1,
        leaseSeconds: 60,
      });
      assert.equal(second.length, 1);
      const failed = await failNotificationDomainEvent(
        client,
        second[0],
        "domain-recovery-worker-2",
        {
          errorCode: "domain_event_permanently_invalid",
          errorDetail: "terminal test",
          retryable: false,
        },
      );
      assert.equal(failed.terminal, true);
      assert.equal(
        await count(
          client,
          `SELECT COUNT(*)::text AS count
             FROM notification_domain_dead_letters
            WHERE domain_outbox_id = $1`,
          [second[0].outboxId],
        ),
        1,
      );
    });
  },
);
