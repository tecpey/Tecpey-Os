import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0037_exchange_order_evidence_authority.sql";

export const EXCHANGE_ORDER_EVIDENCE_SQL = `
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
        'orderid', 'order_id', 'tradeid', 'trade_id', 'walletid', 'wallet_id'
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

CREATE OR REPLACE FUNCTION tecpey_exchange_evidence_hash(domain TEXT, value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT md5('tecpey-' || domain || '-v1:' || COALESCE(value, ''))
       || md5('tecpey-' || domain || '-v1b:' || COALESCE(value, ''));
$$;

CREATE OR REPLACE FUNCTION tecpey_insert_exchange_evidence(
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

CREATE OR REPLACE FUNCTION tecpey_exchange_order_admission_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  order_row RECORD;
BEGIN
  SELECT side, type, quantity::text AS quantity, price::text AS price,
         stop_price::text AS stop_price, time_in_force
    INTO order_row
    FROM orders
   WHERE id = NEW.order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'exchange_order_admission_evidence_order_missing';
  END IF;

  PERFORM tecpey_insert_exchange_evidence(
    NEW.tenant_id,
    'user',
    NEW.user_id,
    'exchange.order.admit',
    'exchange_order',
    tecpey_exchange_evidence_hash('exchange-order', NEW.order_id::text),
    'success',
    'exchange-admit:' || tecpey_exchange_evidence_hash('exchange-command', NEW.id::text),
    NEW.request_hash,
    jsonb_build_object(
      'policyVersion', 'exchange-order-evidence-v1',
      'commandFingerprint', tecpey_exchange_evidence_hash('exchange-command', NEW.id::text),
      'market', NEW.market,
      'side', order_row.side,
      'type', order_row.type,
      'timeInForce', order_row.time_in_force,
      'quantity', order_row.quantity,
      'limitPrice', order_row.price,
      'stopPrice', order_row.stop_price,
      'maxQuoteAmount', NEW.max_quote_amount::text,
      'holdAsset', NEW.hold_asset,
      'holdAmount', NEW.hold_amount::text,
      'commandState', NEW.state
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exchange_order_command_admission_evidence
  ON exchange_order_commands;
CREATE TRIGGER exchange_order_command_admission_evidence
  AFTER INSERT ON exchange_order_commands
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_exchange_order_admission_evidence();

CREATE OR REPLACE FUNCTION tecpey_exchange_order_command_final_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  accepted BOOLEAN;
  order_status TEXT;
  action_name TEXT;
  outcome_name TEXT;
  reason_value TEXT;
BEGIN
  IF OLD.state = NEW.state
     OR NEW.state NOT IN ('final', 'failed_terminal') THEN
    RETURN NEW;
  END IF;

  accepted := COALESCE(NEW.result->>'accepted', 'false') = 'true';
  SELECT status INTO order_status FROM orders WHERE id = NEW.order_id;

  IF accepted THEN
    action_name := 'exchange.order.accept';
    outcome_name := 'success';
    reason_value := NULL;
  ELSIF NEW.state = 'failed_terminal'
        AND COALESCE(order_status, '') NOT IN ('REJECTED', 'EXPIRED', 'CANCELLED') THEN
    action_name := 'exchange.order.reject';
    outcome_name := 'rejected';
    reason_value := COALESCE(NEW.last_error_code, NEW.result->>'reason', 'terminal_failure');
  ELSE
    RETURN NEW;
  END IF;

  PERFORM tecpey_insert_exchange_evidence(
    NEW.tenant_id,
    'user',
    NEW.user_id,
    action_name,
    'exchange_order',
    tecpey_exchange_evidence_hash('exchange-order', NEW.order_id::text),
    outcome_name,
    CASE WHEN accepted THEN 'exchange-accept:' ELSE 'exchange-reject-command:' END
      || tecpey_exchange_evidence_hash('exchange-command', NEW.id::text),
    tecpey_exchange_evidence_hash(
      'exchange-command-result',
      NEW.request_hash || ':' || NEW.state || ':' || COALESCE(NEW.result::text, '')
    ),
    jsonb_build_object(
      'policyVersion', 'exchange-order-evidence-v1',
      'commandFingerprint', tecpey_exchange_evidence_hash('exchange-command', NEW.id::text),
      'market', NEW.market,
      'commandState', NEW.state,
      'accepted', accepted,
      'finalStatus', COALESCE(NEW.result->>'status', order_status),
      'reason', reason_value,
      'attemptCount', NEW.attempt_count,
      'tradeCount', CASE
        WHEN jsonb_typeof(NEW.result->'tradeIds') = 'array'
          THEN jsonb_array_length(NEW.result->'tradeIds')
        ELSE 0
      END
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exchange_order_command_final_evidence
  ON exchange_order_commands;
CREATE TRIGGER exchange_order_command_final_evidence
  AFTER UPDATE OF state ON exchange_order_commands
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_exchange_order_command_final_evidence();

CREATE OR REPLACE FUNCTION tecpey_exchange_order_terminal_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  command_row RECORD;
  hold_row RECORD;
  action_name TEXT;
  resource_type_name TEXT;
  outcome_name TEXT;
  evidence_request_hash TEXT;
  residual NUMERIC;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status
     OR NEW.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED') THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id, request_hash, hold_asset, hold_amount::text AS hold_amount
    INTO command_row
    FROM exchange_order_commands
   WHERE order_id = NEW.id
   ORDER BY created_at
   LIMIT 1;

  SELECT
    COALESCE(SUM(CASE WHEN type = 'hold' THEN amount ELSE 0 END), 0)::text AS held_amount,
    COALESCE(SUM(CASE WHEN type = 'release' THEN amount ELSE 0 END), 0)::text AS released_amount
    INTO hold_row
    FROM wallet_ledger
   WHERE wallet_id = NEW.user_id
     AND reference_type = 'order'
     AND reference_id = NEW.id::text;

  residual := COALESCE(hold_row.held_amount, '0')::numeric
            - COALESCE(hold_row.released_amount, '0')::numeric;
  IF residual <> 0 THEN
    RAISE EXCEPTION 'exchange_order_terminal_hold_not_closed';
  END IF;

  action_name := CASE
    WHEN NEW.status = 'CANCELLED' THEN 'exchange.order.cancel'
    ELSE 'exchange.order.reject'
  END;
  resource_type_name := CASE
    WHEN NEW.status = 'CANCELLED' THEN 'order_cancel'
    ELSE 'exchange_order'
  END;
  outcome_name := CASE
    WHEN NEW.status = 'CANCELLED' THEN 'success'
    ELSE 'rejected'
  END;
  evidence_request_hash := COALESCE(
    command_row.request_hash,
    tecpey_exchange_evidence_hash(
      'exchange-order-terminal',
      NEW.id::text || ':' || NEW.status || ':' || COALESCE(NEW.filled_quantity::text, '0')
    )
  );

  PERFORM tecpey_insert_exchange_evidence(
    COALESCE(command_row.tenant_id, 'tecpey'),
    'user',
    NEW.user_id,
    action_name,
    resource_type_name,
    tecpey_exchange_evidence_hash('exchange-order', NEW.id::text),
    outcome_name,
    CASE WHEN NEW.status = 'CANCELLED' THEN 'exchange-cancel:' ELSE 'exchange-reject:' END
      || tecpey_exchange_evidence_hash('exchange-order-transition', NEW.id::text || ':' || NEW.status),
    evidence_request_hash,
    jsonb_build_object(
      'policyVersion', 'exchange-order-evidence-v1',
      'market', NEW.market,
      'side', NEW.side,
      'type', NEW.type,
      'previousStatus', OLD.status,
      'finalStatus', NEW.status,
      'quantity', NEW.quantity::text,
      'filledQuantity', NEW.filled_quantity::text,
      'remainingQuantity', NEW.remaining_quantity::text,
      'averageFillPrice', NEW.avg_fill_price::text,
      'holdAsset', command_row.hold_asset,
      'heldAmount', COALESCE(hold_row.held_amount, '0'),
      'releasedAmount', COALESCE(hold_row.released_amount, '0'),
      'residualHold', residual::text
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exchange_order_terminal_evidence
  ON orders;
CREATE CONSTRAINT TRIGGER exchange_order_terminal_evidence
  AFTER UPDATE ON orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    AND NEW.status IN ('CANCELLED', 'REJECTED', 'EXPIRED')
  )
  EXECUTE FUNCTION tecpey_exchange_order_terminal_evidence();

CREATE OR REPLACE FUNCTION tecpey_exchange_trade_settlement_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  market_row RECORD;
  ledger_row RECORD;
  maker_fingerprint TEXT;
  taker_fingerprint TEXT;
  evidence_hash TEXT;
BEGIN
  SELECT base_asset, quote_asset
    INTO market_row
    FROM markets
   WHERE symbol = NEW.market;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'exchange_trade_market_missing';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE type = 'trade_debit')::integer AS debit_count,
    COUNT(*) FILTER (WHERE type = 'trade_credit')::integer AS credit_count,
    COUNT(*) FILTER (WHERE type = 'fee')::integer AS fee_count,
    COALESCE(SUM(CASE WHEN type = 'trade_debit' THEN amount ELSE 0 END), 0)::text AS debit_amount,
    COALESCE(SUM(CASE WHEN type = 'trade_credit' THEN amount ELSE 0 END), 0)::text AS credit_amount,
    COALESCE(SUM(CASE WHEN type = 'fee' THEN amount ELSE 0 END), 0)::text AS fee_amount
    INTO ledger_row
    FROM wallet_ledger
   WHERE reference_type = 'trade'
     AND reference_id = NEW.id::text;

  IF COALESCE(ledger_row.debit_count, 0) < 2
     OR COALESCE(ledger_row.credit_count, 0) < 2 THEN
    RAISE EXCEPTION 'exchange_trade_settlement_incomplete';
  END IF;

  maker_fingerprint := tecpey_exchange_evidence_hash(
    'exchange-order', NEW.maker_order_id::text
  );
  taker_fingerprint := tecpey_exchange_evidence_hash(
    'exchange-order', NEW.taker_order_id::text
  );
  evidence_hash := tecpey_exchange_evidence_hash(
    'exchange-trade-result',
    NEW.id::text || ':' || NEW.market || ':' || NEW.price::text || ':' || NEW.quantity::text
  );

  PERFORM tecpey_insert_exchange_evidence(
    'tecpey',
    'service',
    'matching-engine',
    'exchange.order.fill',
    'order_settlement',
    tecpey_exchange_evidence_hash('exchange-trade', NEW.id::text),
    'success',
    'exchange-fill:' || tecpey_exchange_evidence_hash('exchange-trade', NEW.id::text),
    evidence_hash,
    jsonb_build_object(
      'policyVersion', 'exchange-order-evidence-v1',
      'market', NEW.market,
      'side', NEW.side,
      'price', NEW.price::text,
      'quantity', NEW.quantity::text,
      'makerFee', NEW.fee_maker::text,
      'takerFee', NEW.fee_taker::text,
      'makerOrderFingerprint', maker_fingerprint,
      'takerOrderFingerprint', taker_fingerprint
    )
  );

  PERFORM tecpey_insert_exchange_evidence(
    'tecpey',
    'service',
    'matching-engine',
    'exchange.order.settle',
    'order_settlement',
    tecpey_exchange_evidence_hash('exchange-trade', NEW.id::text),
    'success',
    'exchange-settle:' || tecpey_exchange_evidence_hash('exchange-trade', NEW.id::text),
    evidence_hash,
    jsonb_build_object(
      'policyVersion', 'exchange-order-evidence-v1',
      'market', NEW.market,
      'baseAsset', market_row.base_asset,
      'quoteAsset', market_row.quote_asset,
      'debitAmount', ledger_row.debit_amount,
      'creditAmount', ledger_row.credit_amount,
      'feeAmount', ledger_row.fee_amount,
      'debitCount', ledger_row.debit_count,
      'creditCount', ledger_row.credit_count,
      'feeCount', ledger_row.fee_count,
      'makerOrderFingerprint', maker_fingerprint,
      'takerOrderFingerprint', taker_fingerprint
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exchange_trade_settlement_evidence
  ON trades;
CREATE CONSTRAINT TRIGGER exchange_trade_settlement_evidence
  AFTER INSERT ON trades
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_exchange_trade_settlement_evidence();
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
