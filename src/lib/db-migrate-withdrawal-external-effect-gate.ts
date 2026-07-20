import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0043_withdrawal_external_effect_gate.sql";

export const WITHDRAWAL_EXTERNAL_EFFECT_GATE_SQL = `
CREATE OR REPLACE FUNCTION tecpey_guard_withdrawal_external_effect_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  intent_row RECORD;
  attempt_row RECORD;
  prepared_fingerprint TEXT;
  expected_hash_fingerprint TEXT;
  execution_resource_id TEXT;
  attempt_resource_id TEXT;
  settlement_resource_id TEXT;
BEGIN
  IF OLD.state IS NOT DISTINCT FROM NEW.state
     AND OLD.raw_tx IS NOT DISTINCT FROM NEW.raw_tx
     AND OLD.tx_hash IS NOT DISTINCT FROM NEW.tx_hash THEN
    RETURN NEW;
  END IF;

  IF NEW.state = 'broadcasting'
     AND NEW.raw_tx IS NOT NULL
     AND NEW.tx_hash IS NOT NULL THEN
    prepared_fingerprint := encode(
      sha256(
        convert_to('tecpey:withdrawal-prepared-transaction:v1' || chr(31), 'UTF8')
        || NEW.raw_tx
      ),
      'hex'
    );
    expected_hash_fingerprint := tecpey_withdrawal_evidence_hash(
      'withdrawal-expected-transaction-hash', lower(NEW.tx_hash)
    );

    SELECT id, generation, prepared_tx_fingerprint,
           expected_tx_hash_fingerprint
      INTO intent_row
      FROM withdrawal_execution_intents
     WHERE withdrawal_id = NEW.id
       AND state = 'prepared'
     ORDER BY generation DESC
     LIMIT 1;

    IF NOT FOUND
       OR intent_row.prepared_tx_fingerprint IS DISTINCT FROM prepared_fingerprint
       OR intent_row.expected_tx_hash_fingerprint IS DISTINCT FROM expected_hash_fingerprint THEN
      RAISE EXCEPTION 'withdrawal prepared execution evidence is missing or mismatched';
    END IF;

    execution_resource_id := tecpey_withdrawal_evidence_hash(
      'withdrawal-execution', NEW.id || chr(31) || intent_row.generation::text
    );
    IF NOT EXISTS (
      SELECT 1
        FROM sensitive_mutation_audit_events
       WHERE tenant_id = 'tecpey'
         AND action = 'withdrawal.transaction.prepare'
         AND resource_type = 'withdrawal_execution'
         AND resource_id = execution_resource_id
         AND outcome = 'success'
         AND metadata->>'preparedTransactionFingerprint' = prepared_fingerprint
         AND metadata->>'expectedTransactionHashFingerprint' = expected_hash_fingerprint
    ) THEN
      RAISE EXCEPTION 'withdrawal transaction preparation evidence is missing';
    END IF;

    IF OLD.state = 'failed' AND EXISTS (
      SELECT 1
        FROM withdrawal_broadcast_attempts
       WHERE withdrawal_id = NEW.id
         AND state IN ('ambiguous', 'rejected', 'hash_mismatch', 'manual_review')
    ) THEN
      RAISE EXCEPTION 'withdrawal broadcast retry requires reconciliation authority';
    END IF;
  END IF;

  IF OLD.state = 'broadcasting' AND NEW.state = 'broadcasted' THEN
    expected_hash_fingerprint := tecpey_withdrawal_evidence_hash(
      'withdrawal-expected-transaction-hash', lower(NEW.tx_hash)
    );
    SELECT id, execution_generation, attempt_number, state,
           expected_tx_hash_fingerprint
      INTO attempt_row
      FROM withdrawal_broadcast_attempts
     WHERE withdrawal_id = NEW.id
       AND state IN ('accepted', 'already_known', 'reconciled_present')
     ORDER BY attempt_number DESC
     LIMIT 1;

    IF NOT FOUND
       OR attempt_row.expected_tx_hash_fingerprint IS DISTINCT FROM expected_hash_fingerprint THEN
      RAISE EXCEPTION 'withdrawal accepted broadcast attempt evidence is missing';
    END IF;

    attempt_resource_id := tecpey_withdrawal_evidence_hash(
      'withdrawal-broadcast-attempt',
      NEW.id || chr(31) || attempt_row.execution_generation::text
        || chr(31) || attempt_row.attempt_number::text
    );
    IF NOT EXISTS (
      SELECT 1
        FROM sensitive_mutation_audit_events
       WHERE tenant_id = 'tecpey'
         AND action = 'withdrawal.broadcast.accepted'
         AND resource_type = 'withdrawal_broadcast_attempt'
         AND resource_id = attempt_resource_id
         AND outcome = 'success'
         AND metadata->>'expectedTransactionHashFingerprint' = expected_hash_fingerprint
    ) THEN
      RAISE EXCEPTION 'withdrawal broadcast acceptance evidence is missing';
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM withdrawal_confirmation_outbox
       WHERE withdrawal_id = NEW.id
         AND expected_tx_hash_fingerprint = expected_hash_fingerprint
         AND state IN ('pending', 'published', 'claimed', 'completed', 'dead_letter')
    ) THEN
      RAISE EXCEPTION 'withdrawal confirmation projection evidence is missing';
    END IF;
  END IF;

  IF OLD.state = 'broadcasted' AND NEW.state = 'confirming' THEN
    expected_hash_fingerprint := tecpey_withdrawal_evidence_hash(
      'withdrawal-expected-transaction-hash', lower(NEW.tx_hash)
    );
    IF NOT EXISTS (
      SELECT 1
        FROM withdrawal_confirmation_outbox
       WHERE withdrawal_id = NEW.id
         AND expected_tx_hash_fingerprint = expected_hash_fingerprint
         AND state IN ('published', 'claimed', 'completed')
    ) THEN
      RAISE EXCEPTION 'withdrawal confirmation publication evidence is missing';
    END IF;
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
      RAISE EXCEPTION 'withdrawal confirmation monitor evidence is missing';
    END IF;
  END IF;

  IF OLD.state = 'broadcasting' AND NEW.state = 'failed' THEN
    SELECT id, execution_generation, attempt_number, state
      INTO attempt_row
      FROM withdrawal_broadcast_attempts
     WHERE withdrawal_id = NEW.id
       AND state IN ('rejected', 'hash_mismatch', 'manual_review')
     ORDER BY attempt_number DESC
     LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'withdrawal broadcast rejection evidence is missing';
    END IF;
    attempt_resource_id := tecpey_withdrawal_evidence_hash(
      'withdrawal-broadcast-attempt',
      NEW.id || chr(31) || attempt_row.execution_generation::text
        || chr(31) || attempt_row.attempt_number::text
    );
    IF NOT EXISTS (
      SELECT 1
        FROM sensitive_mutation_audit_events
       WHERE tenant_id = 'tecpey'
         AND action IN (
           'withdrawal.broadcast.rejected',
           'withdrawal.broadcast.hash_mismatch'
         )
         AND resource_type = 'withdrawal_broadcast_attempt'
         AND resource_id = attempt_resource_id
         AND outcome IN ('rejected', 'failed')
    ) THEN
      RAISE EXCEPTION 'withdrawal broadcast failure evidence is missing';
    END IF;
  END IF;

  IF OLD.state IN ('broadcasted', 'confirming')
     AND NEW.state IN ('failed', 'timeout') THEN
    execution_resource_id := tecpey_withdrawal_evidence_hash(
      'withdrawal-execution', NEW.id
    );
    IF NOT EXISTS (
      SELECT 1
        FROM sensitive_mutation_audit_events
       WHERE tenant_id = 'tecpey'
         AND action = CASE
           WHEN NEW.state = 'failed' THEN 'withdrawal.confirmation.dropped'
           ELSE 'withdrawal.confirmation.timeout'
         END
         AND resource_type = 'withdrawal_execution'
         AND resource_id = execution_resource_id
    ) THEN
      RAISE EXCEPTION 'withdrawal confirmation terminal evidence is missing';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM withdrawal_confirmation_outbox
       WHERE withdrawal_id = NEW.id
         AND state <> 'completed'
    ) THEN
      RAISE EXCEPTION 'withdrawal confirmation outbox is not completed';
    END IF;
  END IF;

  IF NEW.state = 'completed' AND OLD.state IS DISTINCT FROM 'completed' THEN
    expected_hash_fingerprint := tecpey_withdrawal_evidence_hash(
      'withdrawal-expected-transaction-hash', lower(NEW.tx_hash)
    );
    settlement_resource_id := tecpey_withdrawal_evidence_hash(
      'withdrawal-settlement', NEW.id || chr(31) || lower(NEW.tx_hash)
    );
    IF NEW.funds_reserved_at IS NOT NULL THEN
      RAISE EXCEPTION 'withdrawal settlement did not clear reservation evidence';
    END IF;
    IF NOT EXISTS (
      SELECT 1
        FROM wallet_ledger
       WHERE wallet_id = NEW.user_id
         AND reference_type = 'withdrawal'
         AND reference_id = NEW.id
         AND type = 'withdraw'
         AND amount = NEW.amount
    ) THEN
      RAISE EXCEPTION 'withdrawal settlement ledger evidence is missing';
    END IF;
    IF NOT EXISTS (
      SELECT 1
        FROM sensitive_mutation_audit_events
       WHERE tenant_id = 'tecpey'
         AND action = 'withdrawal.settle'
         AND resource_type = 'withdrawal_settlement'
         AND resource_id = settlement_resource_id
         AND outcome = 'success'
         AND metadata->>'expectedTransactionHashFingerprint' = expected_hash_fingerprint
         AND metadata->>'finalState' = 'completed'
    ) THEN
      RAISE EXCEPTION 'withdrawal settlement mandatory evidence is missing';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM withdrawal_confirmation_outbox
       WHERE withdrawal_id = NEW.id
         AND state <> 'completed'
    ) THEN
      RAISE EXCEPTION 'withdrawal settlement confirmation outbox is not completed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawals_external_effect_transition_gate
  ON withdrawals;
CREATE CONSTRAINT TRIGGER withdrawals_external_effect_transition_gate
  AFTER UPDATE ON withdrawals
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (
    OLD.state IS DISTINCT FROM NEW.state
    OR OLD.raw_tx IS DISTINCT FROM NEW.raw_tx
    OR OLD.tx_hash IS DISTINCT FROM NEW.tx_hash
  )
  EXECUTE FUNCTION tecpey_guard_withdrawal_external_effect_transition();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runWithdrawalExternalEffectGateMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(WITHDRAWAL_EXTERNAL_EFFECT_GATE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-withdrawal-external-effect-gate] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-withdrawal-external-effect-gate] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(WITHDRAWAL_EXTERNAL_EFFECT_GATE_SQL);
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
