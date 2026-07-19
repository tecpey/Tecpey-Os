import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));

const REQUIRED_MIGRATIONS = [
  "0001_initial_schema.sql",
  "0011_withdrawal_execution.sql",
  "0012_academy_runtime_schema_repair.sql",
  "0018_admin_control_plane_foundation.sql",
  "0019_admin_control_plane_hardening.sql",
  "0020_trading_arena_execution.sql",
  "0021_academy_progress_authority.sql",
  "0023_offline_sync_command_authority.sql",
] as const;

const REQUIRED_TABLES = [
  "academy_students",
  "academy_state_documents",
  "academy_trading_arena_commands",
  "offline_sync_commands",
  "orders",
  "withdrawals",
  "admin_sessions",
  "admin_audit_events",
] as const;

const REQUIRED_COLUMNS = [
  ["withdrawals", "raw_tx"],
  ["withdrawals", "required_confirmations"],
  ["academy_trading_arena_attempts", "execution_state"],
  ["academy_state_documents", "reflection_revision"],
  ["admin_audit_events", "chain_sequence"],
  ["offline_sync_commands", "command_hash"],
  ["offline_sync_commands", "retain_until"],
] as const;

describe("PostgreSQL migration authority", () => {
  it("builds the critical schema and reruns without ledger drift", {
    skip: !databaseConfigured,
    timeout: 60_000,
  }, async () => {
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: 5_000,
    });
    const client = await pool.connect();

    try {
      await applyDatabaseMigrationsWithLock(client);
      const firstLedger = await client.query<{ filename: string; checksum: string }>(
        "SELECT filename, checksum FROM _migrations ORDER BY filename",
      );

      await applyDatabaseMigrationsWithLock(client);
      const secondLedger = await client.query<{ filename: string; checksum: string }>(
        "SELECT filename, checksum FROM _migrations ORDER BY filename",
      );

      assert.deepEqual(secondLedger.rows, firstLedger.rows, "rerun must not mutate the migration ledger");
      assert.equal(
        new Set(secondLedger.rows.map((row) => row.filename)).size,
        secondLedger.rows.length,
        "migration filenames must remain unique",
      );

      const applied = new Set(secondLedger.rows.map((row) => row.filename));
      for (const filename of REQUIRED_MIGRATIONS) {
        assert.ok(applied.has(filename), `required migration missing: ${filename}`);
      }

      const tables = await client.query<{ table_name: string }>(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ANY($1::text[])`,
        [REQUIRED_TABLES],
      );
      assert.deepEqual(
        new Set(tables.rows.map((row) => row.table_name)),
        new Set(REQUIRED_TABLES),
        "critical domain tables must exist",
      );

      const columns = await client.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'`,
      );
      const columnSet = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
      for (const [table, column] of REQUIRED_COLUMNS) {
        assert.ok(columnSet.has(`${table}.${column}`), `required column missing: ${table}.${column}`);
      }

      const indexResult = await client.query<{
        wallet_index: string | null;
        offline_reconcile_index: string | null;
      }>(
        `SELECT
           to_regclass('public.uq_wallet_ledger_withdrawal_phase')::text AS wallet_index,
           to_regclass('public.offline_sync_commands_reconcile_idx')::text AS offline_reconcile_index`,
      );
      assert.equal(indexResult.rows[0]?.wallet_index, "uq_wallet_ledger_withdrawal_phase");
      assert.equal(
        indexResult.rows[0]?.offline_reconcile_index,
        "offline_sync_commands_reconcile_idx",
      );

      const offlineUnique = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1
             FROM pg_constraint
            WHERE conrelid = 'offline_sync_commands'::regclass
              AND contype = 'u'
              AND pg_get_constraintdef(oid) LIKE '%tenant_id, student_id, client_event_id%'
         ) AS exists`,
      );
      assert.equal(
        offlineUnique.rows[0]?.exists,
        true,
        "offline command identity must be database-unique per tenant and student",
      );

      const triggerResult = await client.query<{ tgname: string }>(
        `SELECT tgname
           FROM pg_trigger
          WHERE NOT tgisinternal
            AND tgname = ANY($1::text[])`,
        [[
          "admin_audit_events_no_update",
          "admin_audit_events_no_delete",
          "admin_audit_events_validate_chain",
        ]],
      );
      assert.equal(triggerResult.rows.length, 3, "admin audit immutability triggers must exist");
    } finally {
      client.release();
      await pool.end();
    }
  });
});
