import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { withDb, withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getMatchingEngine } from "./engine";
import { createOrderTx, getOrder, getOrderByIdTx } from "./order-service";
import type { Order, PlaceOrderRequest } from "./types";
import {
  assertOrderHoldClosedTx,
  holdOrderFundsTx,
} from "./wallet-service";

export type ExchangeOrderAdmissionInput = {
  tenantId: string;
  userId: string;
  idempotencyKey: string;
  request: PlaceOrderRequest;
  hold: { asset: string; amount: string };
};

export type ExchangeOrderCommandOutcome = {
  accepted: boolean;
  reason?: string;
  tradeIds: string[];
  orderStatus: string;
};

export type ExchangeOrderAdmissionResult =
  | {
      status: "admitted" | "replayed";
      commandId: string;
      order: Order;
      state: string;
      outcome: ExchangeOrderCommandOutcome | null;
    }
  | { status: "conflict" }
  | { status: "insufficient_balance" }
  | { status: "unavailable" };

export type ExchangeOrderProcessingResult =
  | {
      status: "final";
      commandId: string;
      order: Order;
      outcome: ExchangeOrderCommandOutcome;
    }
  | {
      status: "queued" | "processing";
      commandId: string;
      order: Order | null;
      reason: string;
    }
  | { status: "unavailable"; commandId: string };

type CommandRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  idempotency_key: string;
  request_hash: string;
  order_id: string;
  market: string;
  hold_asset: string;
  hold_amount: string;
  state: string;
  result: ExchangeOrderCommandOutcome;
  attempt_count: number;
  max_attempts: number;
  locked_by: string | null;
  lease_expires_at: Date | null;
};

type Claim = {
  id: string;
  tenantId: string;
  userId: string;
  orderId: string;
  market: string;
  holdAsset: string;
  attemptCount: number;
  maxAttempts: number;
};

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,160}$/;
const TERMINAL_ORDER_STATUSES = new Set(["FILLED", "CANCELLED", "EXPIRED", "REJECTED"]);
const PROCESSED_EVENTS = [
  "OrderAccepted",
  "OrderPartiallyFilled",
  "OrderFilled",
  "OrderExpired",
  "OrderRejected",
];

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return "null";
}

export function hashExchangeOrderCommand(input: ExchangeOrderAdmissionInput): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        tenantId: input.tenantId,
        userId: input.userId,
        request: {
          market: input.request.market,
          side: input.request.side,
          type: input.request.type,
          quantity: input.request.quantity,
          price: input.request.price ?? null,
          stopPrice: input.request.stopPrice ?? null,
          clientOrderId: input.request.clientOrderId ?? null,
          timeInForce: input.request.timeInForce ?? "GTC",
        },
        hold: {
          asset: input.hold.asset.toUpperCase(),
          amount: input.hold.amount,
        },
      }),
    )
    .digest("hex");
}

function parseOutcome(value: unknown): ExchangeOrderCommandOutcome | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<ExchangeOrderCommandOutcome>;
  if (
    typeof row.accepted !== "boolean" ||
    typeof row.orderStatus !== "string" ||
    !Array.isArray(row.tradeIds) ||
    !row.tradeIds.every((entry) => typeof entry === "string")
  ) {
    return null;
  }
  return {
    accepted: row.accepted,
    reason: typeof row.reason === "string" ? row.reason : undefined,
    tradeIds: row.tradeIds,
    orderStatus: row.orderStatus,
  };
}

