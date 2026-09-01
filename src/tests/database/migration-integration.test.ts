import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  applyDatabaseMigrations,
  applyDatabaseMigrationsWithLock,
  DATABASE_MIGRATION_LOCK_KEYS,
} from "../../lib/db-migration-plan";
import { DATABASE_MIGRATION_EXPECTATIONS } from "../../lib/db-migration-registry";
import { databaseSchemaFingerprint } from "../../lib/database-schema-contract";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));

function databaseConnectionUrl(name: string): string {
  const url = new URL(databaseUrl!);
  url.pathname = `/${name}`;
  return url.toString();
}

function governedDatabaseName(role: string, suffix: string): string {
  const name = `tecpey_166_${role}_${suffix}`;
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error("invalid_governed_test_database_name");
  return name;
}

async function migrateAndFingerprint(name: string): Promise<string> {
  const pool = new Pool({ connectionString: databaseConnectionUrl(name), max: 1 });
  const client = await pool.connect();
  try {
    await applyDatabaseMigrationsWithLock(client);
    return await databaseSchemaFingerprint(client);
  } finally {
    client.release();
    await pool.end();
  }
}

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
  "0025_crm_lead_authority.sql",
  "0026_crm_lead_hardening.sql",
  "0027_academy_progress_authority_v2.sql",
  "0027_exchange_order_admission_authority.sql",
  "0030_withdrawal_admission_authority.sql",
  "0031_withdrawal_settlement_authority.sql",
  "0032_api_command_idempotency.sql",
  "0033_sensitive_mutation_audit.sql",
  "0055_learning_brain_refresh_columns.sql",
  "0056_achievement_contract_columns.sql",
  "0057_learning_brain_tenant_cache.sql",
  "0058_news_materialization_authority.sql",
  "0062_academy_question_bank_locale.sql",
  "0063_notification_brain_snapshot_contract.sql",
  "0064_notification_brain_snapshot_contract_repair.sql",
  "0076_academy_credential_ledger.sql",
  "0077_academy_credential_notification.sql",
  "0078_arena_league_score_ledger.sql",
  "0079_arena_league_rankings.sql",
  "0080_arena_league_ranking_refresh.sql",
  "0081_academy_credential_lifecycle_notification.sql",
  "0082_arena_entitlement_grants.sql",
  "0083_academy_daily_repair_challenges.sql",
] as const;

const REQUIRED_TABLES = [
  "academy_students",
  "academy_state_documents",
  "academy_trading_arena_commands",
  "academy_progress_legacy_reward_quarantine",
  "offline_sync_commands",
  "notification_domain_outbox",
  "notification_domain_outbox_attempts",
  "notification_domain_dead_letters",
  "crm_leads",
  "crm_lead_commands",
  "crm_lead_delivery_outbox",
  "crm_lead_audit_events",
  "exchange_order_commands",
  "exchange_order_command_attempts",
  "orders",
  "withdrawals",
  "withdrawal_price_snapshots",
  "withdrawal_authorizations",
  "withdrawal_admission_outbox",
  "admin_sessions",
  "admin_audit_events",
  "api_command_receipts",
  "sensitive_mutation_audit_events",
  "platform_news_materialization_snapshots",
  "platform_news_impact_history_items",
  "platform_news_materialization_snapshot_items",
  "academy_credential_records",
  "academy_credential_events",
  "academy_credential_visibility_events",
  "academy_arena_trade_score_ledger",
  "academy_arena_league_snapshots",
  "academy_arena_league_rankings",
  "academy_arena_entitlement_grants",
  "academy_daily_repair_challenges",
  "academy_daily_repair_challenge_events",
] as const;

