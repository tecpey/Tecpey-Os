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
import {
  admitAiAgentUsage,
  aiEvidenceHash,
  createAiKnowledgeCandidate,
  loadVerifiedAiKnowledgeContext,
} from "../../lib/ai/control-plane-store";
import { AI_MENTOR_TRUST_POLICY_VERSION } from "../../lib/ai/mentor-trust-boundary";
import { ensureMentorThread, listMentorThreads } from "../../lib/mentor-threads";
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

/** Stand up a tenant and admit a student into it, the way a real onboarding would. */
async function admitStudent(
  client: PoolClient,
  tenantId: string,
  studentId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', '{}'::text[])
     ON CONFLICT (id) DO NOTHING`,
    [tenantId],
  );
  const workspaceId = `${tenantId}-main`;
  await client.query(
    `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
       VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [workspaceId, tenantId],
  );
  await client.query(
    `INSERT INTO platform_principal_bindings
       (tenant_id, workspace_id, principal_type, principal_id, status, source)
     VALUES ($1, $2, 'student', $3, 'active', 'mentor_evidence_test')
     ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id) DO NOTHING`,
    [tenantId, workspaceId, studentId],
  );
}

async function createTenantWorkspace(
  client: PoolClient,
  label: string,
): Promise<{ tenantId: string; workspaceId: string }> {
  const tenantId = `${label}-${randomUUID()}`;
  const workspaceId = `${tenantId}-main`;
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
     VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`,
    [tenantId],
  );
  await client.query(
    `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
     VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
    [workspaceId, tenantId],
  );
  return { tenantId, workspaceId };
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
  it("rejects per-call input and output token caps before provider admission", async () => {
    const limits = {
      dailyRequests: 10,
      dailyTokens: 10_000,
      maxInputTokens: 256,
      maxOutputTokens: 64,
      maxRequestCostUsdMicros: 100_000,
      monthlyBudgetUsdMicros: 1_000_000,
    };
    assert.deepEqual(
      await admitAiAgentUsage({
        tenantId: "unused-tenant",
        workspaceId: "unused-workspace",
        agentId: "mentor_coach",
        estimatedInputTokens: 257,
        maxOutputTokens: 64,
        limits,
      }),
      { ok: false, reason: "input_limit" },
    );
    assert.deepEqual(
      await admitAiAgentUsage({
        tenantId: "unused-tenant",
        workspaceId: "unused-workspace",
        agentId: "mentor_coach",
        estimatedInputTokens: 100,
        maxOutputTokens: 65,
        limits,
      }),
      { ok: false, reason: "output_limit" },
    );
  });

  it("rejects evidence-free research knowledge before touching storage", async () => {
    const candidate = await createAiKnowledgeCandidate({
      tenantId: "unused-tenant",
      workspaceId: "unused-workspace",
      knowledgeType: "research_claim",
      subjectType: "coin",
      subjectId: "bitcoin",
      statement: "A material public research claim needs source evidence.",
      evidenceRefs: [],
      confidence: 80,
      dataClass: "public",
      derivedByAgent: "coin_tool_researcher",
    });
    assert.equal(candidate, null);
  });

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
            thread_id: string;
          }>(
            `SELECT role, content_class, retention_class, thread_id::text AS thread_id
               FROM mentor_conversations
              WHERE student_id = $1::uuid AND request_id = $2::uuid
              ORDER BY created_at ASC, role DESC`,
            [studentId, requestId],
          );
          assert.equal(rows.rows.length, 2);
          assert.deepEqual(new Set(rows.rows.map((row) => row.role)), new Set(["user", "assistant"]));
          assert.equal(rows.rows.every((row) => row.retention_class === "mentor_history_90d"), true);
          assert.equal(new Set(rows.rows.map((row) => row.thread_id)).size, 1);
          assert.match(rows.rows[0]?.thread_id ?? "", /^[0-9a-f-]{36}$/i);
          assert.equal(rows.rows.find((row) => row.role === "user")?.content_class, "financial_sensitive");
        });
      } finally {
        await withClient((client) => cleanupStudent(client, studentId));
      }
    },
  );

  it(
    "rejects a thread owned by another student at both lookup and persistence boundaries",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const [ownerId, otherId] = await withClient(async (client) => [
        await createStudent(client, "mentor-thread-owner"),
        await createStudent(client, "mentor-thread-other"),
      ] as const);
      try {
        const owned = await ensureMentorThread({
          studentId: ownerId,
          locale: "fa",
          titleHint: "تحقیق بیت‌کوین",
        });
        assert.ok(owned);

        assert.equal(
          await ensureMentorThread({
            studentId: otherId,
            threadId: owned.thread.id,
            locale: "fa",
          }),
          null,
        );
        assert.equal(
          await persistMentorConversationPair({
            requestId: randomUUID(),
            studentId: otherId,
            threadId: owned.thread.id,
            question: "نباید ثبت شود",
            answer: "نباید ثبت شود",
            locale: "fa",
          }),
          false,
        );

        const otherThreads = await listMentorThreads({ studentId: otherId });
        assert.notEqual(otherThreads, "unavailable");
        if (otherThreads !== "unavailable") {
          assert.equal(otherThreads.some((thread) => thread.id === owned.thread.id), false);
        }
        await withClient(async (client) => {
          const leaked = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM mentor_conversations
              WHERE student_id = $1::uuid AND thread_id = $2::uuid`,
            [otherId, owned.thread.id],
          );
          assert.equal(Number(leaked.rows[0]?.count ?? "0"), 0);
        });
      } finally {
        await withClient(async (client) => {
          await cleanupStudent(client, ownerId);
          await cleanupStudent(client, otherId);
        });
      }
    },
  );

  it(
    "atomically caps concurrent AI usage per tenant and leaves other tenants independent",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const [scopeA, scopeB] = await withClient(async (client) => [
        await createTenantWorkspace(client, "ai-quota-a"),
        await createTenantWorkspace(client, "ai-quota-b"),
      ] as const);
      const limits = {
        dailyRequests: 2,
        dailyTokens: 148,
        maxInputTokens: 1_000,
        maxOutputTokens: 64,
        maxRequestCostUsdMicros: 100_000,
        monthlyBudgetUsdMicros: 1_000_000,
      };
      const admit = (scope: typeof scopeA) => admitAiAgentUsage({
        ...scope,
        agentId: "mentor_coach",
        estimatedInputTokens: 10,
        maxOutputTokens: 64,
        limits,
      });
      try {
        const attempts = await Promise.all([admit(scopeA), admit(scopeA), admit(scopeA), admit(scopeA)]);
        assert.equal(attempts.filter((result) => result.ok).length, 2);
        assert.equal(attempts.filter((result) => !result.ok && result.reason === "request_limit").length, 2);

        const tenantB = await admit(scopeB);
        assert.deepEqual(tenantB, { ok: true, requestCount: 1, reservedTokens: 74 });

        await withClient(async (client) => {
          const rows = await client.query<{
            tenant_id: string;
            request_count: number;
            reserved_tokens: string | number;
          }>(
            `SELECT tenant_id, request_count, reserved_tokens
               FROM ai_agent_usage_daily
              WHERE tenant_id = ANY($1::text[])
                AND workspace_id = ANY($2::text[])
                AND agent_id = 'mentor_coach'
                AND usage_date = CURRENT_DATE
              ORDER BY tenant_id`,
            [[scopeA.tenantId, scopeB.tenantId], [scopeA.workspaceId, scopeB.workspaceId]],
          );
          assert.deepEqual(rows.rows.map((row) => ({
            tenantId: row.tenant_id,
            requestCount: Number(row.request_count),
            reservedTokens: Number(row.reserved_tokens),
          })), [
            { tenantId: scopeA.tenantId, requestCount: 2, reservedTokens: 148 },
            { tenantId: scopeB.tenantId, requestCount: 1, reservedTokens: 74 },
          ].sort((left, right) => left.tenantId.localeCompare(right.tenantId)));
        });
      } finally {
        await withClient(async (client) => {
          await client.query("DELETE FROM platform_tenants WHERE id = ANY($1::text[])", [
            [scopeA.tenantId, scopeB.tenantId],
          ]);
        });
      }
    },
  );

  it(
    "retrieves only current human-verified knowledge from the acting tenant and workspace",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const [scopeA, scopeB] = await withClient(async (client) => [
        await createTenantWorkspace(client, "ai-knowledge-a"),
        await createTenantWorkspace(client, "ai-knowledge-b"),
      ] as const);
      const verifiedStatement = "Bitcoin risk rises when leverage grows without an invalidation point.";
      const verifiedHash = aiEvidenceHash(
        "knowledge",
        ["research_claim", "coin", "bitcoin", verifiedStatement].join("\0"),
      );
      try {
        await withClient(async (client) => {
          const reviewers = await Promise.all(
            [scopeA, scopeB].map(async (scope, index) => {
              const row = await client.query<{ id: string }>(
                `INSERT INTO admin_users
                   (email, display_name, status, tenant_id, workspace_id)
                 VALUES ($1, $2, 'active', $3, $4)
                 RETURNING id::text AS id`,
                [
                  `ai-knowledge-reviewer-${index}-${randomUUID()}@mentor.test`,
                  `AI knowledge reviewer ${index}`,
                  scope.tenantId,
                  scope.workspaceId,
                ],
              );
              return row.rows[0]!.id;
            }),
          );

          await client.query(
            `INSERT INTO ai_knowledge_items
               (tenant_id, workspace_id, knowledge_type, subject_type, subject_id,
                statement, content_hash, evidence_refs, confidence, data_class,
                status, reviewed_by, reviewed_at, valid_from, valid_until)
             VALUES
               ($1, $2, 'research_claim', 'coin', 'bitcoin',
                $12,
                $5, '[]'::jsonb, 91, 'public', 'verified', $3::uuid, NOW(),
                NOW() - INTERVAL '1 day', NULL),
               ($1, $2, 'research_claim', 'coin', 'bitcoin',
                'Candidate bitcoin claim must never reach Mentor.',
                $6, '[]'::jsonb, 99, 'public', 'candidate', NULL, NULL,
                NOW() - INTERVAL '1 day', NULL),
               ($1, $2, 'research_claim', 'coin', 'bitcoin',
                'Expired bitcoin claim must never reach Mentor.',
                $7, '[]'::jsonb, 99, 'public', 'verified', $3::uuid, NOW(),
                NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),
               ($1, $2, 'operating_rule', 'mentor_policy', NULL,
                'Always distinguish educational context from personalized financial advice.',
                $8, '[]'::jsonb, 100, 'approved_platform_content', 'verified',
                $3::uuid, NOW(), NOW() - INTERVAL '1 day', NULL),
               ($9, $10, 'research_claim', 'coin', 'bitcoin',
                'Other tenant bitcoin claim must never cross the boundary.',
                $11, '[]'::jsonb, 99, 'public', 'verified', $4::uuid, NOW(),
                NOW() - INTERVAL '1 day', NULL)`,
            [
              scopeA.tenantId,
              scopeA.workspaceId,
              reviewers[0],
              reviewers[1],
              verifiedHash,
              "b".repeat(64),
              "c".repeat(64),
              "d".repeat(64),
              scopeB.tenantId,
              scopeB.workspaceId,
              "e".repeat(64),
              verifiedStatement,
            ],
          );
        });

        const knowledge = await loadVerifiedAiKnowledgeContext({
          ...scopeA,
          query: "bitcoin risk",
          limit: 8,
        });
        assert.notEqual(knowledge, "unavailable");
        if (knowledge === "unavailable") return;

        assert.deepEqual(
          new Set(knowledge.map((item) => item.contentHash)),
          new Set([verifiedHash, "d".repeat(64)]),
        );
        assert.equal(knowledge.every((item) => !item.statement.includes("must never")), true);

        const overwrite = await createAiKnowledgeCandidate({
          ...scopeA,
          knowledgeType: "research_claim",
          subjectType: "coin",
          subjectId: "bitcoin",
          statement: verifiedStatement,
          evidenceRefs: [{ url: "https://attacker.invalid/replacement", title: "Replacement" }],
          confidence: 99,
          dataClass: "public",
          derivedByAgent: "coin_tool_researcher",
        });
        assert.equal(overwrite, null);
        await withClient(async (client) => {
          const preserved = await client.query<{
            status: string;
            confidence: number;
            evidence_refs: unknown[];
          }>(
            `SELECT status, confidence, evidence_refs
               FROM ai_knowledge_items
              WHERE tenant_id = $1 AND workspace_id = $2 AND content_hash = $3`,
            [scopeA.tenantId, scopeA.workspaceId, verifiedHash],
          );
          assert.equal(preserved.rows[0]?.status, "verified");
          assert.equal(preserved.rows[0]?.confidence, 91);
          assert.deepEqual(preserved.rows[0]?.evidence_refs, []);
        });
      } finally {
        await withClient(async (client) => {
          await client.query(
            "DELETE FROM ai_knowledge_items WHERE tenant_id = ANY($1::text[])",
            [[scopeA.tenantId, scopeB.tenantId]],
          );
          await client.query(
            "DELETE FROM admin_users WHERE tenant_id = ANY($1::text[])",
            [[scopeA.tenantId, scopeB.tenantId]],
          );
          await client.query("DELETE FROM platform_tenants WHERE id = ANY($1::text[])", [
            [scopeA.tenantId, scopeB.tenantId],
          ]);
        });
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

  it(
    "keeps request evidence tenant-keyed for the same request id and phase",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const studentId = await withClient((client) => createStudent(client, "mentor-evidence-tenant"));
      const requestId = randomUUID();
      const tenantA = `mentor-evidence-a-${randomUUID()}`;
      const tenantB = `mentor-evidence-b-${randomUUID()}`;
      try {
        await withClient(async (client) => {
          await client.query("BEGIN");
          try {
            // Both tenants have to have admitted this student before either may
            // hold evidence about them (migration 0074). That makes the
            // assertion below stronger rather than weaker: two tenants that each
            // legitimately admitted the same learner still keep separate rows
            // for one request id and phase, instead of one row winning.
            for (const tenantId of [tenantA, tenantB]) {
              await admitStudent(client, tenantId, studentId);
            }
            for (const [tenantId, inputHash] of [
              [tenantA, "b".repeat(64)],
              [tenantB, "c".repeat(64)],
            ] as const) {
              assert.equal(
                await appendAiMentorEvidence(
                  {
                    tenantId,
                    requestId,
                    studentId,
                    phase: "admitted",
                    provider: "openai",
                    model: "test-model",
                    policyVersion: AI_MENTOR_TRUST_POLICY_VERSION,
                    contextClasses: ["public"],
                    redactionCount: 0,
                    injectionSignalCount: 0,
                    inputHash,
                    inputChars: 120,
                    estimatedInputTokens: 40,
                    outcome: "provider_admitted",
                    memoryPersisted: null,
                    metadata: { tenantId },
                  },
                  client,
                ),
                true,
              );
            }

            const rows = await client.query<{
              tenant_id: string;
              input_hash: string;
              metadata: Record<string, unknown>;
            }>(
              `SELECT tenant_id, input_hash, metadata
                 FROM ai_mentor_request_evidence
                WHERE request_id = $1::uuid
                  AND phase = 'admitted'
                ORDER BY tenant_id ASC`,
              [requestId],
            );
            const expectedRows = [
              {
                tenant_id: tenantA,
                input_hash: "b".repeat(64),
                metadata: { tenantId: tenantA },
              },
              {
                tenant_id: tenantB,
                input_hash: "c".repeat(64),
                metadata: { tenantId: tenantB },
              },
            ].sort((left, right) => left.tenant_id.localeCompare(right.tenant_id));
            assert.deepEqual(rows.rows, expectedRows);
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
