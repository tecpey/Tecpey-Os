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
  "0024_notification_domain_outbox.sql",
  "0030_withdrawal_admission_authority.sql",
  "0031_withdrawal_settlement_authority.sql",
] as const;

const REQUIRED_TABLES = [
  "academy_students",
  "academy_state_documents",
  "academy_trading_arena_commands",
  "offline_sync_commands",
  "notification_domain_outbox",
  "notification_domain_outbox_attempts",
  "notification_domain_dead_letters",
  "orders",
  "withdrawals",
  "withdrawal_price_snapshots",
  "withdrawal_authorizations",
  "withdrawal_admission_outbox",
  "admin_sessions",
  "admin_audit_events",
] as const;

const REQUIRED_COLUMNS = [
  ["withdrawals", "raw_tx"],
  ["withdrawals", "required_confirmations"],
  ["withdrawals", "request_hash"],
  ["academy_trading_arena_attempts", "execution_state"],
  ["academy_state_documents", "reflection_revision"],
  ["admin_audit_events", "chain_sequence"],
  ["learning_events", "event_id"],
  ["learning_events", "source"],
  ["learning_events", "locale"],
  ["offline_sync_commands", "command_hash"],
  ["offline_sync_commands", "domain_event_id"],
  ["offline_sync_commands", "retain_until"],
  ["notification_domain_outbox", "payload_hash"],
  ["notification_domain_outbox", "lease_expires_at"],
  ["notification_domain_outbox", "notification_intent_id"],
] as const;

const REQUIRED_INDEXES = [
  "uq_wallet_ledger_withdrawal_phase",
  "learning_events_offline_event_id_idx",
  "offline_sync_commands_reconcile_idx",
  "offline_sync_commands_retention_idx",
  "notification_domain_outbox_claim_idx",
  "notification_domain_outbox_lease_idx",
  "withdrawals_user_idempotency_unique_idx",
] as const;

const REQUIRED_TRIGGERS = [
  "admin_audit_events_no_update",
  "admin_audit_events_no_delete",
  "admin_audit_events_validate_chain",
  "withdrawals_verify_price_evidence",
  "withdrawals_clear_terminal_reservation",
  "notification_domain_outbox_identity_no_update",
  "notification_domain_outbox_no_delete",
  "notification_domain_dead_letters_no_update",
  "notification_domain_dead_letters_no_delete",
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

      for (const indexName of REQUIRED_INDEXES) {
        const indexResult = await client.query<{ name: string | null }>(
          "SELECT to_regclass($1)::text AS name",
          [`public.${indexName}`],
        );
        assert.equal(indexResult.rows[0]?.name, indexName, `required index missing: ${indexName}`);
      }

      const triggerResult = await client.query<{ tgname: string }>(
        `SELECT tgname
           FROM pg_trigger
          WHERE NOT tgisinternal
            AND tgname = ANY($1::text[])`,
        [REQUIRED_TRIGGERS],
      );
      assert.deepEqual(
        new Set(triggerResult.rows.map((row) => row.tgname)),
        new Set(REQUIRED_TRIGGERS),
        "critical database authority triggers must exist",
      );
    } finally {
      client.release();
      await pool.end();
    }
  });
});