const REQUIRED_COLUMNS = [
  ["withdrawals", "raw_tx"],
  ["withdrawals", "required_confirmations"],
  ["withdrawals", "request_hash"],
  ["academy_trading_arena_attempts", "execution_state"],
  ["academy_state_documents", "reflection_revision"],
  ["academy_progress_legacy_reward_quarantine", "original_reward_id"],
  ["academy_progress_legacy_reward_quarantine", "reason"],
  ["admin_audit_events", "chain_sequence"],
  ["learning_events", "event_id"],
  ["learning_events", "source"],
  ["learning_events", "locale"],
  ["offline_sync_commands", "command_hash"],
  ["offline_sync_commands", "domain_event_id"],
  ["offline_sync_commands", "retain_until"],
  ["ai_automation_runs", "command_hash"],
  ["ai_automation_runs", "execution_connector_id"],
  ["notification_domain_outbox", "payload_hash"],
  ["notification_domain_outbox", "lease_expires_at"],
  ["notification_domain_outbox", "notification_intent_id"],
  ["crm_leads", "pii_ciphertext"],
  ["crm_leads", "contact_hash"],
  ["crm_leads", "privacy_notice_version"],
  ["crm_leads", "retain_until"],
  ["crm_lead_commands", "request_hash"],
  ["crm_lead_delivery_outbox", "lease_expires_at"],
  ["crm_lead_audit_events", "network_fingerprint"],
  ["exchange_order_commands", "request_hash"],
  ["exchange_order_commands", "hold_amount"],
  ["exchange_order_commands", "lease_expires_at"],
  ["exchange_order_commands", "result"],
  ["exchange_order_command_attempts", "outcome"],
  ["api_command_receipts", "tenant_id"],
  ["api_command_receipts", "request_hash"],
  ["api_command_receipts", "retain_until"],
  ["sensitive_mutation_audit_events", "tenant_id"],
  ["sensitive_mutation_audit_events", "correlation_id"],
  ["sensitive_mutation_audit_events", "request_hash"],
  ["achievement_catalog", "code"],
  ["achievement_catalog", "xp"],
  ["student_achievements", "code"],
  ["student_achievements", "payload"],
  ["learning_brain_profiles", "tenant_id"],
  ["notification_brain_snapshots", "tenant_id"],
  ["notification_brain_snapshots", "return_probability"],
  ["notification_brain_snapshots", "churn_risk"],
  ["notification_brain_snapshots", "best_channel"],
  ["notification_brain_snapshots", "best_time_label"],
  ["notification_brain_snapshots", "next_hook_type"],
  ["notification_brain_snapshots", "next_action_url"],
  ["notification_brain_snapshots", "message_title"],
  ["notification_brain_snapshots", "message_body"],
  ["academy_question_bank", "locale"],
  ["platform_news_materialization_snapshots", "snapshot_hash"],
  ["platform_news_impact_history_items", "related_coin_symbols"],
  ["platform_news_materialization_snapshot_items", "position"],
  ["academy_credential_records", "evidence_sha256"],
  ["academy_credential_events", "idempotency_key"],
  ["academy_credential_visibility_events", "visibility"],
  ["academy_arena_trade_score_ledger", "source_digest"],
  ["academy_arena_league_snapshots", "source_digest"],
  ["academy_arena_league_rankings", "tier"],
  ["academy_arena_entitlement_grants", "expires_at"],
  ["academy_arena_entitlement_grants", "cash_disposition"],
  ["academy_daily_repair_challenges", "challenge_date"],
  ["academy_daily_repair_challenges", "evidence_sha256"],
  ["academy_daily_repair_challenge_events", "answer_sha256"],
  ["academy_daily_repair_challenge_events", "passed"],
] as const;

