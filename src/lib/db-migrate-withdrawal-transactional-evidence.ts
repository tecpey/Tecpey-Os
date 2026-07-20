import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0039_withdrawal_transactional_evidence.sql";

export const WITHDRAWAL_TRANSACTIONAL_EVIDENCE_SQL = `
CREATE OR REPLACE FUNCTION tecpey_append_withdrawal_admission_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data JSONB;
  tenant_value TEXT;
  withdrawal_value TEXT;
  user_value TEXT;
  asset_value TEXT;
  network_value TEXT;
  address_value TEXT;
  tag_value TEXT;
  state_value TEXT;
  request_hash_value TEXT;
  idempotency_value TEXT;
  amount_value TEXT;
  amount_usd_value TEXT;
  reserve_funds_value BOOLEAN;
  reserved_amount_value TEXT;
  compliance_reason_value TEXT;
  kyc_status_value TEXT;
  aml_risk_value TEXT;
  sanctions_hit_value BOOLEAN;
  admission_policy_value TEXT;
  compliance_policy_value TEXT;
  resource_value TEXT;
  destination_value TEXT;
  price_snapshot_value TEXT;
  correlation_value TEXT;
BEGIN
  row_data := to_jsonb(NEW);
  tenant_value := COALESCE(NULLIF(row_data->>'tenant_id', ''), 'tecpey');
  withdrawal_value := row_data->>'id';
  user_value := row_data->>'user_id';
  asset_value := upper(COALESCE(row_data->>'asset', ''));
  network_value := upper(COALESCE(row_data->>'network', ''));
  address_value := COALESCE(
    NULLIF(row_data->>'address', ''),
    NULLIF(row_data->>'destination_address', '')
  );
  tag_value := COALESCE(
    row_data->>'tag',
    row_data->>'destination_tag',
    ''
  );
  state_value := lower(COALESCE(row_data->>'state', ''));
  request_hash_value := lower(COALESCE(row_data->>'request_hash', ''));
  idempotency_value := row_data->>'idempotency_key';
  amount_value := row_data->>'amount';
  amount_usd_value := row_data->>'amount_usd';
  reserve_funds_value := NULLIF(row_data->>'funds_reserved_at', '') IS NOT NULL;
  reserved_amount_value := CASE
    WHEN reserve_funds_value THEN amount_value
    ELSE '0'
  END;
  compliance_reason_value := lower(COALESCE(row_data->>'compliance_reason', 'unknown'));
  kyc_status_value := lower(COALESCE(row_data->'kyc_evidence'->>'status', 'unknown'));
  aml_risk_value := lower(COALESCE(
    row_data->'aml_evidence'->>'risk',
    row_data->'aml_evidence'->>'riskLevel',
    'unknown'
  ));
  sanctions_hit_value := CASE
    WHEN lower(COALESCE(
      row_data->'sanctions_evidence'->>'hit',
      row_data->'sanctions_evidence'->>'matched',
      'false'
    )) IN ('true', '1', 'yes') THEN TRUE
    ELSE FALSE
  END;
  admission_policy_value := lower(COALESCE(
    row_data->>'admission_policy_version',
    'unknown'
  ));
  compliance_policy_value := lower(COALESCE(
    row_data->>'compliance_policy_version',
    'unknown'
  ));

  IF withdrawal_value IS NULL
    OR user_value IS NULL
    OR idempotency_value IS NULL
    OR address_value IS NULL
    OR amount_value IS NULL
    OR amount_usd_value IS NULL
    OR asset_value !~ '^[A-Z0-9][A-Z0-9._-]{1,19}$'
    OR network_value !~ '^[A-Z0-9][A-Z0-9._:-]{1,39}$'
    OR request_hash_value !~ '^[0-9a-f]{64}$'
    OR state_value NOT IN ('pending', 'compliance_review', 'blocked')
    OR compliance_reason_value !~ '^[a-z0-9][a-z0-9._:-]{0,99}$'
    OR kyc_status_value !~ '^[a-z0-9][a-z0-9._:-]{0,99}$'
    OR aml_risk_value !~ '^[a-z0-9][a-z0-9._:-]{0,99}$'
    OR admission_policy_value !~ '^[a-z0-9][a-z0-9._:-]{0,99}$'
    OR compliance_policy_value !~ '^[a-z0-9][a-z0-9._:-]{0,99}$'
  THEN
    RAISE EXCEPTION 'withdrawal admission evidence authority is incomplete or invalid'
      USING ERRCODE = '55000';
  END IF;

  IF state_value = 'blocked' AND reserve_funds_value THEN
    RAISE EXCEPTION 'blocked withdrawal cannot retain reserved funds'
      USING ERRCODE = '55000';
  END IF;
  IF state_value <> 'blocked' AND NOT reserve_funds_value THEN
    RAISE EXCEPTION 'admitted withdrawal must have reserved funds'
      USING ERRCODE = '55000';
  END IF;

  resource_value := 'withdrawal-' || encode(
    sha256(
      convert_to(
        'tecpey:withdrawal:v1' || chr(31) || withdrawal_value,
        'UTF8'
      )
    ),
    'hex'
  );
  destination_value := 'withdrawal-destination-' || encode(
    sha256(
      convert_to(
        'tecpey:withdrawal-destination:v1' || chr(31) ||
        network_value || chr(31) || address_value || chr(31) || tag_value,
        'UTF8'
      )
    ),
    'hex'
  );
  price_snapshot_value := 'withdrawal-price-snapshot-' || encode(
    sha256(
      convert_to(
        'tecpey:withdrawal-price-snapshot:v1' || chr(31) ||
        COALESCE(row_data->>'price_snapshot_id', 'missing'),
        'UTF8'
      )
    ),
    'hex'
  );
  correlation_value := 'withdrawal-admit-' || substring(
    encode(
      sha256(
        convert_to(
          'tecpey:withdrawal.admit:v1' || chr(31) ||
          tenant_value || ':' || user_value || ':' || idempotency_value,
          'UTF8'
        )
      ),
      'hex'
    ),
    1,
    48
  );

  INSERT INTO sensitive_mutation_audit_events
    (tenant_id, actor_type, actor_id, action, resource_type, resource_id,
     outcome, correlation_id, request_hash, metadata)
  VALUES
    (tenant_value, 'user', user_value, 'withdrawal.admit', 'withdrawal',
     resource_value,
     CASE WHEN state_value = 'blocked' THEN 'rejected' ELSE 'success' END,
     correlation_value, request_hash_value,
     jsonb_build_object(
       'policyVersion', 'withdrawal-transactional-evidence-v1',
       'assetCode', asset_value,
       'networkCode', network_value,
       'amount', amount_value,
       'amountUsd', amount_usd_value,
       'destinationFingerprint', destination_value,
       'resultingState', state_value,
       'reserveFunds', reserve_funds_value,
       'reservedAmount', reserved_amount_value,
       'complianceReasonCode', compliance_reason_value,
       'kycStatusCode', kyc_status_value,
       'amlRiskCode', aml_risk_value,
       'sanctionsHit', sanctions_hit_value,
       'priceSnapshotFingerprint', price_snapshot_value,
       'admissionPolicyCode', admission_policy_value,
       'compliancePolicyCode', compliance_policy_value
     ));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_admission_mandatory_evidence
  ON withdrawals;
CREATE TRIGGER withdrawal_admission_mandatory_evidence
  AFTER INSERT ON withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_append_withdrawal_admission_evidence();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runWithdrawalTransactionalEvidenceMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(WITHDRAWAL_TRANSACTIONAL_EVIDENCE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-withdrawal-transactional-evidence] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-withdrawal-transactional-evidence] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(WITHDRAWAL_TRANSACTIONAL_EVIDENCE_SQL);
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
