import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0031_withdrawal_settlement_authority.sql";

export const WITHDRAWAL_SETTLEMENT_AUTHORITY_SQL = `
CREATE OR REPLACE FUNCTION tecpey_clear_terminal_withdrawal_reservation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state IN ('completed', 'rejected', 'blocked', 'cancelled') THEN
    NEW.funds_reserved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawals_clear_terminal_reservation ON withdrawals;
CREATE TRIGGER withdrawals_clear_terminal_reservation
  BEFORE UPDATE OF state ON withdrawals
  FOR EACH ROW
  WHEN (NEW.state IS DISTINCT FROM OLD.state)
  EXECUTE FUNCTION tecpey_clear_terminal_withdrawal_reservation();

ALTER TABLE withdrawals
  DROP CONSTRAINT IF EXISTS withdrawals_terminal_reservation_cleared;
ALTER TABLE withdrawals
  ADD CONSTRAINT withdrawals_terminal_reservation_cleared
  CHECK (
    state NOT IN ('completed', 'rejected', 'blocked', 'cancelled')
    OR funds_reserved_at IS NULL
  )
  NOT VALID;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runWithdrawalSettlementMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(WITHDRAWAL_SETTLEMENT_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-withdrawal-settlement] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-withdrawal-settlement] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(WITHDRAWAL_SETTLEMENT_AUTHORITY_SQL);
    await client.query(
      "INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)",
      [FILENAME, cs],
    );
    await client.query("COMMIT");
    logger.info("[db-migrate-withdrawal-settlement] migration applied", {
      filename: FILENAME,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
