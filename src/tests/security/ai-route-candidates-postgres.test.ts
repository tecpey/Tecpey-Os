import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 5_000,
    query_timeout: 30_000,
    statement_timeout: 30_000,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("AI route candidate PostgreSQL authority", () => {
  it(
    "isolates tenant routes, rejects unsafe free routes and keeps events append-only",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const suffix = randomUUID();
      const scopes = ["route-a", "route-b"].map((label) => ({
        tenantId: `${label}-${suffix}`,
        workspaceId: `${label}-${suffix}-main`,
      }));
      const client = await pool!.connect();
      try {
        for (const scope of scopes) {
          await client.query(
            `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
             VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`,
            [scope.tenantId],
          );
          await client.query(
            `INSERT INTO platform_workspaces
               (id, tenant_id, slug, display_name, products, settings)
             VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
            [scope.workspaceId, scope.tenantId],
          );
          await client.query(
            `INSERT INTO ai_provider_configs
               (tenant_id, workspace_id, provider_id, enabled)
             VALUES ($1, $2, 'openai', FALSE), ($1, $2, 'openrouter', FALSE)`,
            [scope.tenantId, scope.workspaceId],
          );
          await client.query(
            `INSERT INTO ai_agent_bindings
               (tenant_id, workspace_id, agent_id, enabled, provider_id, model,
                daily_request_limit, daily_token_limit, max_input_tokens,
                max_output_tokens, max_request_cost_usd_micros,
                monthly_budget_usd_micros, approval_mode)
             VALUES ($1, $2, 'mentor_coach', FALSE, 'openai', 'gpt-test',
                     10, 10000, 1000, 200, 500000, 1000000, 'none')`,
            [scope.tenantId, scope.workspaceId],
          );
          await client.query(
            `INSERT INTO ai_agent_route_candidates
               (tenant_id, workspace_id, agent_id, provider_id, model, priority,
                estimated_max_cost_usd_micros, expected_latency_ms,
                supported_data_classes)
             VALUES ($1, $2, 'mentor_coach', 'openai', 'gpt-route', 1,
                     100000, 500, ARRAY['private_user']::text[])`,
            [scope.tenantId, scope.workspaceId],
          );
        }

        const scoped = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM ai_agent_route_candidates
            WHERE tenant_id = $1 AND workspace_id = $2`,
          [scopes[0].tenantId, scopes[0].workspaceId],
        );
        assert.deepEqual(scoped.rows.map((row) => row.tenant_id), [scopes[0].tenantId]);

        await assert.rejects(
          client.query(
            `INSERT INTO ai_agent_route_candidates
               (tenant_id, workspace_id, agent_id, provider_id, model, priority,
                estimated_max_cost_usd_micros, expected_latency_ms, free,
                supported_data_classes)
             VALUES ($1, $2, 'mentor_coach', 'openrouter', 'openrouter/free', 2,
                     0, 500, TRUE, ARRAY['private_user']::text[])`,
            [scopes[0].tenantId, scopes[0].workspaceId],
          ),
        );

        const event = await client.query<{ id: string }>(
          `INSERT INTO ai_agent_route_candidate_events
             (tenant_id, workspace_id, agent_id, event_type, route_count,
              revision, routes_snapshot)
           VALUES ($1, $2, 'mentor_coach', 'replaced', 0, 1, '[]'::jsonb)
           RETURNING id`,
          [scopes[0].tenantId, scopes[0].workspaceId],
        );
        await assert.rejects(
          client.query(
            "UPDATE ai_agent_route_candidate_events SET revision = 2 WHERE id = $1",
            [event.rows[0].id],
          ),
          /append-only|mutation/i,
        );
      } finally {
        for (const scope of scopes) {
          await client.query("DELETE FROM platform_tenants WHERE id = $1", [scope.tenantId]);
        }
        client.release();
      }
    },
  );
});