async function appendOrderEventTx(
  client: PoolClient,
  orderId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO order_events (order_id, event_type, payload)
     VALUES ($1::uuid, $2, $3::jsonb)`,
    [orderId, eventType, JSON.stringify(payload)],
  );
}

export async function admitExchangeOrderCommand(
  input: ExchangeOrderAdmissionInput,
): Promise<ExchangeOrderAdmissionResult> {
  if (!IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
    throw new Error("invalid_order_idempotency_key");
  }
  const requestHash = hashExchangeOrderCommand(input);

  try {
    const transaction = await withTx(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`exchange-order-command:${input.tenantId}:${input.userId}:${input.idempotencyKey}`],
      );

      const existing = await client.query<CommandRow>(
        `SELECT *
           FROM exchange_order_commands
          WHERE tenant_id = $1 AND user_id = $2 AND idempotency_key = $3
          FOR SHARE`,
        [input.tenantId, input.userId, input.idempotencyKey],
      );
      if (existing.rows[0]) {
        const command = existing.rows[0];
        if (command.request_hash !== requestHash) {
          return { status: "conflict" as const };
        }
        const order = await getOrderByIdTx(client, command.order_id);
        if (!order || order.userId !== input.userId) {
          throw new Error("order_command_authority_corrupt");
        }
        return {
          status: "replayed" as const,
          commandId: command.id,
          order,
          state: command.state,
          outcome: parseOutcome(command.result),
        };
      }

      const order = await createOrderTx(client, {
        ...input.request,
        userId: input.userId,
      });
      if (!order) throw new Error("order_creation_failed");

      const held = await holdOrderFundsTx(
        client,
        input.userId,
        input.hold.asset,
        input.hold.amount,
        order.id,
      );
      if (!held) throw new Error("insufficient_balance");

      const command = await client.query<{ id: string }>(
        `INSERT INTO exchange_order_commands
          (tenant_id, user_id, idempotency_key, request_hash, order_id,
           market, hold_asset, hold_amount)
         VALUES ($1, $2, $3, $4, $5::uuid, $6, $7, $8::numeric)
         RETURNING id`,
        [
          input.tenantId,
          input.userId,
          input.idempotencyKey,
          requestHash,
          order.id,
          order.market,
          input.hold.asset.toUpperCase(),
          input.hold.amount,
        ],
      );
      if (!command.rows[0]) throw new Error("order_command_creation_failed");

      await appendOrderEventTx(client, order.id, "OrderAdmitted", {
        orderId: order.id,
        commandId: command.rows[0].id,
        market: order.market,
        holdAsset: input.hold.asset.toUpperCase(),
        holdAmount: input.hold.amount,
      });

      return {
        status: "admitted" as const,
        commandId: command.rows[0].id,
        order,
        state: "admitted",
        outcome: null,
      };
    });

    return transaction.enabled ? transaction.value : { status: "unavailable" };
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    if (code === "insufficient_balance") {
      return { status: "insufficient_balance" };
    }
    logger.error("[exchange-order-command] admission failed", {
      tenantId: input.tenantId,
      userId: input.userId,
      market: input.request.market,
      error: code,
    });
    return { status: "unavailable" };
  }
}

async function recoverExpiredCommandLease(
  client: PoolClient,
  commandId: string,
  workerId: string,
): Promise<void> {
  const recovered = await client.query<{
    id: string;
    attempt_count: number;
    max_attempts: number;
  }>(
    `UPDATE exchange_order_commands
        SET state = CASE
              WHEN attempt_count >= max_attempts THEN 'failed_terminal'
              ELSE 'retryable'
            END,
            available_at = NOW(),
            locked_at = NULL,
            locked_by = NULL,
            lease_expires_at = NULL,
            finalized_at = CASE
              WHEN attempt_count >= max_attempts THEN NOW()
              ELSE NULL
            END,
            last_error_code = 'lease_expired',
            updated_at = NOW()
      WHERE id = $1::uuid
        AND state = 'processing'
        AND lease_expires_at <= NOW()
      RETURNING id, attempt_count, max_attempts`,
    [commandId],
  );
  if (!recovered.rows[0]) return;
  await client.query(
    `INSERT INTO exchange_order_command_attempts
      (command_id, attempt_number, worker_id, outcome, error_code, completed_at)
     VALUES ($1::uuid, $2, $3, 'lease_recovered', 'lease_expired', NOW())`,
    [commandId, recovered.rows[0].attempt_count, workerId],
  );
}

async function claimCommand(
  commandId: string,
  workerId: string,
): Promise<
  | { status: "claimed"; claim: Claim }
  | { status: "final"; row: CommandRow }
  | { status: "busy" | "unavailable" }
> {
  try {
    const transaction = await withTx(async (client) => {
      await recoverExpiredCommandLease(client, commandId, workerId);
      const claimed = await client.query<CommandRow>(
        `UPDATE exchange_order_commands
            SET state = 'processing',
                attempt_count = attempt_count + 1,
                locked_at = NOW(),
                locked_by = $2,
                lease_expires_at = NOW() + INTERVAL '2 minutes',
                last_error_code = NULL,
                last_error_detail = NULL,
                updated_at = NOW()
          WHERE id = $1::uuid
            AND state IN ('admitted', 'retryable')
            AND available_at <= NOW()
          RETURNING *`,
        [commandId, workerId],
      );
      if (!claimed.rows[0]) {
        const current = await client.query<CommandRow>(
          "SELECT * FROM exchange_order_commands WHERE id = $1::uuid",
          [commandId],
        );
        if (current.rows[0]?.state === "final") {
          return { status: "final" as const, row: current.rows[0] };
        }
        return { status: "busy" as const };
      }

      const row = claimed.rows[0];
      await client.query(
        `INSERT INTO exchange_order_command_attempts
          (command_id, attempt_number, worker_id, outcome)
         VALUES ($1::uuid, $2, $3, 'claimed')`,
        [row.id, row.attempt_count, workerId],
      );
      return {
        status: "claimed" as const,
        claim: {
          id: row.id,
          tenantId: row.tenant_id,
          userId: row.user_id,
          orderId: row.order_id,
          market: row.market,
          holdAsset: row.hold_asset,
          attemptCount: row.attempt_count,
          maxAttempts: row.max_attempts,
        },
      };
    });
    return transaction.enabled ? transaction.value : { status: "unavailable" };
  } catch (error) {
    logger.error("[exchange-order-command] claim failed", {
      commandId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { status: "unavailable" };
  }
}

async function reconstructCommittedOutcome(
  client: PoolClient,
  order: Order,
): Promise<ExchangeOrderCommandOutcome | null> {
  const event = await client.query<{
    event_type: string;
    payload: Record<string, unknown>;
  }>(
    `SELECT event_type, payload
       FROM order_events
      WHERE order_id = $1::uuid
        AND event_type = ANY($2::text[])
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [order.id, PROCESSED_EVENTS],
  );
  if (!event.rows[0]) return null;

  const trades = await client.query<{ id: string }>(
    `SELECT id::text AS id
       FROM trades
      WHERE buyer_order_id = $1::uuid OR seller_order_id = $1::uuid
      ORDER BY executed_at, id`,
    [order.id],
  );
  const tradeIds = trades.rows.map((row) => row.id);
  const accepted =
    order.status === "NEW" ||
    order.status === "PARTIALLY_FILLED" ||
    order.status === "FILLED" ||
    tradeIds.length > 0;
  const reason = accepted
    ? undefined
    : typeof event.rows[0].payload?.reason === "string"
      ? event.rows[0].payload.reason
      : event.rows[0].event_type === "OrderRejected"
        ? "order_rejected"
        : "order_expired";
  return { accepted, reason, tradeIds, orderStatus: order.status };
}