const REQUIRED_INDEXES = [
  "uq_wallet_ledger_withdrawal_phase",
  "learning_events_offline_event_id_idx",
  "offline_sync_commands_reconcile_idx",
  "offline_sync_commands_retention_idx",
  "notification_domain_outbox_claim_idx",
  "notification_domain_outbox_lease_idx",
  "crm_leads_active_contact_unique_idx",
  "crm_leads_retention_idx",
  "crm_lead_commands_lead_idx",
  "crm_lead_delivery_claim_idx",
  "crm_lead_delivery_lease_idx",
  "academy_progress_legacy_reward_student_idx",
  "exchange_order_commands_claim_idx",
  "exchange_order_commands_lease_idx",
  "exchange_order_commands_market_idx",
  "exchange_order_commands_user_idx",
  "exchange_order_command_attempts_command_idx",
  "withdrawals_tenant_user_idempotency_unique_idx",
  "api_command_receipts_retention_idx",
  "api_command_receipts_operation_idx",
  "sensitive_mutation_audit_actor_idx",
  "sensitive_mutation_audit_resource_idx",
  "sensitive_mutation_audit_action_idx",
  "achievement_catalog_code_unique_idx",
  "student_achievements_student_code_unique_idx",
  "learning_brain_profiles_student_idx",
  "notification_brain_snapshots_student_idx",
  "academy_question_bank_locale_lesson_idx",
  "platform_news_materialization_lookup_idx",
  "platform_news_impact_history_priority_idx",
  "platform_news_impact_history_coin_idx",
  "platform_news_impact_history_tool_idx",
  "academy_credential_records_profile_idx",
  "academy_credential_events_timeline_idx",
  "academy_credential_visibility_timeline_idx",
  "academy_arena_score_monthly_rank_idx",
  "academy_arena_ranking_student_idx",
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
  "academy_leads_legacy_read_only",
  "crm_leads_no_delete",
  "crm_lead_commands_no_update",
  "crm_lead_commands_no_delete",
  "crm_lead_audit_no_update",
  "crm_lead_audit_no_delete",
  "academy_lesson_progress_read_only",
  "academy_term_learning_progress_read_only",
  "academy_reward_ledger_reject_client_section",
  "academy_progress_legacy_reward_quarantine_no_update",
  "academy_progress_legacy_reward_quarantine_no_delete",
  "exchange_order_commands_identity_no_update",
  "exchange_order_commands_no_delete",
  "exchange_order_command_attempts_no_update",
  "exchange_order_command_attempts_no_delete",
  "api_command_receipts_guard",
  "sensitive_mutation_audit_validate",
  "sensitive_mutation_audit_no_update",
  "sensitive_mutation_audit_no_delete",
  "platform_news_materialization_snapshots_immutable",
  "platform_news_impact_history_items_immutable",
  "platform_news_materialization_snapshot_items_immutable",
  "academy_credential_records_no_update",
  "academy_credential_events_no_update",
  "academy_credential_visibility_events_no_update",
  "academy_credential_events_validate_transition",
  "academy_credential_visibility_validate_actor",
  "academy_arena_trade_score_no_update",
  "academy_arena_snapshot_finalized_immutable",
  "academy_arena_ranking_immutable",
  "academy_arena_ranking_open_snapshot_guard",
  "academy_arena_entitlement_grants_no_update",
  "academy_daily_repair_challenges_no_update",
  "academy_daily_repair_challenge_events_no_update",
] as const;

const REQUIRED_CONSTRAINTS = [
  "crm_leads_legal_basis_consent_check",
  "ai_automation_runs_command_hash_check",
  "ai_automation_runs_execution_connector_check",
  "ai_automation_runs_started_connector_check",
  "ai_knowledge_items_tenant_workspace_id_key",
  "ai_knowledge_item_events_scope_fk",
  "ai_workflow_run_evidence_scope_status_key",
] as const;

