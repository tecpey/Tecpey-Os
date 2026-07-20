import { withDb, withTx } from "@/lib/db";
import { getEventBus, nextSeq } from "@/lib/event-bus";
import { logger } from "@/lib/logger";
import { PLATFORM } from "@/lib/platform-config";
import {
  claimApiCommandTx,
  completeApiCommandTx,
  type ApiCommandScope,
} from "@/lib/security/api-command-idempotency";
import { createTradingEvent } from "./events";
import { getOrderBook } from "./order-book";
import { rebuildMarketBookFromAuthority } from "./order-book-recovery";
import { getOrderByIdTx } from "./order-service";
import { withExchangeMarketExecutionLock } from "./market-execution-lock";
import { invalidateStatsCache } from "./market-stats-cache";
import {
  assertOrderHoldClosedTx,
  releaseOrderHoldResidualTx,
} from "./wallet-service";

export type IdempotentOrderCancelResult =
  | { cancelled: true; orderId: string; replayed: boolean }
  | { cancelled: false; orderId: string; reason: string };

type OrderCancelReceipt = {
  cancelled: boolean;
  orderId: string;
  reason?: string;
  market?: string;
};

class OrderCancelError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

async function completeFailure(
  client: import("pg").PoolClient,
  scope: ApiCommandScope,
  orderId: string,
  reason: string,
): Promise<{ ok: false; reason: string; replayed: false }> {
  await completeApiCommandTx(client, scope, {
    httpStatus: reason === "order_not_found" ? 404 : 409,
    response: { cancelled: false, orderId, reason },
  });
  return { ok: false, reason, replayed: false };
}

export async function cancelOrderIdempotently(input: {
  orderId: string;
  userId: string;
  idempotencyKey: string;
  requestHash: string;
}): Promise<IdempotentOrderCancelResult> {
  const lookup = await withDb(async (client) => {
    const row = await client.query<{ market: string }>(
      "SELECT market FROM orders WHERE id = $1::uuid AND user_id = $2",
      [input.orderId, input.userId],
    );
    return row.rows[0]?.market ?? null;
  });
  if (!lookup.enabled) {
    return {
      cancelled: false,
      orderId: input.orderId,
      reason: "storage_unavailable",
    };
  }
  if (!lookup.value) {
    return {
      cancelled: false,
      orderId: input.orderId,
      reason: "order_not_found",
    };
  }

  const scope: ApiCommandScope = {
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    principalType: "user",
    principalId: input.userId,
    operation: "order.cancel",
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
  };

  const execution = await withExchangeMarketExecutionLock(
    lookup.value,
    async () => {
      try {
        const transaction = await withTx(async (client) => {
          const claim = await claimApiCommandTx<OrderCancelReceipt>(client, scope);
          if (claim.status === "conflict") {
            return { ok: false as const, reason: "idempotency_conflict", replayed: false };
          }
          if (claim.status === "in_progress") {
            throw new OrderCancelError("idempotency_in_progress");
          }
          if (claim.status === "replayed") {
            return {
              ok: claim.response.cancelled,
              reason: claim.response.reason,
              market: claim.response.market,
              replayed: true,
            };
          }

          const order = await getOrderByIdTx(client, input.orderId);
          if (!order || order.userId !== input.userId) {
            return completeFailure(
              client,
              scope,
              input.orderId,
              "order_not_found",
            );
          }
          if (!["NEW", "PARTIALLY_FILLED"].includes(order.status)) {
            return completeFailure(
              client,
              scope,
              input.orderId,
              "order_already_terminal",
            );
          }

          const command = await client.query<{
            state: string;
            hold_asset: string;
          }>(
            `SELECT state, hold_asset
               FROM exchange_order_commands
              WHERE order_id = $1::uuid
              FOR SHARE`,
            [input.orderId],
          );
          if (!command.rows[0] || command.rows[0].state !== "final") {
            throw new OrderCancelError("order_processing");
          }

          const updated = await client.query(
            `UPDATE orders
                SET status = 'CANCELLED', version = version + 1, updated_at = NOW()
              WHERE id = $1::uuid
                AND user_id = $2
                AND status IN ('NEW', 'PARTIALLY_FILLED')`,
            [input.orderId, input.userId],
          );
          if ((updated.rowCount ?? 0) !== 1) {
            throw new OrderCancelError("order_cancel_race_lost");
          }

          await releaseOrderHoldResidualTx(
            client,
            input.userId,
            command.rows[0].hold_asset,
            input.orderId,
          );
          await assertOrderHoldClosedTx(
            client,
            input.userId,
            command.rows[0].hold_asset,
            input.orderId,
          );
          await client.query(
            `INSERT INTO order_events (order_id, event_type, payload)
             VALUES ($1::uuid, 'OrderCancelled', $2::jsonb)`,
            [
              input.orderId,
              JSON.stringify({
                orderId: input.orderId,
                userId: input.userId,
                cancelledBy: "user",
              }),
            ],
          );
          await completeApiCommandTx(client, scope, {
            httpStatus: 200,
            response: {
              cancelled: true,
              orderId: input.orderId,
              market: order.market,
            },
          });
          return {
            ok: true as const,
            market: order.market,
            replayed: false,
          };
        });

        if (!transaction.enabled) {
          return {
            cancelled: false as const,
            orderId: input.orderId,
            reason: "storage_unavailable",
          };
        }
        if (!transaction.value.ok) {
          return {
            cancelled: false as const,
            orderId: input.orderId,
            reason: transaction.value.reason ?? "cancel_failed",
          };
        }
        if (transaction.value.replayed) {
          return {
            cancelled: true as const,
            orderId: input.orderId,
            replayed: true,
          };
        }

        await rebuildMarketBookFromAuthority(transaction.value.market!);
        const event = createTradingEvent("OrderCancelled", {
          orderId: input.orderId,
          userId: input.userId,
          market: transaction.value.market!,
          cancelledBy: "user",
        });
        logger.info("[order-cancel-authority] OrderCancelled", {
          eventId: event.eventId,
          orderId: input.orderId,
        });
        const bus = getEventBus();
        bus.emit("order:updated", {
          orderId: input.orderId,
          userId: input.userId,
          market: transaction.value.market!,
          status: "CANCELLED",
          filledQuantity: "0",
          remainingQuantity: "0",
          avgFillPrice: null,
        });
        bus.emit("orderbook:changed", {
          market: transaction.value.market!,
          snapshot: getOrderBook(transaction.value.market!).snapshot(50),
          seqNum: nextSeq(transaction.value.market!),
        });
        invalidateStatsCache(transaction.value.market!);
        return {
          cancelled: true as const,
          orderId: input.orderId,
          replayed: false,
        };
      } catch (error) {
        if (error instanceof OrderCancelError) {
          return {
            cancelled: false as const,
            orderId: input.orderId,
            reason: error.reason,
          };
        }
        logger.error("[order-cancel-authority] failed closed", {
          orderId: input.orderId,
          error,
        });
        return {
          cancelled: false as const,
          orderId: input.orderId,
          reason: "cancel_failed",
        };
      }
    },
  );

  if (!execution.acquired) {
    return {
      cancelled: false,
      orderId: input.orderId,
      reason: execution.reason,
    };
  }
  return execution.value;
}
