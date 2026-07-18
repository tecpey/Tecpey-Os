import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0018_admin_control_plane_hardening.sql";

export const ADMIN_CONTROL_PLANE_HARDENING_SQL = `
DROP INDEX IF EXISTS admin_user_roles_active_idx;
CREATE UNIQUE INDEX admin_user_roles_active_idx
  ON admin_user_roles (admin_id, role_id)
  WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION tecpey_block_admin_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_events is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS admin_audit_events_no_update ON admin_audit_events;
CREATE TRIGGER admin_audit_events_no_update
  BEFORE UPDATE ON admin_audit_events
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_admin_audit_mutation();

DROP TRIGGER IF EXISTS admin_audit_events_no_delete ON admin_audit_events;
CREATE TRIGGER admin_audit_events_no_delete
  BEFORE DELETE ON admin_audit_events
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_admin_audit_mutation();

CREATE OR REPLACE FUNCTION tecpey_validate_admin_audit_chain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  latest_hash TEXT;
BEGIN
  -- The transaction-scoped advisory lock serializes audit writers until the
  -- surrounding transaction commits, without upgrading the table lock held by
  -- INSERT and risking a lock-conversion deadlock.
  PERFORM pg_advisory_xact_lock(hashtext('tecpey_admin_audit_chain'));

  SELECT event_hash
    INTO latest_hash
    FROM admin_audit_events
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

  IF NEW.previous_hash IS DISTINCT FROM latest_hash THEN
    RAISE EXCEPTION 'admin_audit_chain_conflict'
      USING ERRCODE = '40001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_audit_events_validate_chain ON admin_audit_events;
CREATE TRIGGER admin_audit_events_validate_chain
  BEFORE INSERT ON admin_audit_events
  FOR EACH ROW EXECUTE FUNCTION tecpey_validate_admin_audit_chain();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runAdminControlPlaneHardeningMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ADMIN_CONTROL_PLANE_HARDENING_SQL);
  const applied = await client.query<{ checksum: string }>(
    `SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1`,
    [FILENAME],
  );

  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-admin-hardening] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  logger.info("[db-migrate-admin-hardening] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(ADMIN_CONTROL_PLANE_HARDENING_SQL);
    await client.query(
      `INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)`,
      [FILENAME, cs],
    );
    await client.query("COMMIT");
    logger.info("[db-migrate-admin-hardening] migration applied", { filename: FILENAME });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