describe("PostgreSQL migration authority", () => {
  it("converges clean, upgraded, and restored databases to one schema fingerprint", {
    skip: !databaseConfigured,
    timeout: 120_000,
  }, async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const clean = governedDatabaseName("clean", suffix);
    const backup = governedDatabaseName("backup", suffix);
    const restored = governedDatabaseName("restored", suffix);
    const upgraded = governedDatabaseName("upgraded", suffix);
    const adminUrl = new URL(databaseUrl!);
    adminUrl.pathname = "/postgres";
    const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
    try {
      await admin.query(`CREATE DATABASE ${clean}`);
      const cleanFingerprint = await migrateAndFingerprint(clean);

      await admin.query(`CREATE DATABASE ${backup} TEMPLATE ${clean}`);
      await admin.query(`CREATE DATABASE ${restored} TEMPLATE ${backup}`);
      const restoredFingerprint = await migrateAndFingerprint(restored);

      await admin.query(`CREATE DATABASE ${upgraded}`);
      const upgradedPool = new Pool({ connectionString: databaseConnectionUrl(upgraded), max: 1 });
      const upgradedClient = await upgradedPool.connect();
      let upgradedFingerprint: string;
      try {
        // Start from the clean schema, then reproduce the exact governed
        // schema-96 drift observed on staging: 0091/0092 have their original
        // full checksums, 0094+ are absent, and the later canonical columns,
        // scope constraints and transition function are not installed.
        await applyDatabaseMigrations(upgradedClient);
        await upgradedClient.query(`
          ALTER TABLE ai_automation_runs
            DROP COLUMN IF EXISTS command_hash CASCADE,
            DROP COLUMN IF EXISTS execution_connector_id CASCADE;

          DO $drop_schema96_constraints$
          DECLARE
            candidate RECORD;
          BEGIN
            FOR candidate IN
              SELECT conrelid::regclass::text AS relation_name, conname
                FROM pg_constraint
               WHERE (
                 conrelid = 'ai_knowledge_items'::regclass
                 AND contype = 'u'
                 AND pg_get_constraintdef(oid) =
                   'UNIQUE (tenant_id, workspace_id, id)'
               ) OR (
                 conrelid = 'ai_knowledge_item_events'::regclass
                 AND contype = 'f'
                 AND pg_get_constraintdef(oid) LIKE
                   'FOREIGN KEY (tenant_id, workspace_id, knowledge_item_id)%'
               ) OR (
                 conrelid = 'ai_workflow_run_evidence'::regclass
                 AND contype = 'u'
                 AND pg_get_constraintdef(oid) =
                   'UNIQUE (tenant_id, workspace_id, run_id, status)'
               )
            LOOP
              EXECUTE format(
                'ALTER TABLE %s DROP CONSTRAINT %I CASCADE',
                candidate.relation_name,
                candidate.conname
              );
            END LOOP;
          END
          $drop_schema96_constraints$;

          ALTER TABLE ai_knowledge_item_events
            ADD CONSTRAINT ai_knowledge_item_events_legacy_item_fk
            FOREIGN KEY (knowledge_item_id)
            REFERENCES ai_knowledge_items(id) ON DELETE RESTRICT;
          ALTER TABLE ai_workflow_run_evidence
            ADD CONSTRAINT ai_workflow_run_evidence_legacy_status_key
            UNIQUE (tenant_id, run_id, status);

          DROP TABLE IF EXISTS platform_news_archive_translations CASCADE;
          DROP TABLE IF EXISTS platform_growth_trend_signals CASCADE;
          DROP TABLE IF EXISTS platform_news_archive_items CASCADE;
          DROP TABLE IF EXISTS support_messages CASCADE;
          DROP TABLE IF EXISTS ai_agent_route_candidate_events CASCADE;
          DROP TABLE IF EXISTS ai_agent_route_candidates CASCADE;
          DROP TABLE IF EXISTS ai_routing_decision_events CASCADE;
          DROP TABLE IF EXISTS ai_spend_reservations CASCADE;
          DROP TABLE IF EXISTS ai_agent_spend_monthly CASCADE;
          ALTER TABLE ai_agent_bindings
            DROP COLUMN IF EXISTS max_request_cost_usd_micros CASCADE;

          DELETE FROM _migrations
           WHERE filename = ANY(ARRAY[
             '0094_ai_routing_budget.sql',
             '0095_ai_route_candidates.sql',
             '0096_ai_tenant_row_level_security.sql',
             '0097_support_messages.sql',
             '0098_news_archive_and_growth_intelligence.sql'
           ]::text[]);
          UPDATE _migrations
             SET checksum = '3bb54ffbdae67711ac7508a27e8d0b4846dba2d8dd0e319ed2edbe842584c7a8'
           WHERE filename = '0091_ai_control_plane.sql';
          UPDATE _migrations
             SET checksum = '6c490226a77fd372f0f2cd5229e2caa458eb467447b69fbf6b106b87fb92e853'
           WHERE filename = '0092_ai_automation_orchestration.sql';
        `);
        const legacyBootstrap = await upgradedClient.query<{
          state_table: string | null;
          ledger_table: string | null;
          state_rows: number;
          tenant_can_read_state: boolean;
          worker_can_read_state: boolean;
        }>(
          `SELECT to_regclass('public._migration_runtime_state')::text AS state_table,
                  to_regclass('public._migration_runtime_ledger')::text AS ledger_table,
                  (SELECT COUNT(*)::integer FROM _migration_runtime_state) AS state_rows,
                  has_table_privilege(
                    'tecpey_ai_tenant_runtime',
                    'public._migration_runtime_state',
                    'SELECT'
                  ) AS tenant_can_read_state,
                  has_table_privilege(
                    'tecpey_ai_worker',
                    'public._migration_runtime_state',
                    'SELECT'
                  ) AS worker_can_read_state`,
        );
        assert.deepEqual(legacyBootstrap.rows, [{
          state_table: "_migration_runtime_state",
          ledger_table: "_migration_runtime_ledger",
          state_rows: 0,
          tenant_can_read_state: true,
          worker_can_read_state: true,
        }]);
        for (const expectation of DATABASE_MIGRATION_EXPECTATIONS) {
          if (
            expectation.identity === "0091_ai_control_plane.sql" ||
            expectation.identity === "0092_ai_automation_orchestration.sql"
          ) {
            continue;
          }
          const historicalChecksum = expectation.identity === "0046_tenant_principal_isolation_foundation.sql"
            ? expectation.compatibleHistoricalChecksums.find((checksum) => checksum.length === 64)
            : expectation.compatibleHistoricalChecksums.find((checksum) => checksum.length === 16);
          assert.ok(historicalChecksum);
          await upgradedClient.query(
            "UPDATE _migrations SET checksum = $1 WHERE filename = $2",
            [historicalChecksum, expectation.identity],
          );
        }
        await applyDatabaseMigrationsWithLock(upgradedClient);
        upgradedFingerprint = await databaseSchemaFingerprint(upgradedClient);
      } finally {
        upgradedClient.release();
        await upgradedPool.end();
      }

      assert.equal(upgradedFingerprint, cleanFingerprint, "upgraded schema must converge with clean schema");
      assert.equal(restoredFingerprint, cleanFingerprint, "restored schema must converge with clean schema");
    } finally {
      for (const name of [restored, backup, upgraded, clean]) {
        await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      }
      await admin.end();
    }
  });

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
      assert.ok(
        secondLedger.rows.every((row) => /^[0-9a-f]{64}$/.test(row.checksum)),
        "clean migration applications must persist full SHA-256 checksums",
      );

      const applied = new Set(secondLedger.rows.map((row) => row.filename));
      const originalChecksums = new Map(
        secondLedger.rows.map((row) => [row.filename, row.checksum]),
      );
      for (const filename of REQUIRED_MIGRATIONS) {
        assert.ok(applied.has(filename), `required migration missing: ${filename}`);
      }

      const historicalBase = DATABASE_MIGRATION_EXPECTATIONS.find(
        (entry) => entry.identity === "0001_initial_schema.sql",
      );
      assert.ok(historicalBase?.compatibleHistoricalChecksums[0]);
      await client.query("SELECT pg_advisory_lock($1, $2)", [...DATABASE_MIGRATION_LOCK_KEYS]);
      try {
        await client.query(
          "UPDATE _migrations SET checksum = $1 WHERE filename = $2",
          [historicalBase.compatibleHistoricalChecksums[0], historicalBase.identity],
        );
        await applyDatabaseMigrationsWithLock(client);
        const historicalBaseEvidence = await client.query<{ checksum: string }>(
          "SELECT checksum FROM _migrations WHERE filename = $1",
          [historicalBase.identity],
        );
        assert.equal(
          historicalBaseEvidence.rows[0]?.checksum,
          historicalBase.compatibleHistoricalChecksums[0],
          "governed historical 16-character checksums must verify without ledger rewrites",
        );

        const historicalTenantChecksum =
          "0fb4eb3a3bd8deede63dc53edb211ef6bc12d7c329f48e93a918070cbd0167be";
        await client.query(
          "UPDATE _migrations SET checksum = $1 WHERE filename = $2",
          [historicalTenantChecksum, "0046_tenant_principal_isolation_foundation.sql"],
        );
        await applyDatabaseMigrationsWithLock(client);
        const upgradedEvidence = await client.query<{ checksum: string }>(
          "SELECT checksum FROM _migrations WHERE filename = $1",
          ["0046_tenant_principal_isolation_foundation.sql"],
        );
        assert.equal(
          upgradedEvidence.rows[0]?.checksum,
          historicalTenantChecksum,
          "governed historical full checksums must verify without rewriting ledger history",
        );
      } finally {
        for (const identity of [
          historicalBase.identity,
          "0046_tenant_principal_isolation_foundation.sql",
        ]) {
          const originalChecksum = originalChecksums.get(identity);
          assert.ok(originalChecksum, `original migration checksum missing: ${identity}`);
          await client.query(
            "UPDATE _migrations SET checksum = $1 WHERE filename = $2",
            [originalChecksum, identity],
          );
        }
        await applyDatabaseMigrationsWithLock(client);
        await client.query("SELECT pg_advisory_unlock($1, $2)", [
          ...DATABASE_MIGRATION_LOCK_KEYS,
        ]);
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

      const constraintResult = await client.query<{ conname: string }>(
        `SELECT conname
           FROM pg_constraint
          WHERE conname = ANY($1::text[])`,
        [REQUIRED_CONSTRAINTS],
      );
      assert.deepEqual(
        new Set(constraintResult.rows.map((row) => row.conname)),
        new Set(REQUIRED_CONSTRAINTS),
        "critical governed constraints must exist",
      );
    } finally {
      client.release();
      await pool.end();
    }
  });
});
