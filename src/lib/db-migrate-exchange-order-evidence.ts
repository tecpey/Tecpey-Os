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

  IF EXISTS (
    SELECT 1
      FROM exchange_order_commands command
      LEFT JOIN sensitive_mutation_audit_events evidence
        ON evidence.tenant_id = command.tenant_id
       AND evidence.actor_type = 'service'
       AND evidence.actor_id = 'exchange-order-worker'
       AND evidence.action = CASE
         WHEN COALESCE((command.result->>'accepted')::boolean, false)
           THEN 'exchange.order.finalize'
         ELSE 'exchange.order.reject'
       END
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
       AND evidence.request_hash = command.request_hash
     WHERE command.state = 'final'
       AND evidence.id IS NULL
  ) THEN
    RAISE EXCEPTION
      'legacy final exchange order commands require explicit final evidence reconciliation'
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

CREATE OR REPLACE FUNCTION tecpey_append_exchange_order_final_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  authority RECORD;
  action_value TEXT;
  accepted_value BOOLEAN;
  reason_value TEXT;
  correlation_value TEXT;
  resource_value TEXT;
  market_value TEXT;
  trade_count_value BIGINT;
  trade_ids_value TEXT;
  trade_fingerprint_value TEXT;
  hold_closed_value BOOLEAN;
  hold_residual_value NUMERIC;
BEGIN
  IF NEW.event_type NOT IN (
    'OrderAccepted',
    'OrderPartiallyFilled',
    'OrderFilled',
    'OrderExpired',
    'OrderRejected'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT command.id AS command_id,
         command.tenant_id,
         command.user_id,
         command.request_hash,
         command.hold_asset,
         orders.market,
         orders.side,
         orders.type,
         orders.time_in_force,
         orders.quantity::text AS quantity,
         orders.price::text AS price,
         orders.stop_price::text AS stop_price,
         orders.status
    INTO authority
    FROM exchange_order_commands command
    JOIN orders ON orders.id = command.order_id
   WHERE command.order_id = NEW.order_id
   FOR SHARE OF command, orders;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'exchange order final evidence authority missing'
      USING ERRCODE = '55000';
  END IF;

  SELECT COUNT(*)::bigint,
         string_agg(trades.id::text, chr(10) ORDER BY trades.executed_at, trades.id)
    INTO trade_count_value, trade_ids_value
    FROM trades
   WHERE trades.buyer_order_id = NEW.order_id
      OR trades.seller_order_id = NEW.order_id;

  IF trade_count_value > 10000 THEN
    RAISE EXCEPTION 'exchange order final evidence trade count exceeded'
      USING ERRCODE = '54000';
  END IF;

  accepted_value := authority.status IN ('NEW', 'PARTIALLY_FILLED', 'FILLED')
    OR trade_count_value > 0;
  action_value := CASE
    WHEN accepted_value THEN 'exchange.order.finalize'
    ELSE 'exchange.order.reject'
  END;
  reason_value := CASE
    WHEN accepted_value THEN NULL
    WHEN NEW.payload->>'reason' IS NOT NULL THEN left(NEW.payload->>'reason', 100)
    WHEN NEW.event_type = 'OrderRejected' THEN 'order_rejected'
    ELSE 'order_expired'
  END;
  IF reason_value IS NOT NULL
    AND reason_value !~ '^[a-z0-9][a-z0-9._:-]{0,99}$'
  THEN
    RAISE EXCEPTION 'invalid exchange order final evidence reason'
      USING ERRCODE = '22023';
  END IF;

  hold_closed_value := authority.status IN ('FILLED', 'CANCELLED', 'EXPIRED', 'REJECTED');
  IF hold_closed_value THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN ledger.type = 'hold' THEN ledger.amount
        WHEN ledger.type = 'release' THEN -ledger.amount
        ELSE 0
      END
    ), 0)
      INTO hold_residual_value
      FROM wallet_ledger ledger
     WHERE ledger.wallet_id = authority.user_id
       AND ledger.asset = upper(authority.hold_asset)
       AND ledger.reference_type = 'order'
       AND ledger.reference_id = NEW.order_id::text;
    IF hold_residual_value <> 0 THEN
      RAISE EXCEPTION 'exchange order final evidence hold is not closed'
        USING ERRCODE = '55000';
    END IF;
  END IF;

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
        'tecpey:exchange-market:v1' || chr(31) || upper(authority.market),
        'UTF8'
      )
    ),
    'hex'
  );
  correlation_value := replace(action_value, '.', '-') || '-' || substring(
    encode(
      sha256(
        convert_to(
          'tecpey:' || action_value || ':v1' || chr(31) ||
          authority.tenant_id || ':' || authority.command_id::text || ':' || authority.request_hash,
          'UTF8'
        )
      ),
      'hex'
    ),
    1,
    48
  );
  trade_fingerprint_value := CASE
    WHEN trade_count_value > 0 THEN encode(
      sha256(
        convert_to(
          'tecpey:trade-set:v1' || chr(31) || COALESCE(trade_ids_value, ''),
          'UTF8'
        )
      ),
      'hex'
    )
    ELSE NULL
  END;

  INSERT INTO sensitive_mutation_audit_events
    (tenant_id, actor_type, actor_id, action, resource_type, resource_id,
     outcome, correlation_id, request_hash, metadata)
  VALUES
    (authority.tenant_id, 'service', 'exchange-order-worker', action_value,
     'exchange_order', resource_value,
     CASE WHEN accepted_value THEN 'success' ELSE 'rejected' END,
     correlation_value, authority.request_hash,
     jsonb_build_object(
       'policyVersion', 'exchange-order-evidence-v1',
       'marketFingerprint', market_value,
       'side', authority.side,
       'orderType', authority.type,
       'timeInForce', authority.time_in_force,
       'quantity', authority.quantity,
       'price', authority.price,
       'stopPrice', authority.stop_price,
       'finalState', authority.status,
       'accepted', accepted_value,
       'reasonCode', reason_value,
       'tradeCount', trade_count_value,
       'tradeSetFingerprint', trade_fingerprint_value,
       'holdClosed', hold_closed_value
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

DROP TRIGGER IF EXISTS exchange_order_final_evidence
  ON order_events;
CREATE TRIGGER exchange_order_final_evidence
  AFTER INSERT ON order_events
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_append_exchange_order_final_evidence();
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
