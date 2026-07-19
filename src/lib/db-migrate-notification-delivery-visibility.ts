import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0022_notification_delivery_visibility.sql";

export const NOTIFICATION_DELIVERY_VISIBILITY_SQL = `
CREATE OR REPLACE FUNCTION tecpey_publish_accepted_in_app_notification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.channel = 'in_app'
     AND NEW.status = 'provider_accepted'
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE platform_notifications
       SET delivered_at = COALESCE(delivered_at, NOW()),
           scheduled_for = LEAST(scheduled_for, NOW()),
           updated_at = NOW()
     WHERE id = NEW.notification_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'accepted in-app outbox has no notification'
        USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_outbox_publish_in_app ON notification_outbox;
CREATE TRIGGER notification_outbox_publish_in_app
  AFTER UPDATE OF status ON notification_outbox
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_publish_accepted_in_app_notification();

UPDATE platform_notifications n
   SET delivered_at = COALESCE(n.delivered_at, o.terminal_at, o.updated_at),
       scheduled_for = LEAST(n.scheduled_for, COALESCE(o.terminal_at, o.updated_at)),
       updated_at = NOW()
  FROM notification_outbox o
 WHERE o.notification_id = n.id
   AND o.channel = 'in_app'
   AND o.status = 'provider_accepted'
   AND n.delivered_at IS NULL;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runNotificationDeliveryVisibilityMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(NOTIFICATION_DELIVERY_VISIBILITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    `SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1`,
    [FILENAME],
  );

  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-notification-delivery-visibility] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-notification-delivery-visibility] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(NOTIFICATION_DELIVERY_VISIBILITY_SQL);
    await client.query(
      `INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)`,
      [FILENAME, cs],
    );
    await client.query("COMMIT");
    logger.info("[db-migrate-notification-delivery-visibility] migration applied", {
      filename: FILENAME,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
