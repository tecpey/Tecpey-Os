import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0041_withdrawal_prebroadcast_transition_gate.sql";

export const WITHDRAWAL_PREBROADCAST_TRANSITION_GATE_SQL = `
CREATE OR REPLACE FUNCTION tecpey_require_withdrawal_prebroadcast_transition_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_action TEXT;
  admin_action RECORD;
  release_amount NUMERIC(38,18);
BEGIN
  IF OLD.state IS NOT DISTINCT FROM NEW.state THEN
    RETURN NEW;
  END IF;

  expected_action := CASE NEW.state
    WHEN 'approved' THEN 'approve'
    WHEN 'rejected' THEN 'reject'
    WHEN 'blocked' THEN 'block'
    WHEN 'compliance_review' THEN 'flag_review'
    ELSE NULL
  END;
  IF expected_action IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, admin_id, metadata
    INTO admin_action
    FROM withdrawal_admin_actions
   WHERE withdrawal_id = NEW.id
     AND action = expected_action
   ORDER BY created_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal pre-broadcast transition authority is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM api_command_receipts receipt
     WHERE receipt.tenant_id = 'tecpey'
       AND receipt.principal_type = 'admin'
       AND receipt.principal_id = admin_action.admin_id
       AND receipt.operation = 'withdrawal.admin_action'
       AND receipt.status = 'completed'
       AND receipt.response_body->>'withdrawalId' = NEW.id
       AND receipt.response_body->>'state' = NEW.state
       AND receipt.response_body->>'userId' = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'withdrawal pre-broadcast transition receipt is missing';
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO release_amount
    FROM wallet_ledger
   WHERE wallet_id = NEW.user_id
     AND reference_type = 'withdrawal'
     AND reference_id = NEW.id
     AND type = 'release';

  IF NEW.state = 'approved' THEN
    IF NEW.funds_reserved_at IS NULL THEN
      RAISE EXCEPTION 'approved withdrawal reservation authority is missing';
    END IF;
  ELSIF NEW.state IN ('rejected', 'blocked') THEN
    IF NEW.funds_reserved_at IS NOT NULL THEN
      RAISE EXCEPTION 'terminal withdrawal retains reservation authority';
    END IF;
    IF OLD.funds_reserved_at IS NOT NULL
       AND release_amount <> NEW.amount::numeric THEN
      RAISE EXCEPTION 'terminal withdrawal release authority is incomplete';
    END IF;
    IF OLD.funds_reserved_at IS NULL AND release_amount <> 0 THEN
      RAISE EXCEPTION 'unreserved terminal withdrawal released funds';
    END IF;
  ELSIF NEW.state = 'compliance_review' THEN
    IF NEW.funds_reserved_at IS DISTINCT FROM OLD.funds_reserved_at THEN
      RAISE EXCEPTION 'review transition changed reservation authority';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_prebroadcast_transition_authority
  ON withdrawals;
CREATE CONSTRAINT TRIGGER withdrawal_prebroadcast_transition_authority
  AFTER UPDATE OF state ON withdrawals
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (
    OLD.state IS DISTINCT FROM NEW.state
    AND NEW.state IN ('approved', 'rejected', 'blocked', 'compliance_review')
  )
  EXECUTE FUNCTION tecpey_require_withdrawal_prebroadcast_transition_authority();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runWithdrawalPrebroadcastTransitionGateMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(WITHDRAWAL_PREBROADCAST_TRANSITION_GATE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-withdrawal-prebroadcast-transition-gate] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-withdrawal-prebroadcast-transition-gate] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(WITHDRAWAL_PREBROADCAST_TRANSITION_GATE_SQL);
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
