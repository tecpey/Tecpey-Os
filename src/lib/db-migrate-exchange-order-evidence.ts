import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0037_exchange_order_transactional_evidence.sql";

export const EXCHANGE_ORDER_EVIDENCE_SQL = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM exchange_order_commands command
      LEFT JOIN sensitive_mutation_audit_events evidence
        ON evidence.tenant_id = command.tenant_id
       AND evidence.actor_type = 'user'
       AND evidence.actor_id = command.user_id
       AND evidence.action = 'exchange.order.admit'
       AND evidence.resource_type = 'exchange_order'
       AND evidence.resource_id = 'exchange-order-' || encode(
         sha256(
           convert_to(
             'tecpey:exchange-order:v1' || chr(31) || command.order_id::text,
             'UTF8'
           )
         ),
         'hex'
       )
       AND evidence.correlation_id = 'exchange-order-admit-' || substring(
         encode(
           sha256(
             convert_to(
               'tecpey:exchange.order.admit:v1' || chr(31) ||
               command.tenant_id || ':' || command.user_id || ':' || command.idempotency_key,
               'UTF8'
             )
           ),
           'hex'
         ),
         1,
         48
       )
       AND evidence.request_hash = command.request_hash
     WHERE evidence.id IS NULL
  ) THEN
    RAISE EXCEPTION
      'legacy exchange order commands require explicit reconciliation before enabling transactional order evidence'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION tecpey_append_exchange_order_admission_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  order_row RECORD;
  correlation_value TEXT;
  resource_value TEXT;
  market_value TEXT;
BEGIN
  SELECT orders.user_id,
         orders.market,
         orders.side,
         orders.type,
         orders.time_in_force,
         orders.quantity::text AS quantity,
         orders.price::text AS price,
         orders.stop_price::text AS stop_price
    INTO order_row
    FROM orders
   WHERE orders.id = NEW.order_id
   FOR SHARE;

  IF NOT FOUND
    OR order_row.user_id IS DISTINCT FROM NEW.user_id
    OR order_row.market IS DISTINCT FROM NEW.market
  THEN
    RAISE EXCEPTION 'exchange order admission evidence authority mismatch'
      USING ERRCODE = '55000';
  END IF;

  correlation_value := 'exchange-order-admit-' || substring(
    encode(
      sha256(
        convert_to(
          'tecpey:exchange.order.admit:v1' || chr(31) ||
          NEW.tenant_id || ':' || NEW.user_id || ':' || NEW.idempotency_key,
          'UTF8'
        )
      ),
      'hex'
    ),
    1,
    48
  );
  resource_value := 'exchange-order-' || encode(
    sha256(
      convert_to(
        'tecpey:exchange-order:v1' || chr(31) || NEW.order_id::text,
        'UTF8'
      )
    ),
    'hex'
  );
  market_value := 'exchange-market-' || encode(
    sha256(
      convert_to(
        'tecpey:exchange-market:v1' || chr(31) || upper(NEW.market),
        'UTF8'
      )
    ),
    'hex'
  );

  INSERT INTO sensitive_mutation_audit_events
    (tenant_id, actor_type, actor_id, action, resource_type, resource_id,
     outcome, correlation_id, request_hash, metadata)
  VALUES
    (NEW.tenant_id, 'user', NEW.user_id, 'exchange.order.admit',
     'exchange_order', resource_value, 'success', correlation_value,
     NEW.request_hash,
     jsonb_build_object(
       'policyVersion', 'exchange-order-evidence-v1',
       'marketFingerprint', market_value,
       'side', order_row.side,
       'orderType', order_row.type,
       'timeInForce', order_row.time_in_force,
       'quantity', order_row.quantity,
       'price', order_row.price,
       'stopPrice', order_row.stop_price,
       'stateTransition', 'none->admitted',
       'holdAsset', upper(NEW.hold_asset),
       'holdAmount', NEW.hold_amount::text,
       'holdRepresentation', 'wallet_ledger'
     ));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exchange_order_command_admission_evidence
  ON exchange_order_commands;
CREATE TRIGGER exchange_order_command_admission_evidence
  AFTER INSERT ON exchange_order_commands
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_append_exchange_order_admission_evidence();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runExchangeOrderEvidenceMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(EXCHANGE_ORDER_EVIDENCE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-exchange-order-evidence] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-exchange-order-evidence] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(EXCHANGE_ORDER_EVIDENCE_SQL);
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