async function finalizeCommand(
  claim: Claim,
  workerId: string,
  proposed?: { accepted: boolean; reason?: string; tradeIds: string[] },
): Promise<ExchangeOrderProcessingResult> {
  try {
    const transaction = await withTx(async (client) => {
      const command = await client.query<CommandRow>(
        `SELECT * FROM exchange_order_commands
          WHERE id = $1::uuid
          FOR UPDATE`,
        [claim.id],
      );
      const row = command.rows[0];
      if (!row) throw new Error("order_command_not_found");
      if (row.state === "final") {
        const order = await getOrderByIdTx(client, row.order_id);
        const outcome = parseOutcome(row.result);
        if (!order || !outcome) throw new Error("order_command_final_result_invalid");
        return { status: "final" as const, commandId: row.id, order, outcome };
      }
      if (row.state !== "processing" || row.locked_by !== workerId) {
        throw new Error("order_command_lease_lost");
      }

      const order = await getOrderByIdTx(client, claim.orderId);
      if (!order || order.userId !== claim.userId || order.market !== claim.market) {
        throw new Error("order_command_authority_corrupt");
      }

      const reconstructed = await reconstructCommittedOutcome(client, order);
      const outcome: ExchangeOrderCommandOutcome | null = proposed
        ? {
            accepted: proposed.accepted,
            reason: proposed.reason,
            tradeIds: proposed.tradeIds,
            orderStatus: order.status,
          }
        : reconstructed;
      if (!outcome) throw new Error("order_execution_not_committed");

      if (!outcome.accepted && !TERMINAL_ORDER_STATUSES.has(order.status)) {
        throw new Error("order_rejection_not_committed");
      }
      if (TERMINAL_ORDER_STATUSES.has(order.status)) {
        await assertOrderHoldClosedTx(
          client,
          claim.userId,
          claim.holdAsset,
          claim.orderId,
        );
      }

      const updated = await client.query(
        `UPDATE exchange_order_commands
            SET state = 'final',
                result = $3::jsonb,
                locked_at = NULL,
                locked_by = NULL,
                lease_expires_at = NULL,
                finalized_at = NOW(),
                last_error_code = NULL,
                last_error_detail = NULL,
                updated_at = NOW()
          WHERE id = $1::uuid
            AND state = 'processing'
            AND locked_by = $2`,
        [claim.id, workerId, JSON.stringify(outcome)],
      );
      if (!updated.rowCount) throw new Error("order_command_lease_lost");

      await client.query(
        `INSERT INTO exchange_order_command_attempts
          (command_id, attempt_number, worker_id, outcome, metadata, completed_at)
         VALUES ($1::uuid, $2, $3, 'completed', $4::jsonb, NOW())`,
        [
          claim.id,
          claim.attemptCount,
          workerId,
          JSON.stringify({
            accepted: outcome.accepted,
            reason: outcome.reason ?? null,
            orderStatus: outcome.orderStatus,
            tradeCount: outcome.tradeIds.length,
          }),
        ],
      );
      return { status: "final" as const, commandId: claim.id, order, outcome };
    });
    return transaction.enabled
      ? transaction.value
      : { status: "unavailable", commandId: claim.id };
  } catch (error) {
    const code = error instanceof Error ? error.message : "order_finalization_failed";
    await failCommand(claim, workerId, code);
    return {
      status: "queued",
      commandId: claim.id,
      order: await getOrder(claim.orderId, claim.userId),
      reason: code,
    };
  }
}

