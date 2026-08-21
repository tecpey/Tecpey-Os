import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0086_notification_suppress_decision.sql";

// platform_notifications.policy_decision was created admitting only
// ('allow', 'defer', 'digest', 'escalate'), while notification_intents — written
// by the governed creation path — already admits 'suppress'. The two tables
// therefore disagreed about the vocabulary of the same decision.
//
// That gap became load-bearing when the legacy drain started withholding
// marketing campaigns from principals without consent. The governed policy
// returns `suppress` with reason `marketing_consent_required`, but the drain
// could not record it, so it recorded `defer` instead. A deferred notification
// reads as "will be delivered later" while a suppressed one reads as "withheld
// by policy" — the same reason string carrying two different meanings depending
// on which table you read. An audit trail that has to be interpreted is not one.
//
// Widen the constraint so the inbox can record the decision the policy actually
// made. Nothing is relaxed: 'suppress' is added, no existing value is removed,
// and the drop is IF EXISTS so re-running the plan is safe.
export const NOTIFICATION_SUPPRESS_DECISION_SQL = `
ALTER TABLE platform_notifications
  DROP CONSTRAINT IF EXISTS platform_notifications_policy_decision_check;
ALTER TABLE platform_notifications
  ADD CONSTRAINT platform_notifications_policy_decision_check
  CHECK (policy_decision IN ('allow', 'defer', 'digest', 'suppress', 'escalate'));

-- Hold the vocabulary as an invariant, not as a one-time cleanup.
--
-- A backfill alone would leave a window: the deployment contract runs migration
-- before starting the new runtime, so an older process can still be serving when
-- the UPDATE below commits. It would write 'defer' with this reason, the widened
-- constraint would happily admit it, and that row would never be repaired. The
-- same reappears on a rollback to a previous image, or from any future caller
-- that has not been taught the new vocabulary.
--
-- Normalising on write closes all of those at once, and does it without turning
-- a recording divergence into an outage: an older runtime's insert still
-- succeeds, it is simply stored under the decision the policy actually made.
-- Rejecting the pairing instead would fail those requests outright.
CREATE OR REPLACE FUNCTION tecpey_normalize_withheld_notification_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.policy_reason = 'marketing_consent_required'
     AND NEW.policy_decision = 'defer' THEN
    NEW.policy_decision := 'suppress';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_notifications_normalize_withheld_decision
  ON platform_notifications;
CREATE TRIGGER platform_notifications_normalize_withheld_decision
  BEFORE INSERT OR UPDATE OF policy_decision, policy_reason
  ON platform_notifications
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_normalize_withheld_notification_decision();

-- Re-label rows already written as 'defer' before 'suppress' existed. The reason
-- string identifies them exactly, and no other code path writes that pairing, so
-- this cannot capture a genuinely deferred row.
UPDATE platform_notifications
   SET policy_decision = 'suppress',
       updated_at = NOW()
 WHERE policy_decision = 'defer'
   AND policy_reason = 'marketing_consent_required';
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runNotificationSuppressDecisionMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(NOTIFICATION_SUPPRESS_DECISION_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-notification-suppress-decision] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-notification-suppress-decision] applying migration", {
    filename: FILENAME,
    checksum: cs,
  });
  await client.query("BEGIN");
  try {
    await client.query(NOTIFICATION_SUPPRESS_DECISION_SQL);
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
