import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PoolClient } from "pg";
import {
  AI_CONTROL_JSON_TRIGGER_REPAIR_SQL,
  runAiControlJsonTriggerRepairMigrations,
} from "../../lib/db-migrate-ai-control-json-trigger-repair";
import {
  AI_ROUTING_BUDGET_SQL,
  runAiRoutingBudgetMigrations,
} from "../../lib/db-migrate-ai-routing-budget";
import {
  AI_ROUTE_CANDIDATES_SQL,
  runAiRouteCandidateMigrations,
} from "../../lib/db-migrate-ai-route-candidates";

type Migration = {
  name: string;
  sql: string;
  run: (client: PoolClient) => Promise<void>;
};

const migrations: readonly Migration[] = [
  {
    name: "0093 AI control JSON trigger repair",
    sql: AI_CONTROL_JSON_TRIGGER_REPAIR_SQL,
    run: runAiControlJsonTriggerRepairMigrations,
  },
  {
    name: "0094 AI routing budget",
    sql: AI_ROUTING_BUDGET_SQL,
    run: runAiRoutingBudgetMigrations,
  },
  {
    name: "0095 AI route candidates",
    sql: AI_ROUTE_CANDIDATES_SQL,
    run: runAiRouteCandidateMigrations,
  },
];

type Statement = "CHECK" | "BEGIN" | "DDL" | "LEDGER" | "COMMIT" | "ROLLBACK";

function migrationClient(
  migrationSql: string,
  failure: "ddl" | "ledger" | null,
): { client: PoolClient; statements: Statement[] } {
  const statements: Statement[] = [];
  const client = {
    query: async (sql: string) => {
      const normalized = sql.trim();
      if (normalized.startsWith("SELECT checksum FROM _migrations")) {
        statements.push("CHECK");
        return { rows: [] };
      }
      if (sql === migrationSql) {
        statements.push("DDL");
        if (failure === "ddl") throw new Error("injected_ddl_failure");
        return { rows: [] };
      }
      if (normalized.startsWith("INSERT INTO _migrations")) {
        statements.push("LEDGER");
        if (failure === "ledger") throw new Error("injected_ledger_failure");
        return { rows: [] };
      }
      if (
        normalized === "BEGIN" ||
        normalized === "COMMIT" ||
        normalized === "ROLLBACK"
      ) {
        statements.push(normalized);
        return { rows: [] };
      }
      throw new Error(`unexpected_migration_query:${normalized.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
  return { client, statements };
}

describe("AI control-plane migration atomicity", () => {
  for (const migration of migrations) {
    it(`${migration.name} commits DDL and its ledger row together`, async () => {
      const { client, statements } = migrationClient(migration.sql, null);

      await migration.run(client);

      assert.deepEqual(statements, [
        "CHECK",
        "BEGIN",
        "DDL",
        "LEDGER",
        "COMMIT",
      ]);
    });

    it(`${migration.name} rolls back when ledger insertion fails`, async () => {
      const { client, statements } = migrationClient(
        migration.sql,
        "ledger",
      );

      await assert.rejects(
        migration.run(client),
        /injected_ledger_failure/,
      );
      assert.deepEqual(statements, [
        "CHECK",
        "BEGIN",
        "DDL",
        "LEDGER",
        "ROLLBACK",
      ]);
    });

    it(`${migration.name} rolls back when DDL fails`, async () => {
      const { client, statements } = migrationClient(migration.sql, "ddl");

      await assert.rejects(migration.run(client), /injected_ddl_failure/);
      assert.deepEqual(statements, ["CHECK", "BEGIN", "DDL", "ROLLBACK"]);
    });
  }
});
