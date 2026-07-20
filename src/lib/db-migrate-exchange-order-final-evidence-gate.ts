import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0038_exchange_order_final_evidence_gate.sql";

export const EXCHANGE_ORDER_FINAL_EVIDENCE_GATE_SQL = `
CREATE OR REPLACE FUNCTION tecpey_require_exchange_order_final_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_action TEXT;
  expected_resource TEXT;
  expected_correlation TEXT;
  expected_final_state TEXT;
BEGIN
  IF NEW.state IS DISTINCT FROM 'final' OR OLD.state = 'final' THEN
    RETURN NEW;
  END IF;

  IF NEW.result IS NULL
    OR jsonb_typeof(NEW.result) <> 'object'
    OR jsonb_typeof(NEW.result->'accepted') <> 'boolean'
  THEN
    RAISE EXCEPTION 'exchange order final command result is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT orders.status
    INTO expected_final_state
    FROM orders
   WHERE orders.id = NEW.order_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'exchange order final command order is missing'
      USING ERRCODE = '55000';
  END IF;

  expected_action := CASE
    WHEN (NEW.result->>'accepted')::boolean THEN 'exchange.order.finalize'
    ELSE 'exchange.order.reject'
  END;
  expected_resource := 'exchange-order-' || encode(
    sha256(
      convert_to(
        'tecpey:exchange-order:v1' || chr(31) || NEW.order_id::text,
        'UTF8'
      )
    ),
    'hex'
  );
  expected_correlation := replace(expected_action, '.', '-') || '-' || substring(
    encode(
      sha256(
        convert_to(
          'tecpey:' || expected_action || ':v1' || chr(31) ||
          NEW.tenant_id || ':' || NEW.id::text || ':' || NEW.request_hash,
          'UTF8'
        )
      ),
      'hex'
    ),
    1,
    48
  );

  IF NOT EXISTS (
    SELECT 1
      FROM sensitive_mutation_audit_events evidence
     WHERE evidence.tenant_id = NEW.tenant_id
       AND evidence.actor_type = 'service'
       AND evidence.actor_id = 'exchange-order-worker'
       AND evidence.action = expected_action
       AND evidence.resource_type = 'exchange_order'
       AND evidence.resource_id = expected_resource
       AND evidence.correlation_id = expected_correlation
       AND evidence.request_hash = NEW.request_hash
       AND evidence.metadata->>'finalState' = expected_final_state
       AND (evidence.metadata->>'accepted')::boolean =
         (NEW.result->>'accepted')::boolean
  ) THEN
    RAISE EXCEPTION 'exchange order final evidence is missing or mismatched'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exchange_order_command_final_evidence_gate
  ON exchange_order_commands;
CREATE TRIGGER exchange_order_command_final_evidence_gate
  BEFORE UPDATE OF state, result ON exchange_order_commands
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_require_exchange_order_final_evidence();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runExchangeOrderFinalEvidenceGateMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(EXCHANGE_ORDER_FINAL_EVIDENCE_GATE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-exchange-order-final-evidence-gate] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-exchange-order-final-evidence-gate] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(EXCHANGE_ORDER_FINAL_EVIDENCE_GATE_SQL);
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
