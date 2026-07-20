import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0040_withdrawal_admin_evidence_hardening.sql";

export const WITHDRAWAL_ADMIN_EVIDENCE_HARDENING_SQL = `
CREATE OR REPLACE FUNCTION tecpey_append_withdrawal_admin_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  withdrawal_row RECORD;
  receipt RECORD;
  expected_state TEXT;
  evidence_action TEXT;
  released_amount NUMERIC(38,18);
  correlation_identity TEXT;
  step_up_seconds INTEGER;
BEGIN
  expected_state := CASE NEW.action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    WHEN 'block' THEN 'blocked'
    WHEN 'flag_review' THEN 'compliance_review'
    ELSE NULL
  END;
  evidence_action := CASE NEW.action
    WHEN 'approve' THEN 'withdrawal.admin.approve'
    WHEN 'reject' THEN 'withdrawal.admin.reject'
    WHEN 'block' THEN 'withdrawal.admin.block'
    WHEN 'flag_review' THEN 'withdrawal.admin.flag_review'
    ELSE NULL
  END;
  IF expected_state IS NULL THEN
    RAISE EXCEPTION 'unsupported withdrawal admin action';
  END IF;

  SELECT user_id, asset, amount::numeric AS amount, network, destination_address,
         destination_tag, state, request_hash, funds_reserved_at
    INTO withdrawal_row
    FROM withdrawals
   WHERE id = NEW.withdrawal_id
   FOR SHARE;
  IF NOT FOUND OR withdrawal_row.state <> expected_state THEN
    RAISE EXCEPTION 'withdrawal admin transition state evidence is mismatched';
  END IF;

  SELECT request_hash, idempotency_key
    INTO receipt
    FROM api_command_receipts
   WHERE tenant_id = 'tecpey'
     AND principal_type = 'admin'
     AND principal_id = NEW.admin_id
     AND operation = 'withdrawal.admin_action'
     AND status = 'completed'
     AND response_body->>'withdrawalId' = NEW.withdrawal_id
     AND response_body->>'state' = expected_state
     AND response_body->>'userId' = withdrawal_row.user_id
   ORDER BY completed_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal admin receipt evidence is missing';
  END IF;

  IF COALESCE(NEW.metadata->>'permission', '') = ''
     OR COALESCE(NEW.metadata->>'roleSetFingerprint', '') !~ '^[0-9a-f]{64}$'
     OR COALESCE(NEW.metadata->>'sessionEvidenceFingerprint', '') !~ '^[0-9a-f]{64}$'
     OR COALESCE(NEW.metadata->>'stepUpWithinSeconds', '') !~ '^[0-9]{1,4}$' THEN
    RAISE EXCEPTION 'withdrawal admin authorization evidence is incomplete';
  END IF;
  step_up_seconds := (NEW.metadata->>'stepUpWithinSeconds')::integer;
  IF step_up_seconds <= 0 OR step_up_seconds > 900 THEN
    RAISE EXCEPTION 'withdrawal admin step-up evidence is invalid';
  END IF;
  IF NEW.action <> 'approve'
     AND COALESCE(NEW.metadata->>'reviewReasonFingerprint', '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'withdrawal admin review reason evidence is incomplete';
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO released_amount
    FROM wallet_ledger
   WHERE wallet_id = withdrawal_row.user_id
     AND reference_type = 'withdrawal'
     AND reference_id = NEW.withdrawal_id
     AND type = 'release';

  IF NEW.action IN ('reject', 'block')
     AND released_amount NOT IN (0, withdrawal_row.amount) THEN
    RAISE EXCEPTION 'withdrawal admin release evidence is incomplete';
  END IF;
  IF NEW.action IN ('reject', 'block')
     AND withdrawal_row.funds_reserved_at IS NOT NULL THEN
    RAISE EXCEPTION 'withdrawal admin terminal state retains reservation authority';
  END IF;

  correlation_identity := receipt.request_hash || ':' || NEW.id || ':' || NEW.action;
  PERFORM tecpey_insert_withdrawal_evidence(
    'tecpey',
    'admin',
    NEW.admin_id,
    evidence_action,
    'withdrawal_admin_transition',
    tecpey_withdrawal_evidence_hash('withdrawal', NEW.withdrawal_id),
    'success',
    'withdrawal-admin-' || replace(NEW.action, '_', '-') || ':' ||
      tecpey_withdrawal_evidence_hash(
        'withdrawal-evidence-admin-' || replace(NEW.action, '_', '-'),
        correlation_identity
      ),
    receipt.request_hash,
    jsonb_build_object(
      'policyVersion', 'withdrawal-prebroadcast-evidence-v1',
      'permission', NEW.metadata->>'permission',
      'stepUpWithinSeconds', step_up_seconds,
      'roleSetFingerprint', NEW.metadata->>'roleSetFingerprint',
      'sessionEvidenceFingerprint', NEW.metadata->>'sessionEvidenceFingerprint',
      'reviewReasonFingerprint', NEW.metadata->>'reviewReasonFingerprint',
      'receiptFingerprint', tecpey_withdrawal_evidence_hash(
        'withdrawal-command-receipt', receipt.idempotency_key
      ),
      'requestFingerprint', tecpey_withdrawal_evidence_hash(
        'withdrawal-request', COALESCE(withdrawal_row.request_hash, receipt.request_hash)
      ),
      'destinationFingerprint', tecpey_withdrawal_evidence_hash(
        'withdrawal-destination',
        lower(withdrawal_row.network) || chr(31) ||
          withdrawal_row.destination_address || chr(31) ||
          COALESCE(withdrawal_row.destination_tag, '')
      ),
      'adminAction', NEW.action,
      'finalState', expected_state,
      'asset', withdrawal_row.asset,
      'amount', withdrawal_row.amount::text,
      'releasedAmount', released_amount::text,
      'fundsReservedAfter', withdrawal_row.funds_reserved_at IS NOT NULL
    )
  );
  RETURN NEW;
END;
$$;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runWithdrawalAdminEvidenceHardeningMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(WITHDRAWAL_ADMIN_EVIDENCE_HARDENING_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-withdrawal-admin-evidence-hardening] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-withdrawal-admin-evidence-hardening] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(WITHDRAWAL_ADMIN_EVIDENCE_HARDENING_SQL);
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
