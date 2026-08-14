import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0072_withdrawal_evidence_tenant.sql";

// The withdrawal custody-evidence chain wrote every row under a hard-coded
// tenant.
//
// Five functions are involved, not the two the roadmap note named. Three build
// the append-only evidence for a withdrawal's life — admission, user
// cancellation, admin action — and two more *verify* that evidence before they
// will let the withdrawal move: the pre-broadcast transition authority and the
// external-effect gate. Reading the live catalogue rather than trusting a grep
// is what turned the last two up; a first pass that fixed only the writers made
// every admin action fail, because the gates were still looking under the
// literal.
//
// Each writer passed the literal 'tecpey' to tecpey_insert_withdrawal_evidence,
// and two of them also resolved their api_command_receipts row under that same
// literal. The evidence function itself always took the tenant as a parameter —
// only its callers were fixed. The two verifying gates looked for the evidence
// under the literal in the same way.
//
// So a withdrawal belonging to another tenant produced custody evidence filed
// under the default tenant. That is not a disclosure: the evidence is correct
// about what happened, and principal ids are globally unique UUIDs so no two
// tenants collide. It is a labelling failure, and for an append-only custody
// record that is its own kind of serious — the row that says who approved a
// withdrawal names the wrong tenant, permanently, and a tenant reading its own
// evidence by tenant_id would not find its own withdrawals.
//
// This was found while making adminActOnAuthoritativeWithdrawal tenant-scoped
// (PR #417). Moving the receipt alone broke the chain, because the trigger
// resolved the receipt under the literal, so the fix had to be the trigger and
// its writer together. It was recorded as roadmap 7.3 rather than half-done.
//
// The tenant is now derived from the withdrawal itself, which is the row that
// authoritatively owns the money:
//   - admission and cancel fire ON withdrawals, so NEW.tenant_id is at hand;
//   - the admin trigger fires on withdrawal_admin_actions, which carries no
//     tenant, so it reads the tenant from the withdrawal row it already locks.
//
// Existing rows are deliberately NOT rewritten. sensitive_mutation_audit_events
// is append-only and guarded as such; rewriting historical custody evidence to
// improve its labels is exactly what an append-only record exists to prevent.
// Rows written before this migration keep the tenant they were filed under, and
// that is the honest record of how they were produced.

export const WITHDRAWAL_EVIDENCE_TENANT_SQL = `
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
    NEW.tenant_id,
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
   WHERE tenant_id = NEW.tenant_id
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
    NEW.tenant_id,
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
         destination_tag, state, request_hash, funds_reserved_at, tenant_id
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
   WHERE tenant_id = withdrawal_row.tenant_id
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
    withdrawal_row.tenant_id,
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
     WHERE receipt.tenant_id = NEW.tenant_id
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

-- tecpey_guard_withdrawal_external_effect_transition verifies that the custody
-- evidence for a broadcast/confirmation step exists before it will let the
-- withdrawal move, and it looked for that evidence under the literal 'tecpey'.
-- Since the writers above now file evidence under the withdrawal's own tenant,
-- leaving this gate alone would block every external-effect transition for a
-- non-default tenant — the two halves have to move together.
--
-- This function is patched rather than replaced. Migration 0044 rewrites its
-- live definition in place with pg_get_functiondef (an amount cast and a
-- confirmation-monitor authority), so re-issuing it from any file's text would
-- silently revert those. The same technique is used here, and it fails loudly if
-- the target text is absent rather than leaving a half-patched gate behind.
DO $outer$
DECLARE
  current_definition TEXT;
  patched_definition TEXT;
  remaining INTEGER;
BEGIN
  current_definition := pg_get_functiondef(
    'tecpey_guard_withdrawal_external_effect_transition()'::regprocedure
  );

  IF position('WHERE tenant_id = ''tecpey''' IN current_definition) = 0 THEN
    IF position('WHERE tenant_id = NEW.tenant_id' IN current_definition) = 0 THEN
      RAISE EXCEPTION
        'withdrawal external-effect gate tenant patch target is missing';
    END IF;
    RETURN;
  END IF;

  patched_definition := replace(
    current_definition,
    'WHERE tenant_id = ''tecpey''',
    'WHERE tenant_id = NEW.tenant_id'
  );

  remaining := (length(patched_definition) - length(replace(patched_definition, '''tecpey''', '')))
               / length('''tecpey''');
  IF remaining <> 0 THEN
    RAISE EXCEPTION
      'withdrawal external-effect gate still carries % hard-coded tenant reference(s) after patching',
      remaining;
  END IF;

  EXECUTE patched_definition;
END $outer$;

`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runWithdrawalEvidenceTenantMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(WITHDRAWAL_EVIDENCE_TENANT_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-withdrawal-evidence-tenant] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-withdrawal-evidence-tenant] applying migration", {
    filename: FILENAME,
    checksum: cs,
  });
  await client.query("BEGIN");
  try {
    await client.query(WITHDRAWAL_EVIDENCE_TENANT_SQL);
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
