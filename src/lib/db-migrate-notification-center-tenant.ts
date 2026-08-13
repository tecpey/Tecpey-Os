import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0071_notification_center_tenant.sql";

// notification_center is the legacy inbox being drained into
// platform_notifications, and it had no tenant boundary at all.
//
// That is not a latent problem, it is a live one: migrateLegacyNotificationsForPrincipal
// runs on every GET /api/notifications, selects legacy rows by student_id alone,
// and copies each into platform_notifications under the *reading* principal's
// tenant. Its NOT EXISTS guard is keyed by that same tenant, so it never
// prevented the copy — it guaranteed that every tenant a student is bound to
// drains the same legacy rows into its own inbox. A notification written while
// the student acted in one tenant appeared verbatim in another tenant's inbox,
// automatically, on read.
//
// Ownership of existing rows is derived rather than defaulted, the way migration
// 0070 derives certificate ownership: a notification belongs to the tenant its
// student is bound to.
//
// On the evidence, the population being backfilled is empty on any database this
// migration system produced. createSmartNotification is the only writer, and it
// inserts action_url, priority, channels, metadata and scheduled_for — columns
// added by the same base migration that declared channels as TEXT[]. The writer
// passed jsonb, so it failed on every call from the moment those columns existed
// (audit finding F-14, repaired separately). Rows can therefore only have
// arrived from outside this codebase, which is why unresolvable ownership stops
// the migration rather than guessing.

export const NOTIFICATION_CENTER_TENANT_SQL = `
ALTER TABLE notification_center
  ADD COLUMN IF NOT EXISTS tenant_id TEXT;

ALTER TABLE notification_center
  ADD COLUMN IF NOT EXISTS workspace_id TEXT;

-- A notification addressed to a student belongs to the tenant that student is
-- bound to. Where exactly one active binding exists, it is the owner.
UPDATE notification_center n
   SET tenant_id = binding.tenant_id,
       workspace_id = binding.workspace_id
  FROM (
    SELECT b.principal_id,
           MIN(b.tenant_id) AS tenant_id,
           MIN(b.workspace_id) AS workspace_id
      FROM platform_principal_bindings b
     WHERE b.principal_type = 'student'
       AND b.status = 'active'
     GROUP BY b.principal_id
    HAVING COUNT(DISTINCT (b.tenant_id, b.workspace_id)) = 1
  ) AS binding
 WHERE n.tenant_id IS NULL
   AND n.student_id::text = binding.principal_id;

-- Broadcast rows carry no student, so no binding can attribute them. They are
-- platform-wide legacy announcements from the single-tenant era and belong to
-- the default tenant.
UPDATE notification_center
   SET tenant_id = 'tecpey',
       workspace_id = 'main'
 WHERE tenant_id IS NULL
   AND student_id IS NULL;

-- What remains is addressed to a student bound to more than one tenant, or to no
-- tenant at all. Neither can be resolved from evidence, and guessing would hand
-- one tenant's notification to another — the exact disclosure this migration
-- closes. Name the rows and stop.
DO $$
DECLARE
  unresolved_ids TEXT;
BEGIN
  SELECT string_agg(id::text, ', ' ORDER BY id)
    INTO unresolved_ids
    FROM notification_center
   WHERE tenant_id IS NULL;
  IF unresolved_ids IS NOT NULL THEN
    RAISE EXCEPTION
      'notification_center ownership is unresolvable for: %. These notifications belong to students with no single active principal binding, so the owning tenant cannot be derived. Set tenant_id/workspace_id on these rows, then re-run.',
      unresolved_ids;
  END IF;
END $$;

ALTER TABLE notification_center ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE notification_center ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE notification_center
  DROP CONSTRAINT IF EXISTS notification_center_tenant_id_check;
ALTER TABLE notification_center
  ADD CONSTRAINT notification_center_tenant_id_check
  CHECK (tenant_id ~ '^[a-z][a-z0-9-]{2,63}$');

ALTER TABLE notification_center
  DROP CONSTRAINT IF EXISTS notification_center_workspace_id_check;
ALTER TABLE notification_center
  ADD CONSTRAINT notification_center_workspace_id_check
  CHECK (workspace_id ~ '^[a-z][a-z0-9-]{2,63}$');

ALTER TABLE notification_center
  DROP CONSTRAINT IF EXISTS notification_center_tenant_fk;
ALTER TABLE notification_center
  ADD CONSTRAINT notification_center_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE RESTRICT;

ALTER TABLE notification_center
  DROP CONSTRAINT IF EXISTS notification_center_tenant_workspace_fk;
ALTER TABLE notification_center
  ADD CONSTRAINT notification_center_tenant_workspace_fk
  FOREIGN KEY (tenant_id, workspace_id)
  REFERENCES platform_workspaces (tenant_id, id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS notification_center_tenant_student_idx
  ON notification_center (tenant_id, workspace_id, student_id, created_at DESC);
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runNotificationCenterTenantMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(NOTIFICATION_CENTER_TENANT_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-notification-center-tenant] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-notification-center-tenant] applying migration", {
    filename: FILENAME,
    checksum: cs,
  });
  await client.query("BEGIN");
  try {
    await client.query(NOTIFICATION_CENTER_TENANT_SQL);
    await client.query(
      "INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)",
      [FILENAME, cs],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
