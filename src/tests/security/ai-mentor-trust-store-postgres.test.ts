import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  appendAiMentorEvidence,
  fingerprintMentorPreferenceStudent,
  loadMentorAiPreferences,
  persistMentorConversationPair,
  setMentorAiPreferences,
  type MentorPreferenceAuditContext,
} from "../../lib/ai/mentor-trust-store";
import { AI_MENTOR_TRUST_POLICY_VERSION } from "../../lib/ai/mentor-trust-boundary";
import {
  hashSensitiveAuditRequest,
  writeSensitiveMutationAuditTx,
} from "../../lib/security/sensitive-mutation-audit";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

async function withClient<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await handler(client);
  } finally {
    client.release();
  }
}

async function createStudent(client: PoolClient, label: string): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO academy_students (id, locale, email, display_name)
     VALUES ($1::uuid, 'fa', $2, $3)`,
    [id, `${label}-${id}@mentor.test`, label],
  );
  return id;
}

async function cleanupStudent(client: PoolClient, studentId: string): Promise<void> {
  await client.query("DELETE FROM mentor_conversations WHERE student_id = $1::uuid", [studentId]);
  await client.query("DELETE FROM mentor_memories WHERE student_id = $1::uuid", [studentId]);
  await client.query("DELETE FROM mentor_profiles WHERE student_id = $1::uuid", [studentId]);
  await client.query("DELETE FROM mentor_ai_preferences WHERE student_id = $1::uuid", [studentId]);
  await client.query("DELETE FROM academy_students WHERE id = $1::uuid", [studentId]);
}

function preferenceAudit(input: {
  studentId: string;
  tenantId: string;
  externalProviderEnabled: boolean;
  behavioralPersonalizationEnabled: boolean;
  correlationId?: string;
}): MentorPreferenceAuditContext {
  const studentFingerprint = fingerprintMentorPreferenceStudent(input.studentId);
  return {
    tenantId: input.tenantId,
    actorType: "student",
    actorId: input.studentId,
    correlationId: input.correlationId ?? `mentor-preferences-${randomUUID()}`,
    requestHash: hashSensitiveAuditRequest({
      tenantId: input.tenantId,
      action: "mentor.preferences.update",
      studentFingerprint,
      externalProviderEnabled: input.externalProviderEnabled,
      behavioralPersonalizationEnabled: input.behavioralPersonalizationEnabled,
      realExchangeSignalsEnabled: false,
    }),
  };
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 6,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("AI Mentor durable trust store", () => {
  it(
    "keeps behavioral personalization default-off and commits changed consent with secret-free evidence",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const [first, second] = await withClient(async (client) => [
        await createStudent(client, "mentor-consent-a"),
        await createStudent(client, "mentor-consent-b"),
      ] as const);
      const tenantId = `mentor-consent-${randomUUID()}`;
      try {
        const initial = await loadMentorAiPreferences(first);
        assert.equal(initial.available, true);
        assert.equal(initial.preferences.behavioralPersonalizationEnabled, false);
        assert.equal(initial.preferences.realExchangeSignalsEnabled, false);

        const changed = await setMentorAiPreferences({
          studentId: first,
          externalProviderEnabled: true,
          behavioralPersonalizationEnabled: true,
          audit: preferenceAudit({
            studentId: first,
            tenantId,
            externalProviderEnabled: true,
            behavioralPersonalizationEnabled: true,
          }),
        });
        assert.equal(changed.ok, true);
        if (changed.ok) {
          assert.equal(changed.changed, true);
          assert.equal(changed.preferences.behavioralPersonalizationEnabled, true);
          assert.equal(changed.preferences.realExchangeSignalsEnabled, false);
        }

        const other = await loadMentorAiPreferences(second);
        assert.equal(other.available, true);
        assert.equal(other.preferences.behavioralPersonalizationEnabled, false);

        await withClient(async (client) => {
          const evidence = await client.query<{
            outcome: string;
            metadata: Record<string, unknown>;
          }>(
            `SELECT outcome, metadata
               FROM sensitive_mutation_audit_events
              WHERE tenant_id = $1
                AND actor_id = $2
                AND action = 'mentor.preferences.update'`,
            [tenantId, first],
          );
          assert.equal(evidence.rows.length, 1);
          assert.equal(evidence.rows[0]?.outcome, "success");
          assert.equal(
            evidence.rows[0]?.metadata.studentFingerprint,
            fingerprintMentorPreferenceStudent(first),
          );
          assert.equal(evidence.rows[0]?.metadata.realExchangeSignalsEnabled, false);
          assert.equal(JSON.stringify(evidence.rows[0]?.metadata).includes(first), false);
        });
      } finally {
        await withClient(async (client) => {
          await cleanupStudent(client, first);
          await cleanupStudent(client, second);
        });
      }
    },
  );

  it(
    "keeps identical preference requests as no-ops without timestamp or evidence churn",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const studentId = await withClient((client) => createStudent(client, "mentor-consent-noop"));
      const tenantId = `mentor-consent-${randomUUID()}`;
      try {
        const first = await setMentorAiPreferences({
          studentId,
          externalProviderEnabled: false,
          behavioralPersonalizationEnabled: true,
          audit: preferenceAudit({
            studentId,
            tenantId,
            externalProviderEnabled: false,
            behavioralPersonalizationEnabled: true,
          }),
        });
        assert.equal(first.ok, true);
        if (!first.ok) throw new Error("mentor_preference_initial_update_failed");
        assert.equal(first.changed, true);

        const before = await withClient(async (client) => {
          const preference = await client.query<{ consented_at: Date }>(
            `SELECT consented_at FROM mentor_ai_preferences WHERE student_id = $1::uuid`,
            [studentId],
          );
          const evidence = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM sensitive_mutation_audit_events
              WHERE tenant_id = $1 AND actor_id = $2
                AND action = 'mentor.preferences.update'`,
            [tenantId, studentId],
          );
          return {
            consentedAt: preference.rows[0]?.consented_at,
            evidenceCount: Number(evidence.rows[0]?.count ?? "0"),
          };
        });
        await new Promise((resolve) => setTimeout(resolve, 10));

        const replay = await setMentorAiPreferences({
          studentId,
          externalProviderEnabled: false,
          behavioralPersonalizationEnabled: true,
          audit: preferenceAudit({
            studentId,
            tenantId,
            externalProviderEnabled: false,
            behavioralPersonalizationEnabled: true,
          }),
        });
        assert.equal(replay.ok, true);
        if (!replay.ok) throw new Error("mentor_preference_noop_failed");
        assert.equal(replay.changed, false);

        const after = await withClient(async (client) => {
          const preference = await client.query<{ consented_at: Date }>(
            `SELECT consented_at FROM mentor_ai_preferences WHERE student_id = $1::uuid`,
            [studentId],
          );
          const evidence = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM sensitive_mutation_audit_events
              WHERE tenant_id = $1 AND actor_id = $2
                AND action = 'mentor.preferences.update'`,
            [tenantId, studentId],
          );
          return {
            consentedAt: preference.rows[0]?.consented_at,
            evidenceCount: Number(evidence.rows[0]?.count ?? "0"),
          };
        });
        assert.deepEqual(after.consentedAt, before.consentedAt);
        assert.equal(after.evidenceCount, before.evidenceCount);
        assert.equal(after.evidenceCount, 1);
      } finally {
        await withClient((client) => cleanupStudent(client, studentId));
      }
    },
  );

  it(
    "rolls back preference state when mandatory evidence conflicts",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const studentId = await withClient((client) => createStudent(client, "mentor-consent-conflict"));
      const tenantId = `mentor-consent-${randomUUID()}`;
      const correlationId = `mentor-preference-conflict-${randomUUID()}`;
      try {
        await withClient(async (client) => {
          await writeSensitiveMutationAuditTx(client, {
            tenantId,
            actorType: "student",
            actorId: studentId,
            action: "mentor.preferences.update",
            resourceType: "mentor_ai_preferences",
            resourceId: studentId,
            outcome: "success",
            correlationId,
            requestHash: "f".repeat(64),
            metadata: { policyVersion: "forced-conflict" },
          });
        });

        const changed = await setMentorAiPreferences({
          studentId,
          externalProviderEnabled: false,
          behavioralPersonalizationEnabled: true,
          audit: preferenceAudit({
            studentId,
            tenantId,
            externalProviderEnabled: false,
            behavioralPersonalizationEnabled: true,
            correlationId,
          }),
        });
        assert.deepEqual(changed, { ok: false });

        await withClient(async (client) => {
          const count = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM mentor_ai_preferences WHERE student_id = $1::uuid`,
            [studentId],
          );
          assert.equal(Number(count.rows[0]?.count ?? "0"), 0);
        });
      } finally {
        await withClient((client) => cleanupStudent(client, studentId));
      }
    },
  );

  it(
    "serializes concurrent identical preference updates into one mutation",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const studentId = await withClient((client) => createStudent(client, "mentor-consent-race"));
      const tenantId = `mentor-consent-${randomUUID()}`;
      try {
        const [first, second] = await Promise.all([
          setMentorAiPreferences({
            studentId,
            externalProviderEnabled: true,
            behavioralPersonalizationEnabled: true,
            audit: preferenceAudit({
              studentId,
              tenantId,
              externalProviderEnabled: true,
              behavioralPersonalizationEnabled: true,
            }),
          }),
          setMentorAiPreferences({
            studentId,
            externalProviderEnabled: true,
            behavioralPersonalizationEnabled: true,
            audit: preferenceAudit({
              studentId,
              tenantId,
              externalProviderEnabled: true,
              behavioralPersonalizationEnabled: true,
            }),
          }),
        ]);
        assert.equal(first.ok, true);
        assert.equal(second.ok, true);
        assert.equal(
          [first, second].filter((result) => result.ok && result.changed).length,
          1,
        );

        await withClient(async (client) => {
          const evidence = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM sensitive_mutation_audit_events
              WHERE tenant_id = $1 AND actor_id = $2
                AND action = 'mentor.preferences.update'`,
            [tenantId, studentId],
          );
          assert.equal(Number(evidence.rows[0]?.count ?? "0"), 1);
        });
      } finally {
        await withClient((client) => cleanupStudent(client, studentId));
      }
    },
  );

  it(
    "persists user and assistant turns atomically under one request ID",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const studentId = await withClient((client) => createStudent(client, "mentor-pair"));
      const requestId = randomUUID();
      try {
        assert.equal(
          await persistMentorConversationPair({
            requestId,
            studentId,
            question: "چطور ریسک را محدود کنم؟",
            answer: "قبل از ورود، حداکثر زیان و نقطه ابطال را مشخص کن.",
            locale: "fa",
            termNumber: 6,
            contentClass: "financial_sensitive",
          }),
          true,
        );
        await withClient(async (client) => {
          const rows = await client.query<{
            role: string;
            content_class: string;
            retention_class: string;
          }>(
            `SELECT role, content_class, retention_class
               FROM mentor_conversations
              WHERE student_id = $1::uuid AND request_id = $2::uuid
              ORDER BY created_at ASC, role DESC`,
            [studentId, requestId],
          );
          assert.equal(rows.rows.length, 2);
          assert.deepEqual(new Set(rows.rows.map((row) => row.role)), new Set(["user", "assistant"]));
          assert.equal(rows.rows.every((row) => row.retention_class === "mentor_history_90d"), true);
          assert.equal(rows.rows.find((row) => row.role === "user")?.content_class, "financial_sensitive");
        });
      } finally {
        await withClient((client) => cleanupStudent(client, studentId));
      }
    },
  );

  it(
    "rolls back the user turn when assistant persistence fails",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const studentId = await withClient((client) => createStudent(client, "mentor-rollback"));
      const requestId = randomUUID();
      const suffix = randomUUID().replaceAll("-", "");
      const functionName = `mentor_pair_fail_${suffix}`;
      const triggerName = `mentor_pair_fail_trigger_${suffix}`;
      try {
        await withClient(async (client) => {
          await client.query(
            `CREATE FUNCTION ${functionName}() RETURNS trigger
             LANGUAGE plpgsql AS $$
             BEGIN
               IF NEW.student_id = '${studentId}'::uuid AND NEW.role = 'assistant' THEN
                 RAISE EXCEPTION 'forced assistant persistence failure';
               END IF;
               RETURN NEW;
             END $$`,
          );
          await client.query(
            `CREATE TRIGGER ${triggerName}
               BEFORE INSERT ON mentor_conversations
               FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
          );
        });
        assert.equal(
          await persistMentorConversationPair({
            requestId,
            studentId,
            question: "user turn",
            answer: "assistant turn",
            locale: "fa",
          }),
          false,
        );
        await withClient(async (client) => {
          const count = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM mentor_conversations
              WHERE student_id = $1::uuid AND request_id = $2::uuid`,
            [studentId, requestId],
          );
          assert.equal(Number(count.rows[0]?.count ?? "0"), 0);
        });
      } finally {
        await withClient(async (client) => {
          await client.query(`DROP TRIGGER IF EXISTS ${triggerName} ON mentor_conversations`);
          await client.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
          await cleanupStudent(client, studentId);
        });
      }
    },
  );

  it(
    "stores secret-free append-only egress evidence",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const studentId = await withClient((client) => createStudent(client, "mentor-evidence"));
      const requestId = randomUUID();
      try {
        await withClient(async (client) => {
          await client.query("BEGIN");
          try {
            assert.equal(
              await appendAiMentorEvidence(
                {
                  requestId,
                  studentId,
                  phase: "admitted",
                  provider: "openai",
                  model: "test-model",
                  policyVersion: AI_MENTOR_TRUST_POLICY_VERSION,
                  contextClasses: ["public", "personal"],
                  redactionCount: 2,
                  injectionSignalCount: 1,
                  inputHash: "a".repeat(64),
                  inputChars: 300,
                  estimatedInputTokens: 100,
                  outcome: "provider_admitted",
                  memoryPersisted: null,
                  metadata: {
                    client_history_ignored: true,
                    personalization_applied: false,
                  },
                },
                client,
              ),
              true,
            );
            const evidence = await client.query<{
              student_id: string;
              metadata: Record<string, unknown>;
            }>(
              `SELECT student_id::text AS student_id, metadata
                 FROM ai_mentor_request_evidence
                WHERE request_id = $1::uuid AND phase = 'admitted'`,
              [requestId],
            );
            assert.equal(evidence.rows[0]?.student_id, studentId);
            assert.deepEqual(evidence.rows[0]?.metadata, {
              client_history_ignored: true,
              personalization_applied: false,
            });
            await assert.rejects(
              client.query(
                `UPDATE ai_mentor_request_evidence
                    SET outcome = 'provider_failure'
                  WHERE request_id = $1::uuid`,
                [requestId],
              ),
              /append-only/,
            );
          } finally {
            await client.query("ROLLBACK");
          }
        });
      } finally {
        await withClient((client) => cleanupStudent(client, studentId));
      }
    },
  );
});
