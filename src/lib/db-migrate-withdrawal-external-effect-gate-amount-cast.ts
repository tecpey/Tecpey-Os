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
  patched_definition := current_definition;

  IF position('AND amount = NEW.amount::numeric' IN patched_definition) = 0 THEN
    IF position('AND amount = NEW.amount' IN patched_definition) = 0 THEN
      RAISE EXCEPTION
        'withdrawal external-effect gate amount comparison patch target is missing';
    END IF;

    patched_definition := replace(
      patched_definition,
      'AND amount = NEW.amount',
      'AND amount = NEW.amount::numeric'
    );
  END IF;

  IF position(
    'withdrawal confirmation monitor authority is missing'
    IN patched_definition
  ) = 0 THEN
    IF position(
      $patch$  IF OLD.state IN ('broadcasted', 'confirming')
     AND NEW.state IN ('failed', 'timeout') THEN$patch$
      IN patched_definition
    ) = 0 THEN
      RAISE EXCEPTION
        'withdrawal confirmation terminal-state patch target is missing';
    END IF;

    patched_definition := replace(
      patched_definition,
      $patch$  IF OLD.state IN ('broadcasted', 'confirming')
     AND NEW.state IN ('failed', 'timeout') THEN$patch$,
      $patch$  IF OLD.state IN ('broadcasted', 'confirming')
     AND NEW.state IN ('failed', 'timeout') THEN
    IF OLD.state <> 'confirming' THEN
      RAISE EXCEPTION 'withdrawal confirmation monitor authority is missing';
    END IF;
    expected_hash_fingerprint := tecpey_withdrawal_evidence_hash(
      'withdrawal-expected-transaction-hash', lower(NEW.tx_hash)
    );
    execution_resource_id := tecpey_withdrawal_evidence_hash(
      'withdrawal-execution', NEW.id
    );
    IF NOT EXISTS (
      SELECT 1
        FROM sensitive_mutation_audit_events
       WHERE tenant_id = 'tecpey'
         AND action = 'withdrawal.confirmation.monitor'
         AND resource_type = 'withdrawal_execution'
         AND resource_id = execution_resource_id
         AND outcome = 'success'
         AND metadata->>'expectedTransactionHashFingerprint' = expected_hash_fingerprint
    ) THEN
      RAISE EXCEPTION 'withdrawal confirmation monitor authority is missing';
    END IF;$patch$
    );

    IF position(
      $patch$  IF NEW.state = 'completed' AND OLD.state IS DISTINCT FROM 'completed' THEN$patch$
      IN patched_definition
    ) = 0 THEN
      RAISE EXCEPTION
        'withdrawal completion-state patch target is missing';
    END IF;

    patched_definition := replace(
      patched_definition,
      $patch$  IF NEW.state = 'completed' AND OLD.state IS DISTINCT FROM 'completed' THEN$patch$,
      $patch$  IF NEW.state = 'completed' AND OLD.state IS DISTINCT FROM 'completed' THEN
    IF OLD.state <> 'confirming' THEN
      RAISE EXCEPTION 'withdrawal confirmation monitor authority is missing';
    END IF;
    expected_hash_fingerprint := tecpey_withdrawal_evidence_hash(
      'withdrawal-expected-transaction-hash', lower(NEW.tx_hash)
    );
    execution_resource_id := tecpey_withdrawal_evidence_hash(
      'withdrawal-execution', NEW.id
    );
    IF NOT EXISTS (
      SELECT 1
        FROM sensitive_mutation_audit_events
       WHERE tenant_id = 'tecpey'
         AND action = 'withdrawal.confirmation.monitor'
         AND resource_type = 'withdrawal_execution'
         AND resource_id = execution_resource_id
         AND outcome = 'success'
         AND metadata->>'expectedTransactionHashFingerprint' = expected_hash_fingerprint
    ) THEN
      RAISE EXCEPTION 'withdrawal confirmation monitor authority is missing';
    END IF;$patch$
    );
  END IF;

  IF patched_definition IS DISTINCT FROM current_definition THEN
    EXECUTE patched_definition;
  END IF;
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
