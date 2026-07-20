import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0044_withdrawal_external_effect_gate_amount_cast.sql";

export const WITHDRAWAL_EXTERNAL_EFFECT_GATE_AMOUNT_CAST_SQL = `
DO $$
DECLARE
  current_definition TEXT;
  patched_definition TEXT;
BEGIN
  current_definition := pg_get_functiondef(
    'tecpey_guard_withdrawal_external_effect_transition()'::regprocedure
  );

  IF position('AND amount = NEW.amount::numeric' IN current_definition) > 0 THEN
    RETURN;
  END IF;

  IF position('AND amount = NEW.amount' IN current_definition) = 0 THEN
    RAISE EXCEPTION
      'withdrawal external-effect gate amount comparison patch target is missing';
  END IF;

  patched_definition := replace(
    current_definition,
    'AND amount = NEW.amount',
    'AND amount = NEW.amount::numeric'
  );

  EXECUTE patched_definition;
END;
$$;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runWithdrawalExternalEffectGateAmountCastMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(WITHDRAWAL_EXTERNAL_EFFECT_GATE_AMOUNT_CAST_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-withdrawal-external-effect-gate-amount-cast] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info(
    "[db-migrate-withdrawal-external-effect-gate-amount-cast] applying migration",
    { filename: FILENAME },
  );
  await client.query("BEGIN");
  try {
    await client.query(WITHDRAWAL_EXTERNAL_EFFECT_GATE_AMOUNT_CAST_SQL);
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
