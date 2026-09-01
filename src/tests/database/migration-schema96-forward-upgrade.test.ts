// This filename intentionally participates in the governed test:migrations suite.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PoolClient } from "pg";
import { AI_SCHEMA96_FORWARD_RECONCILIATION_SQL } from "../../lib/db-migrate-ai-routing-budget";
import { assertAiTenantRlsMigrationAuthority } from "../../lib/db-migrate-ai-tenant-rls";

function authorityClient(input: {
  applied?: boolean;
  superuser?: boolean;
  createRole?: boolean;
  createSchema?: boolean;
  createDatabase?: boolean;
  pgcryptoInstalled?: boolean;
  unauthorizedTableCount?: number;
}): PoolClient {
  return {
    query: async (sql: string) => {
      if (sql.includes("FROM _migrations")) {
        return { rows: input.applied ? [{ one: 1 }] : [] };
      }
      if (sql.includes("FROM pg_roles")) {
        return {
          rows: [{
            superuser: input.superuser ?? false,
            create_role: input.createRole ?? false,
            create_schema: input.createSchema ?? true,
            create_database: input.createDatabase ?? true,
            pgcrypto_installed: input.pgcryptoInstalled ?? true,
            unauthorized_table_count: input.unauthorizedTableCount ?? 0,
          }],
        };
      }
      throw new Error(`unexpected_query:${sql}`);
    },
  } as unknown as PoolClient;
}

describe("schema-96 forward upgrade authority", () => {
  it("repairs every evolved 0091/0092 contract before 0096", () => {
    for (const required of [
      "ADD COLUMN IF NOT EXISTS command_hash TEXT",
      "ADD COLUMN IF NOT EXISTS execution_connector_id TEXT",
      "ai_automation_runs_command_hash_check",
      "ai_automation_runs_started_connector_check",
      "ai_knowledge_items_tenant_workspace_id_key",
      "ai_knowledge_item_events_scope_fk",
      "ai_workflow_run_evidence_scope_status_key",
      "CREATE OR REPLACE FUNCTION tecpey_guard_ai_automation_run_transition()",
    ]) {
      assert.match(AI_SCHEMA96_FORWARD_RECONCILIATION_SQL, new RegExp(required.replace(/[()]/g, "\\$&")));
    }
    assert.match(AI_SCHEMA96_FORWARD_RECONCILIATION_SQL, /tecpey-legacy-command-v1/);
    assert.match(AI_SCHEMA96_FORWARD_RECONCILIATION_SQL, /legacy-unbound:/);
  });

  it("fails before partial migrations when CREATEROLE is absent", async () => {
    await assert.rejects(
      assertAiTenantRlsMigrationAuthority(authorityClient({ createRole: false })),
      /ai_tenant_rls_migration_authority_required:create_role/,
    );
  });

  it("accepts a bounded schema owner with CREATEROLE", async () => {
    await assert.doesNotReject(
      assertAiTenantRlsMigrationAuthority(authorityClient({ createRole: true })),
    );
  });

  it("does not demand migration authority after 0096 is applied", async () => {
    await assert.doesNotReject(
      assertAiTenantRlsMigrationAuthority(authorityClient({ applied: true })),
    );
  });
});
