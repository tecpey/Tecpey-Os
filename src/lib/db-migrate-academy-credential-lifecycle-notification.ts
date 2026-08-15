import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0081_academy_credential_lifecycle_notification.sql";

export const ACADEMY_CREDENTIAL_LIFECYCLE_NOTIFICATION_SQL = `
ALTER TABLE notification_domain_outbox
  DROP CONSTRAINT notification_domain_outbox_event_type_check;
ALTER TABLE notification_domain_outbox
  ADD CONSTRAINT notification_domain_outbox_event_type_check CHECK (event_type IN (
    'academy.lesson_available',
    'academy.assessment_completed',
    'academy.certificate_issued',
    'academy.credential_issued',
    'academy.credential_lifecycle_changed',
    'security.new_login',
    'security.credential_changed',
    'security.session_revoked',
    'support.ticket_status_changed'
  ));
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runAcademyCredentialLifecycleNotificationMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(ACADEMY_CREDENTIAL_LIFECYCLE_NOTIFICATION_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) throw new Error(`[db-migrate-academy-credential-lifecycle-notification] checksum mismatch for ${FILENAME}`);
    return;
  }
  logger.info("[db-migrate-academy-credential-lifecycle-notification] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_CREDENTIAL_LIFECYCLE_NOTIFICATION_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
