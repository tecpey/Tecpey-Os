import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0039_withdrawal_prebroadcast_evidence.sql";

export const WITHDRAWAL_PREBROADCAST_EVIDENCE_SQL = `
CREATE OR REPLACE FUNCTION tecpey_sensitive_audit_has_forbidden_key(document JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  object_entry RECORD;
  array_item JSONB;
BEGIN
  IF jsonb_typeof(document) = 'object' THEN
    FOR object_entry IN
      SELECT object_item.key, object_item.value
        FROM jsonb_each(document) AS object_item(key, value)
    LOOP
      IF lower(object_entry.key) = ANY(ARRAY[
        'token', 'device_token', 'content', 'message', 'messages',
        'conversation', 'conversations', 'secret', 'password',
        'email', 'phone', 'raw', 'body', 'authorization', 'cookie',
        'public_key', 'publickey', 'signature', 'challenge',
        'clientdatajson', 'authenticatordata', 'attestationobject',
        'userhandle', 'credentialid', 'credential_id', 'rawid', 'raw_id',
        'ip', 'useragent', 'user_agent', 'deviceinfo', 'device_info',
        'access_token', 'accesstoken', 'refresh_token', 'refreshtoken',
        'jti', 'sessionid', 'session_id', 'familyid', 'family_id',
        'orderid', 'order_id', 'tradeid', 'trade_id', 'walletid', 'wallet_id',
        'withdrawalid', 'withdrawal_id', 'authorizationid', 'authorization_id',
        'destinationaddress', 'destination_address', 'destinationtag',
        'destination_tag', 'reviewnotes', 'review_notes', 'notes'
      ]) THEN
        RETURN TRUE;
      END IF;
      IF tecpey_sensitive_audit_has_forbidden_key(object_entry.value) THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(document) = 'array' THEN
    FOR array_item IN
      SELECT array_element.value
        FROM jsonb_array_elements(document) AS array_element(value)
    LOOP
      IF tecpey_sensitive_audit_has_forbidden_key(array_item) THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  END IF;
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION tecpey_withdrawal_evidence_hash(domain_name TEXT, value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(
    sha256(
      convert_to(
        'tecpey:' || domain_name || ':v1' || chr(31) || COALESCE(value, ''),
        'UTF8'
      )
    ),
    'hex'
  );
$$;

CREATE OR REPLACE FUNCTION tecpey_insert_withdrawal_evidence(
  p_tenant_id TEXT,
  p_actor_type TEXT,
  p_actor_id TEXT,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id TEXT,
  p_outcome TEXT,
  p_correlation_id TEXT,
  p_request_hash TEXT,
  p_metadata JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  inserted_id UUID;
  existing RECORD;
BEGIN
  INSERT INTO sensitive_mutation_audit_events
    (tenant_id, actor_type, actor_id, action, resource_type, resource_id,
     outcome, correlation_id, request_hash, metadata)
  VALUES
    (p_tenant_id, p_actor_type, p_actor_id, p_action, p_resource_type,
     p_resource_id, p_outcome, p_correlation_id, p_request_hash, p_metadata)
  ON CONFLICT (tenant_id, action, correlation_id) DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT actor_type, actor_id, resource_type, resource_id, outcome,
         request_hash, metadata
    INTO existing
    FROM sensitive_mutation_audit_events
   WHERE tenant_id = p_tenant_id
     AND action = p_action
     AND correlation_id = p_correlation_id
   LIMIT 1;

  IF existing.actor_type IS DISTINCT FROM p_actor_type
     OR existing.actor_id IS DISTINCT FROM p_actor_id
     OR existing.resource_type IS DISTINCT FROM p_resource_type
     OR existing.resource_id IS DISTINCT FROM p_resource_id
     OR existing.outcome IS DISTINCT FROM p_outcome
     OR existing.request_hash IS DISTINCT FROM p_request_hash
     OR existing.metadata IS DISTINCT FROM p_metadata THEN
    RAISE EXCEPTION 'sensitive_audit_correlation_conflict';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION tecpey_append_withdrawal_admission_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  evidence_action TEXT;
  evidence_outcome TEXT;
  expected_event_type TEXT;
  authorization_row RECORD;
  hold_amount NUMERIC(38,18);
  release_amount NUMERIC(38,18);
  destination_fingerprint TEXT;
  correlation_identity TEXT;
BEGIN
  IF NEW.admission_completed_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.request_hash IS NULL
     OR NEW.authorization_id IS NULL
     OR NEW.admission_policy_version IS NULL
     OR NEW.compliance_policy_version IS NULL THEN
    RAISE EXCEPTION 'withdrawal admission authority is incomplete';
  END IF;

  SELECT id, consumed_at, policy_version
    INTO authorization_row
    FROM withdrawal_authorizations
   WHERE id = NEW.authorization_id
     AND user_id = NEW.user_id
     AND request_hash = NEW.request_hash
   FOR SHARE;
  IF NOT FOUND OR authorization_row.consumed_at IS NULL THEN
    RAISE EXCEPTION 'withdrawal admission authorization evidence is missing';
  END IF;

  evidence_action := CASE NEW.state
    WHEN 'approved' THEN 'withdrawal.admit'
    WHEN 'blocked' THEN 'withdrawal.block'
    WHEN 'compliance_review' THEN 'withdrawal.review'
    ELSE NULL
  END;
  evidence_outcome := CASE WHEN NEW.state = 'blocked' THEN 'rejected' ELSE 'success' END;
  expected_event_type := CASE NEW.state
    WHEN 'approved' THEN 'withdrawal_admitted'
    WHEN 'blocked' THEN 'withdrawal_blocked'
    WHEN 'compliance_review' THEN 'compliance_review_required'
    ELSE NULL
  END;
  IF evidence_action IS NULL THEN
    RAISE EXCEPTION 'withdrawal admission state is not evidence-governed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM withdrawal_admission_outbox outbox
     WHERE outbox.withdrawal_id = NEW.id
       AND outbox.event_type = expected_event_type
  ) THEN
    RAISE EXCEPTION 'withdrawal admission outbox evidence is missing';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN type = 'hold' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'release' THEN amount ELSE 0 END), 0)
    INTO hold_amount, release_amount
    FROM wallet_ledger
   WHERE wallet_id = NEW.user_id
     AND reference_type = 'withdrawal'
     AND reference_id = NEW.id;

  IF NEW.state = 'blocked' THEN
    IF NEW.funds_reserved_at IS NOT NULL OR hold_amount <> 0 OR release_amount <> 0 THEN
      RAISE EXCEPTION 'blocked withdrawal must not retain reservation authority';
    END IF;
  ELSE
    IF NEW.funds_reserved_at IS NULL
       OR hold_amount <> NEW.amount::numeric
       OR release_amount <> 0 THEN
      RAISE EXCEPTION 'withdrawal admission hold evidence is incomplete';
    END IF;
  END IF;

  destination_fingerprint := tecpey_withdrawal_evidence_hash(
    'withdrawal-destination',
    lower(NEW.network) || chr(31) || NEW.destination_address || chr(31) ||
      COALESCE(NEW.destination_tag, '')
  );
  correlation_identity := NEW.request_hash || ':' || NEW.id || ':' || NEW.state;

  PERFORM tecpey_insert_withdrawal_evidence(
    'tecpey',
    'user',
    NEW.user_id,
    evidence_action,
    'withdrawal_request',
    tecpey_withdrawal_evidence_hash('withdrawal', NEW.id),
    evidence_outcome,
    'withdrawal-' || replace(substring(evidence_action from 12), '.', '-') || ':' ||
      tecpey_withdrawal_evidence_hash(
        'withdrawal-evidence-' || replace(substring(evidence_action from 12), '.', '-'),
        correlation_identity
      ),
    NEW.request_hash,
    jsonb_build_object(
      'policyVersion', 'withdrawal-prebroadcast-evidence-v1',
      'admissionPolicyVersion', NEW.admission_policy_version,
      'compliancePolicyVersion', NEW.compliance_policy_version,
      'authorizationPolicyVersion', authorization_row.policy_version,
      'requestFingerprint', tecpey_withdrawal_evidence_hash(
        'withdrawal-request', NEW.request_hash
      ),
      'authorizationFingerprint', tecpey_withdrawal_evidence_hash(
        'withdrawal-authorization', NEW.authorization_id::text
      ),
      'destinationFingerprint', destination_fingerprint,
      'priceSnapshotFingerprint', tecpey_withdrawal_evidence_hash(
        'withdrawal-price-snapshot', NEW.price_snapshot_id::text
      ),
      'decisionReasonFingerprint', tecpey_withdrawal_evidence_hash(
        'withdrawal-decision-reason',
        COALESCE(NEW.compliance_evidence->>'reason', NEW.state)
      ),
      'asset', NEW.asset,
      'network', lower(NEW.network),
      'amount', NEW.amount::numeric::text,
      'amountUsd', NEW.amount_usd::numeric::text,
      'priceUsd', NEW.price_usd::numeric::text,
      'finalState', NEW.state,
      'fundsReserved', NEW.funds_reserved_at IS NOT NULL,
      'holdAmount', hold_amount::text,
      'kycStatus', COALESCE(NEW.kyc_status, 'unknown'),
      'amlRisk', COALESCE(NEW.aml_risk, 'unknown'),
      'sanctionsHit', NEW.sanctions_hit
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_admission_mandatory_evidence ON withdrawals;
CREATE CONSTRAINT TRIGGER withdrawal_admission_mandatory_evidence
  AFTER INSERT ON withdrawals
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.admission_completed_at IS NOT NULL)
  EXECUTE FUNCTION tecpey_append_withdrawal_admission_evidence();

CREATE OR REPLACE FUNCTION tecpey_append_withdrawal_cancel_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  receipt RECORD;
  hold_amount NUMERIC(38,18);
  release_amount NUMERIC(38,18);
  correlation_identity TEXT;
BEGIN
  SELECT request_hash, idempotency_key
    INTO receipt
    FROM api_command_receipts
   WHERE tenant_id = 'tecpey'
     AND principal_type = 'user'
     AND principal_id = NEW.user_id
     AND operation = 'withdrawal.cancel'
     AND status = 'completed'
     AND response_body->>'withdrawalId' = NEW.id
   ORDER BY completed_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal cancellation receipt evidence is missing';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN type = 'hold' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'release' THEN amount ELSE 0 END), 0)
    INTO hold_amount, release_amount
    FROM wallet_ledger
   WHERE wallet_id = NEW.user_id
     AND reference_type = 'withdrawal'
     AND reference_id = NEW.id;

  IF OLD.funds_reserved_at IS NOT NULL THEN
    IF hold_amount <> NEW.amount::numeric
       OR release_amount <> NEW.amount::numeric THEN
      RAISE EXCEPTION 'withdrawal cancellation release evidence is incomplete';
    END IF;
  ELSIF release_amount <> 0 THEN
    RAISE EXCEPTION 'unreserved withdrawal cancellation released funds';
  END IF;
  IF NEW.funds_reserved_at IS NOT NULL THEN
    RAISE EXCEPTION 'cancelled withdrawal retains reservation authority';
  END IF;

  correlation_identity := receipt.request_hash || ':' || NEW.id || ':cancelled';
  PERFORM tecpey_insert_withdrawal_evidence(
    'tecpey',
    'user',
    NEW.user_id,
    'withdrawal.cancel',
    'withdrawal_request',
    tecpey_withdrawal_evidence_hash('withdrawal', NEW.id),
    'success',
    'withdrawal-cancel:' || tecpey_withdrawal_evidence_hash(
      'withdrawal-evidence-cancel', correlation_identity
    ),
    receipt.request_hash,
    jsonb_build_object(
      'policyVersion', 'withdrawal-prebroadcast-evidence-v1',
      'requestFingerprint', tecpey_withdrawal_evidence_hash(
        'withdrawal-request', COALESCE(NEW.request_hash, receipt.request_hash)
      ),
      'destinationFingerprint', tecpey_withdrawal_evidence_hash(
        'withdrawal-destination',
        lower(NEW.network) || chr(31) || NEW.destination_address || chr(31) ||
          COALESCE(NEW.destination_tag, '')
      ),
      'asset', NEW.asset,
      'network', lower(NEW.network),
      'amount', NEW.amount::numeric::text,
      'previousState', OLD.state,
      'finalState', NEW.state,
      'hadReservation', OLD.funds_reserved_at IS NOT NULL,
      'holdAmount', hold_amount::text,
      'releasedAmount', release_amount::text,
      'receiptFingerprint', tecpey_withdrawal_evidence_hash(
        'withdrawal-command-receipt', receipt.idempotency_key
      )
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_cancel_mandatory_evidence ON withdrawals;
CREATE CONSTRAINT TRIGGER withdrawal_cancel_mandatory_evidence
  AFTER UPDATE OF state ON withdrawals
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.state IS DISTINCT FROM NEW.state AND NEW.state = 'cancelled')
  EXECUTE FUNCTION tecpey_append_withdrawal_cancel_evidence();

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
     OR COALESCE((NEW.metadata->>'stepUpWithinSeconds')::integer, 0) <= 0 THEN
    RAISE EXCEPTION 'withdrawal admin authorization evidence is incomplete';
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
      'stepUpWithinSeconds', (NEW.metadata->>'stepUpWithinSeconds')::integer,
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

DROP TRIGGER IF EXISTS withdrawal_admin_mandatory_evidence
  ON withdrawal_admin_actions;
CREATE CONSTRAINT TRIGGER withdrawal_admin_mandatory_evidence
  AFTER INSERT ON withdrawal_admin_actions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_append_withdrawal_admin_evidence();

CREATE OR REPLACE FUNCTION tecpey_guard_withdrawal_admin_action()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'withdrawal admin actions are append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_admin_actions_no_update
  ON withdrawal_admin_actions;
CREATE TRIGGER withdrawal_admin_actions_no_update
  BEFORE UPDATE ON withdrawal_admin_actions
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_guard_withdrawal_admin_action();

DROP TRIGGER IF EXISTS withdrawal_admin_actions_no_delete
  ON withdrawal_admin_actions;
CREATE TRIGGER withdrawal_admin_actions_no_delete
  BEFORE DELETE ON withdrawal_admin_actions
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_guard_withdrawal_admin_action();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runWithdrawalPrebroadcastEvidenceMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(WITHDRAWAL_PREBROADCAST_EVIDENCE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-withdrawal-prebroadcast-evidence] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-withdrawal-prebroadcast-evidence] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(WITHDRAWAL_PREBROADCAST_EVIDENCE_SQL);
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
