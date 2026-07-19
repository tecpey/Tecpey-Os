import type { PoolClient } from "pg";

export const OFFLINE_SYNC_MIGRATION_NAME = "0024_offline_sync_commands.sql";

export async function runOfflineSyncMigrations(
  client: PoolClient,
): Promise<void> {
  const alreadyApplied = await client.query<{ applied: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM schema_migrations WHERE name = $1
     ) AS applied`,
    [OFFLINE_SYNC_MIGRATION_NAME],
  );
  if (alreadyApplied.rows[0]?.applied) return;

  await client.query("BEGIN");
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS offline_sync_commands (
        id UUID PRIMARY KEY,
        student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
        client_event_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        event_type TEXT NOT NULL,
        source TEXT NOT NULL,
        locale TEXT NOT NULL,
        client_created_at TIMESTAMPTZ NOT NULL,
        learning_event_id UUID NOT NULL REFERENCES learning_events(event_id) ON DELETE RESTRICT,
        result JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT offline_sync_client_event_id_format
          CHECK (
            char_length(client_event_id) BETWEEN 8 AND 200
            AND client_event_id ~ '^[A-Za-z0-9._:-]+$'
          ),
        CONSTRAINT offline_sync_payload_hash_format
          CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
        CONSTRAINT offline_sync_source_allowed
          CHECK (source IN ('web', 'ios', 'android')),
        CONSTRAINT offline_sync_locale_allowed
          CHECK (locale IN ('fa', 'en')),
        CONSTRAINT offline_sync_student_event_unique
          UNIQUE (student_id, client_event_id),
        CONSTRAINT offline_sync_learning_event_unique
          UNIQUE (learning_event_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS offline_sync_commands_student_created_idx
        ON offline_sync_commands(student_id, created_at DESC)
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION prevent_offline_sync_command_update()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'offline_sync_commands_are_immutable';
      END;
      $$
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS offline_sync_commands_no_update
        ON offline_sync_commands
    `);
    await client.query(`
      CREATE TRIGGER offline_sync_commands_no_update
      BEFORE UPDATE ON offline_sync_commands
      FOR EACH ROW EXECUTE FUNCTION prevent_offline_sync_command_update()
    `);

    await client.query(
      `INSERT INTO schema_migrations (name)
       VALUES ($1)
       ON CONFLICT (name) DO NOTHING`,
      [OFFLINE_SYNC_MIGRATION_NAME],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