async function failCommand(
  claim: Claim,
  workerId: string,
  errorCode: string,
): Promise<void> {
  try {
    await withTx(async (client) => {
      const terminal = claim.attemptCount >= claim.maxAttempts;
      const updated = await client.query(
        `UPDATE exchange_order_commands
            SET state = $3,
                available_at = CASE WHEN $3 = 'retryable'
                  THEN NOW() + (LEAST(300, 2 * power(2, GREATEST(0, attempt_count - 1)))::text || ' seconds')::interval
                  ELSE available_at END,
                locked_at = NULL,
                locked_by = NULL,
                lease_expires_at = NULL,
                finalized_at = CASE WHEN $3 = 'failed_terminal' THEN NOW() ELSE NULL END,
                last_error_code = $4,
                last_error_detail = $5,
                updated_at = NOW()
          WHERE id = $1::uuid
            AND state = 'processing'
            AND locked_by = $2`,
        [
          claim.id,
          workerId,
          terminal ? "failed_terminal" : "retryable",
          errorCode.slice(0, 100),
          errorCode.slice(0, 2000),
        ],
      );
      if (!updated.rowCount) return;
      await client.query(
        `INSERT INTO exchange_order_command_attempts
          (command_id, attempt_number, worker_id, outcome, error_code, completed_at)
         VALUES ($1::uuid, $2, $3, $4, $5, NOW())`,
        [
          claim.id,
          claim.attemptCount,
          workerId,
          terminal ? "terminal_failure" : "retryable_failure",
          errorCode.slice(0, 100),
        ],
      );
    });
  } catch (error) {
    logger.error("[exchange-order-command] failure evidence could not be persisted", {
      commandId: claim.id,
      workerId,
      originalError: errorCode,
      persistenceError: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function processExchangeOrderCommand(
  commandId: string,
  workerId: string,
): Promise<ExchangeOrderProcessingResult> {
  const claimed = await claimCommand(commandId, workerId);
  if (claimed.status === "unavailable") {
    return { status: "unavailable", commandId };
  }
  if (claimed.status === "busy") {
    const snapshot = await readExchangeOrderCommand(commandId);
    return {
      status: "processing",
      commandId,
      order: snapshot?.order ?? null,
      reason: snapshot?.state ?? "command_busy",
    };
  }
  if (claimed.status === "final") {
    const order = await getOrder(claimed.row.order_id, claimed.row.user_id);
    const outcome = parseOutcome(claimed.row.result);
    if (!order || !outcome) {
      return { status: "unavailable", commandId };
    }
    return { status: "final", commandId, order, outcome };
  }

  const claim = claimed.claim;
  try {
    const committed = await withDb(async (client) => {
      const order = await getOrderByIdTx(client, claim.orderId);
      if (!order || order.userId !== claim.userId) {
        throw new Error("order_command_authority_corrupt");
      }
      return reconstructCommittedOutcome(client, order);
    });
    if (!committed.enabled) throw new Error("storage_unavailable");
    if (committed.value) {
      return finalizeCommand(claim, workerId);
    }

    const order = await getOrder(claim.orderId, claim.userId);
    if (!order) throw new Error("order_unavailable");
    const engineResult = await getMatchingEngine().placeOrder(order);
    if (
      !engineResult.accepted &&
      ["matching_failed", "storage_unavailable", "market_busy"].includes(
        engineResult.reason ?? "",
      )
    ) {
      throw new Error(engineResult.reason ?? "matching_failed");
    }
    return finalizeCommand(claim, workerId, engineResult);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "matching_failed";
    await failCommand(claim, workerId, reason);
    return {
      status: "queued",
      commandId: claim.id,
      order: await getOrder(claim.orderId, claim.userId),
      reason,
    };
  }
}

export async function readExchangeOrderCommand(commandId: string): Promise<{
  commandId: string;
  state: string;
  order: Order | null;
  outcome: ExchangeOrderCommandOutcome | null;
} | null> {
  const result = await withDb(async (client) => {
    const command = await client.query<CommandRow>(
      "SELECT * FROM exchange_order_commands WHERE id = $1::uuid",
      [commandId],
    );
    const row = command.rows[0];
    if (!row) return null;
    const order = await getOrderByIdTx(client, row.order_id);
    return {
      commandId: row.id,
      state: row.state,
      order,
      outcome: parseOutcome(row.result),
    };
  });
  return result.enabled ? result.value : null;
}

export async function listRecoverableExchangeOrderCommands(
  limit = 50,
): Promise<string[]> {
  const result = await withDb(async (client) => {
    const rows = await client.query<{ id: string }>(
      `SELECT id
         FROM exchange_order_commands
        WHERE (
          state IN ('admitted', 'retryable') AND available_at <= NOW()
        ) OR (
          state = 'processing' AND lease_expires_at <= NOW()
        )
        ORDER BY available_at, created_at
        LIMIT $1`,
      [Math.max(1, Math.min(limit, 200))],
    );
    return rows.rows.map((row) => row.id);
  });
  if (!result.enabled) throw new Error("exchange_order_storage_unavailable");
  return result.value;
}
