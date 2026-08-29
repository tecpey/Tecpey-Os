import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { AI_CONTROL_PLANE_SQL } from "../../lib/db-migrate-ai-control-plane";
import { AI_ROUTING_BUDGET_SQL } from "../../lib/db-migrate-ai-routing-budget";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

type PgError = Error & { code?: string };

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function withClient<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await handler(client);
  } finally {
    client.release();
  }
}

async function rejectsWithPgCode(
  action: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  await assert.rejects(action, (error: PgError) => {
    assert.equal(error.code, expectedCode);
    return true;
  });
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 5_000,
    query_timeout: 30_000,
    statement_timeout: 30_000,
    allowExitOnIdle: true,
  });
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("AI tenant database integrity", () => {
  it("declares scope-complete composite keys and no pseudo-RLS", () => {
    assert.match(
      AI_CONTROL_PLANE_SQL,
      /UNIQUE \(tenant_id, workspace_id, id\)[\s\S]*FOREIGN KEY \(tenant_id, workspace_id, knowledge_item_id\)[\s\S]*REFERENCES ai_knowledge_items\(tenant_id, workspace_id, id\)/,
    );
    assert.match(
      AI_CONTROL_PLANE_SQL,
      /UNIQUE \(tenant_id, workspace_id, run_id, status\)/,
    );
    assert.match(
      AI_ROUTING_BUDGET_SQL,
      /UNIQUE \(id, tenant_id, workspace_id, agent_id\)[\s\S]*FOREIGN KEY \(spend_reservation_id, tenant_id, workspace_id, agent_id\)[\s\S]*REFERENCES ai_spend_reservations\(id, tenant_id, workspace_id, agent_id\)/,
    );
    assert.match(AI_ROUTING_BUDGET_SQL, /ai_spend_reservations_no_delete/);
    assert.doesNotMatch(
      `${AI_CONTROL_PLANE_SQL}\n${AI_ROUTING_BUDGET_SQL}`,
      /(?:ENABLE|FORCE) ROW LEVEL SECURITY|CREATE POLICY/,
    );
  });

  it(
    "rejects cross-workspace evidence/reservations with 23503 and scopes uniqueness to workspace",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const tenantId = `ai-integrity-${randomUUID()}`;
      const workspaceA = `${tenantId}-a`;
      const workspaceB = `${tenantId}-b`;
      const knowledgeHash = digest(`${tenantId}:knowledge`);
      const workflowHash = digest(`${tenantId}:workflow`);
      const routingHash = digest(`${tenantId}:routing`);
      const runId = randomUUID();
      const reservationId = randomUUID();
      const budgetMonth = new Date().toISOString().slice(0, 7) + "-01";

      await withClient(async (client) => {
        await client.query(
          `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
           VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`,
          [tenantId],
        );
        for (const workspaceId of [workspaceA, workspaceB]) {
          await client.query(
            `INSERT INTO platform_workspaces
               (id, tenant_id, slug, display_name, products, settings)
             VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
            [workspaceId, tenantId],
          );
        }

        const knowledge = await client.query<{ id: string }>(
          `INSERT INTO ai_knowledge_items
             (tenant_id, workspace_id, knowledge_type, subject_type, statement,
              content_hash, confidence, data_class, derived_by_agent)
           VALUES ($1, $2, 'operating_rule', 'tenant_integrity',
                   'Tenant evidence must remain inside its owning workspace.',
                   $3, 90, 'approved_platform_content', 'knowledge_curator')
           RETURNING id`,
          [tenantId, workspaceA, knowledgeHash],
        );
        const knowledgeItemId = knowledge.rows[0]!.id;
        await rejectsWithPgCode(
          () => client.query(
            `INSERT INTO ai_knowledge_item_events
               (tenant_id, workspace_id, knowledge_item_id, event_type,
                content_hash, metadata)
             VALUES ($1, $2, $3::uuid, 'candidate_created', $4, '{}'::jsonb)`,
            [tenantId, workspaceB, knowledgeItemId, knowledgeHash],
          ),
          "23503",
        );
        await client.query(
          `INSERT INTO ai_knowledge_item_events
             (tenant_id, workspace_id, knowledge_item_id, event_type,
              content_hash, metadata)
           VALUES ($1, $2, $3::uuid, 'candidate_created', $4, '{}'::jsonb)`,
          [tenantId, workspaceA, knowledgeItemId, knowledgeHash],
        );

        const insertWorkflowEvidence = (workspaceId: string) => client.query(
          `INSERT INTO ai_workflow_run_evidence
             (tenant_id, workspace_id, run_id, workflow_id, agent_id,
              provider_id, model, input_hash, status, approval_mode)
           VALUES ($1, $2, $3::uuid, 'mentor_response', 'mentor_coach',
                   'openai', 'integrity-test-model', $4, 'admitted', 'none')`,
          [tenantId, workspaceId, runId, workflowHash],
        );
        await insertWorkflowEvidence(workspaceA);
        await insertWorkflowEvidence(workspaceB);
        await rejectsWithPgCode(() => insertWorkflowEvidence(workspaceA), "23505");

        await client.query(
          `INSERT INTO ai_agent_spend_monthly
             (tenant_id, workspace_id, agent_id, budget_month)
           VALUES ($1, $2, 'mentor_coach', $3::date)`,
          [tenantId, workspaceA, budgetMonth],
        );
        await client.query(
          `INSERT INTO ai_spend_reservations
             (id, tenant_id, workspace_id, agent_id, budget_month,
              idempotency_key, reserved_usd_micros, expires_at)
           VALUES ($1::uuid, $2, $3, 'mentor_coach', $4::date,
                   $5, 1000, NOW() + INTERVAL '5 minutes')`,
          [
            reservationId,
            tenantId,
            workspaceA,
            budgetMonth,
            `integrity:${randomUUID()}`,
          ],
        );
        const insertRoutingEvidence = (workspaceId: string, agentId: string) =>
          client.query(
            `INSERT INTO ai_routing_decision_events
             (tenant_id, workspace_id, run_id, agent_id, route_mode,
                decision_code, candidate_count, data_class, criticality,
                external_effect, approval_mode, spend_reservation_id,
                reserved_usd_micros, accounted_cost_usd_micros,
                overrun_usd_micros, decision_hash)
             VALUES ($1, $2, $3::uuid, $4, 'blocked', 'integrity_check', 0,
                     'public', 'standard', FALSE, 'none', $5::uuid,
                     1000, 0, 0, $6)`,
            [tenantId, workspaceId, randomUUID(), agentId, reservationId, routingHash],
          );
        await rejectsWithPgCode(
          () => insertRoutingEvidence(workspaceB, "mentor_coach"),
          "23503",
        );
        await rejectsWithPgCode(
          () => insertRoutingEvidence(workspaceA, "content_reviewer"),
          "23503",
        );
        await insertRoutingEvidence(workspaceA, "mentor_coach");
        await rejectsWithPgCode(
          () => client.query(
            "DELETE FROM ai_spend_reservations WHERE id = $1::uuid",
            [reservationId],
          ),
          "55000",
        );
      });
    },
  );
});
