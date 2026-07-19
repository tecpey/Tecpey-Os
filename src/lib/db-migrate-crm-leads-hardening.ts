import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0026_crm_lead_hardening.sql";

export const CRM_LEAD_HARDENING_SQL = `
ALTER TABLE crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_consent_status_check;

ALTER TABLE crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_legal_basis_consent_check;
ALTER TABLE crm_leads
  ADD CONSTRAINT crm_leads_legal_basis_consent_check
  CHECK (
    (legal_basis = 'consent' AND consent_status = TRUE)
    OR legal_basis = 'pre_contract'
  );

UPDATE crm_leads
   SET consent_status = FALSE,
       updated_at = NOW()
 WHERE privacy_notice_version = 'legacy-migration-v1'
   AND legal_basis = 'pre_contract';

CREATE OR REPLACE FUNCTION tecpey_block_crm_lead_hard_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'crm_leads must be privacy-deleted, not physically deleted'
    USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS crm_leads_no_delete ON crm_leads;
CREATE TRIGGER crm_leads_no_delete
  BEFORE DELETE ON crm_leads
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_crm_lead_hard_delete();

CREATE OR REPLACE FUNCTION tecpey_block_crm_lead_command_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'crm_lead_commands is immutable idempotency evidence'
    USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS crm_lead_commands_no_update ON crm_lead_commands;
CREATE TRIGGER crm_lead_commands_no_update
  BEFORE UPDATE ON crm_lead_commands
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_crm_lead_command_mutation();
DROP TRIGGER IF EXISTS crm_lead_commands_no_delete ON crm_lead_commands;
CREATE TRIGGER crm_lead_commands_no_delete
  BEFORE DELETE ON crm_lead_commands
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_crm_lead_command_mutation();

UPDATE crm_lead_delivery_outbox older
   SET status = 'terminal',
       locked_at = NULL,
       locked_by = NULL,
       lease_expires_at = NULL,
       last_error_code = 'superseded_revision',
       updated_at = NOW()
 WHERE older.status IN ('pending', 'retryable', 'processing')
   AND EXISTS (
     SELECT 1
       FROM crm_lead_delivery_outbox newer
      WHERE newer.lead_id = older.lead_id
        AND newer.destination = older.destination
        AND newer.lead_revision > older.lead_revision
   );
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runCrmLeadHardeningMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(CRM_LEAD_HARDENING_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-crm-leads-hardening] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  logger.info("[db-migrate-crm-leads-hardening] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(CRM_LEAD_HARDENING_SQL);
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
