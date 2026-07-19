import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import Decimal from "decimal.js";
import { logger } from "@/lib/logger";
import { withDb, withTx } from "@/lib/db";
import { getEventBus, nextSeq } from "@/lib/event-bus";
import type { Order, OrderBookSnapshot, OrderSide, OrderStatus } from "./types";
import type {
  CancelOrderResult,
  MatchingEngineInterface,
  MatchResult,
  PlaceOrderResult,
} from "./matching-engine";
import { getOrderBook } from "./order-book";
import { getMarket } from "./market-service";
import {
  getOrderByIdTx,
  updateOrderFillTx,
} from "./order-service";
import { createTradeTx } from "./trade-service";
import {
  assertOrderHoldClosedTx,
  chargeTradeFeeTx,
  creditTradeFundsTx,
  debitTradeFundsTx,
  getOrderHoldResidualTx,
  releaseMatchedOrderFundsTx,
  releaseOrderHoldResidualTx,
} from "./wallet-service";
import { createTradingEvent } from "./events";
import {
  type EngineOrder,
  getOrderBookStore,
  pkStr,
} from "./order-book-store";
import { rebuildMarketBookFromAuthority } from "./order-book-recovery";
import { withExchangeMarketExecutionLock } from "./market-execution-lock";
import { invalidateStatsCache } from "./market-stats-cache";
import { D } from "./decimal";

const marketLocks = new Map<string, Promise<void>>();

async function withLocalMarketLock<T>(market: string, fn: () => Promise<T>): Promise<T> {
  const previous = marketLocks.get(market) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  marketLocks.set(market, next.then(() => undefined, () => undefined));
  return next;
}

type FillRecord = {
  tradeId: string;
  maker: EngineOrder;
  makerPriceKey: string;
  fillQty: number;
  tradePrice: number;
  makerNewRemaining: number;
  makerNewStatus: OrderStatus;
  buyerOrderId: string;
  sellerOrderId: string;
  buyerUserId: string;
  sellerUserId: string;
  feeBuyer: number;
  feeSeller: number;
  buyerHoldRelease: number;
  sellerHoldRelease: number;
};

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

function computeFills(
  order: Order,
  limitPrice: number,
  isMarket: boolean,
  makerFeeRate: number,
  takerFeeRate: number,
): { records: FillRecord[]; remaining: number; totalFilled: number; vwapNumerator: number } {
  const store = getOrderBookStore();
  const opposite: OrderSide = order.side === "buy" ? "sell" : "buy";
  const levels = store.getLevels(order.market, opposite);
  const records: FillRecord[] = [];
  const makerAllocated = new Map<string, number>();
  let remaining = Number(order.quantity);
  let totalFilled = 0;
  let vwapNumerator = 0;

  outer: for (const level of levels) {
    if (remaining <= 1e-10) break;
    if (!isMarket) {
      if (order.side === "buy" && level.price > limitPrice) break;
      if (order.side === "sell" && level.price < limitPrice) break;
    }

    for (const maker of level.orders) {
      if (remaining <= 1e-10) break outer;
      if (maker.orderId === order.id || maker.userId === order.userId) continue;
      const allocated = makerAllocated.get(maker.orderId) ?? 0;
      const effectiveRemaining = maker.remaining - allocated;
      if (effectiveRemaining <= 1e-10) continue;

      const fillQty = Math.min(remaining, effectiveRemaining);
      const tradePrice = level.price;
      const makerNewRemaining = effectiveRemaining - fillQty;
      const makerNewStatus: OrderStatus = makerNewRemaining <= 1e-10
        ? "FILLED"
        : "PARTIALLY_FILLED";
      const buyerOrderId = order.side === "buy" ? order.id : maker.orderId;
      const sellerOrderId = order.side === "sell" ? order.id : maker.orderId;
      const buyerUserId = order.side === "buy" ? order.userId : maker.userId;
      const sellerUserId = order.side === "sell" ? order.userId : maker.userId;
      const feeBuyer = new Decimal(fillQty)
        .times(tradePrice)
        .times(maker.side === "buy" ? makerFeeRate : takerFeeRate)
        .toNumber();
      const feeSeller = new Decimal(fillQty)
        .times(tradePrice)
        .times(maker.side === "sell" ? makerFeeRate : takerFeeRate)
        .toNumber();
      const effectiveLimit = limitPrice > 0 ? limitPrice : tradePrice;
      const buyerHoldRelease = order.side === "buy"
        ? fillQty * effectiveLimit
        : fillQty * maker.pricePerUnit;

      records.push({
        tradeId: randomUUID(),
        maker,
        makerPriceKey: level.priceKey,
        fillQty,
        tradePrice,
        makerNewRemaining,
        makerNewStatus,
        buyerOrderId,
        sellerOrderId,
        buyerUserId,
        sellerUserId,
        feeBuyer,
        feeSeller,
        buyerHoldRelease,
        sellerHoldRelease: fillQty,
      });
      makerAllocated.set(maker.orderId, allocated + fillQty);
      remaining -= fillQty;
      totalFilled += fillQty;
      vwapNumerator += fillQty * tradePrice;
    }
  }

  return { records, remaining, totalFilled, vwapNumerator };
}

async function commitTerminalOrder(
  order: Order,
  holdAsset: string,
  status: "EXPIRED" | "REJECTED",
  eventType: "OrderExpired" | "OrderRejected",
  reason: string,
): Promise<void> {
  const result = await withTx(async (client) => {
    const locked = await client.query<{ status: string; user_id: string }>(
      `SELECT status, user_id
         FROM orders
        WHERE id = $1::uuid
        FOR UPDATE`,
      [order.id],
    );
    if (!locked.rows[0] || locked.rows[0].user_id !== order.userId) {
      throw new Error("order_authority_missing");
    }

    if (!new Set(["FILLED", "CANCELLED", "EXPIRED", "REJECTED"]).has(locked.rows[0].status)) {
      const updated = await client.query(
        `UPDATE orders
            SET status = $2, version = version + 1, updated_at = NOW()
          WHERE id = $1::uuid AND status IN ('NEW', 'PARTIALLY_FILLED')`,
        [order.id, status],
      );
      if (!updated.rowCount) throw new Error("order_terminal_transition_failed");
      await appendOrderEventTx(client, order.id, eventType, {
        orderId: order.id,
        reason,
      });
    }

    await releaseOrderHoldResidualTx(
      client,
      order.userId,
      holdAsset,
      order.id,
    );
    await assertOrderHoldClosedTx(client, order.userId, holdAsset, order.id);
  });
  if (!result.enabled) throw new Error("storage_unavailable");
}

async function validateLockedOrdersTx(
  client: PoolClient,
  order: Order,
  fills: FillRecord[],
): Promise<void> {
  const incoming = await client.query<{
    status: string;
    remaining_quantity: string;
    user_id: string;
  }>(
    `SELECT status, remaining_quantity::text, user_id
       FROM orders
      WHERE id = $1::uuid
      FOR UPDATE`,
    [order.id],
  );
  const current = incoming.rows[0];
  if (
    !current ||
    current.user_id !== order.userId ||
    current.status !== "NEW" ||
    !D(current.remaining_quantity).eq(order.remainingQuantity)
  ) {
    throw new Error("incoming_order_state_changed");
  }

  const makerIds = [...new Set(fills.map((fill) => fill.maker.orderId))].sort();
  if (!makerIds.length) return;
  const makers = await client.query<{
    id: string;
    status: string;
    remaining_quantity: string;
    user_id: string;
  }>(
    `SELECT id::text, status, remaining_quantity::text, user_id
       FROM orders
      WHERE id = ANY($1::uuid[])
      ORDER BY id
      FOR UPDATE`,
    [makerIds],
  );
  if (makers.rows.length !== makerIds.length) throw new Error("maker_order_missing");
  const byId = new Map(makers.rows.map((row) => [row.id, row]));
  for (const fill of fills) {
    const maker = byId.get(fill.maker.orderId);
    if (
      !maker ||
      maker.user_id !== fill.maker.userId ||
      !["NEW", "PARTIALLY_FILLED"].includes(maker.status) ||
      D(maker.remaining_quantity).lt(fill.fillQty)
    ) {
      throw new Error("maker_order_state_changed");
    }
  }
}

export class InProcessMatchingEngine implements MatchingEngineInterface {
  async placeOrder(order: Order): Promise<PlaceOrderResult> {
    const market = await getMarket(order.market);
    if (!market) {
      return {
        accepted: false,
        orderId: order.id,
        tradeIds: [],
        reason: "storage_unavailable",
      };
    }

    const execution = await withExchangeMarketExecutionLock(
      order.market,
      () => withLocalMarketLock(order.market, () => this.placeOrderLocked(order, market)),
      { tryOnly: true },
    );
    if (!execution.acquired) {
      return {
        accepted: false,
        orderId: order.id,
        tradeIds: [],
        reason: execution.reason,
      };
    }
    return execution.value;
  }

  private async placeOrderLocked(
    order: Order,
    market: NonNullable<Awaited<ReturnType<typeof getMarket>>>,
  ): Promise<PlaceOrderResult> {
    try {
      await rebuildMarketBookFromAuthority(order.market);
    } catch (error) {
      logger.error("[engine] authoritative book rebuild failed", {
        orderId: order.id,
        market: order.market,
        error,
      });
      return { accepted: false, orderId: order.id, tradeIds: [], reason: "storage_unavailable" };
    }

    const store = getOrderBookStore();
    const displayBook = getOrderBook(order.market);
    const admittedEntry = store.findAndRemove(order.id);
    if (admittedEntry) {
      displayBook.cancel(
        admittedEntry.side,
        pkStr(admittedEntry.pricePerUnit),
        admittedEntry.remaining.toFixed(10),
      );
    }

    const baseAsset = market.baseAsset;
    const quoteAsset = market.quoteAsset;
    const makerFeeRate = Number(market.makerFee);
    const takerFeeRate = Number(market.takerFee);
    const isMarket = order.type === "market";
    const isFOK = order.timeInForce === "FOK";
    const isIOC = order.timeInForce === "IOC";
    const isGTC = !isMarket && !isFOK && !isIOC;
    const limitPrice = order.price ? Number(order.price) : 0;
    const holdAsset = order.side === "buy" ? quoteAsset : baseAsset;

    if (isFOK) {
      const available = store.getFOKVolume(order.market, order.side, limitPrice);
      const requested = Number(order.quantity);
      if (available < requested - 1e-10) {
        try {
          await commitTerminalOrder(
            order,
            holdAsset,
            "EXPIRED",
            "OrderExpired",
            "fok_insufficient_liquidity",
          );
          return {
            accepted: false,
            orderId: order.id,
            tradeIds: [],
            reason: "fok_insufficient_liquidity",
          };
        } catch (error) {
          logger.error("[engine] FOK rejection failed closed", { orderId: order.id, error });
          return { accepted: false, orderId: order.id, tradeIds: [], reason: "matching_failed" };
        }
      }
    }

    const fills = computeFills(order, limitPrice, isMarket, makerFeeRate, takerFeeRate);
    const fullyFilled = fills.remaining <= 1e-10;
    const averagePrice = fills.totalFilled > 0
      ? fills.vwapNumerator / fills.totalFilled
      : 0;

    if (isFOK && !fullyFilled) {
      try {
        await commitTerminalOrder(order, holdAsset, "EXPIRED", "OrderExpired", "fok_partial");
        return { accepted: false, orderId: order.id, tradeIds: [], reason: "fok_partial" };
      } catch (error) {
        logger.error("[engine] FOK partial rejection failed closed", { orderId: order.id, error });
        return { accepted: false, orderId: order.id, tradeIds: [], reason: "matching_failed" };
      }
    }

    if (isMarket && order.side === "buy" && fills.totalFilled > 0) {
      const plannedCost = new Decimal(fills.vwapNumerator).toFixed(10);
      const residualResult = await withDb((client) =>
        getOrderHoldResidualTx(client, order.userId, holdAsset, order.id),
      );
      if (!residualResult.enabled) {
        return { accepted: false, orderId: order.id, tradeIds: [], reason: "storage_unavailable" };
      }
      if (D(residualResult.value).lt(plannedCost)) {
        try {
          await commitTerminalOrder(
            order,
            holdAsset,
            "EXPIRED",
            "OrderExpired",
            "market_price_protection",
          );
          return {
            accepted: false,
            orderId: order.id,
            tradeIds: [],
            reason: "market_price_protection",
          };
        } catch (error) {
          logger.error("[engine] market-price rejection failed closed", {
            orderId: order.id,
            error,
          });
          return { accepted: false, orderId: order.id, tradeIds: [], reason: "matching_failed" };
        }
      }
    }

    type TxResult = { accepted: boolean; tradeIds: string[]; reason?: string };
    let committed: TxResult;
    try {
      const transaction = await withTx(async (client): Promise<TxResult> => {
        await validateLockedOrdersTx(client, order, fills.records);
        const tradeIds: string[] = [];

        for (const fill of fills.records) {
          const trade = await createTradeTx(client, {
            id: fill.tradeId,
            market: order.market,
            buyerOrderId: fill.buyerOrderId,
            sellerOrderId: fill.sellerOrderId,
            price: fill.tradePrice,
            quantity: fill.fillQty,
            feeBuyer: fill.feeBuyer,
            feeSeller: fill.feeSeller,
            makerSide: fill.maker.side,
          });
          if (!trade) throw new Error("trade_creation_failed");
          tradeIds.push(fill.tradeId);

          await releaseMatchedOrderFundsTx(
            client,
            fill.buyerUserId,
            quoteAsset,
            fill.buyerHoldRelease,
            fill.buyerOrderId,
          );
          await debitTradeFundsTx(
            client,
            fill.buyerUserId,
            quoteAsset,
            fill.fillQty * fill.tradePrice,
            fill.tradeId,
          );
          await creditTradeFundsTx(
            client,
            fill.buyerUserId,
            baseAsset,
            fill.fillQty,
            fill.tradeId,
          );
          if (fill.feeBuyer > 1e-12) {
            await chargeTradeFeeTx(
              client,
              fill.buyerUserId,
              quoteAsset,
              fill.feeBuyer,
              fill.tradeId,
            );
          }

          await releaseMatchedOrderFundsTx(
            client,
            fill.sellerUserId,
            baseAsset,
            fill.sellerHoldRelease,
            fill.sellerOrderId,
          );
          await debitTradeFundsTx(
            client,
            fill.sellerUserId,
            baseAsset,
            fill.fillQty,
            fill.tradeId,
          );
          await creditTradeFundsTx(
            client,
            fill.sellerUserId,
            quoteAsset,
            fill.fillQty * fill.tradePrice,
            fill.tradeId,
          );
          if (fill.feeSeller > 1e-12) {
            await chargeTradeFeeTx(
              client,
              fill.sellerUserId,
              quoteAsset,
              fill.feeSeller,
              fill.tradeId,
            );
          }

          const makerUpdated = await updateOrderFillTx(
            client,
            fill.maker.orderId,
            fill.fillQty,
            fill.tradePrice,
            fill.makerNewStatus,
          );
          if (!makerUpdated) throw new Error("maker_fill_rejected");
          await appendOrderEventTx(client, fill.maker.orderId, "TradeExecuted", {
            tradeId: fill.tradeId,
            fillQty: fill.fillQty,
            tradePrice: fill.tradePrice,
            newStatus: fill.makerNewStatus,
          });
          await appendOrderEventTx(client, order.id, "TradeExecuted", {
            tradeId: fill.tradeId,
            fillQty: fill.fillQty,
            tradePrice: fill.tradePrice,
          });
          if (fill.makerNewStatus === "FILLED") {
            const makerHoldAsset = fill.maker.side === "buy" ? quoteAsset : baseAsset;
            await releaseOrderHoldResidualTx(
              client,
              fill.maker.userId,
              makerHoldAsset,
              fill.maker.orderId,
            );
            await assertOrderHoldClosedTx(
              client,
              fill.maker.userId,
              makerHoldAsset,
              fill.maker.orderId,
            );
          }
        }

        if (fullyFilled) {
          const updated = await updateOrderFillTx(
            client,
            order.id,
            fills.totalFilled,
            averagePrice,
            "FILLED",
          );
          if (!updated) throw new Error("taker_fill_rejected");
          await releaseOrderHoldResidualTx(client, order.userId, holdAsset, order.id);
          await assertOrderHoldClosedTx(client, order.userId, holdAsset, order.id);
          await appendOrderEventTx(client, order.id, "OrderFilled", {
            orderId: order.id,
            market: order.market,
            filledQty: fills.totalFilled.toFixed(10),
            avgFillPrice: averagePrice.toFixed(10),
          });
          return { accepted: true, tradeIds };
        }

        if (fills.totalFilled > 0) {
          const status: OrderStatus = isGTC ? "PARTIALLY_FILLED" : "CANCELLED";
          const updated = await updateOrderFillTx(
            client,
            order.id,
            fills.totalFilled,
            averagePrice,
            status,
          );
          if (!updated) throw new Error("taker_fill_rejected");
          if (isGTC) {
            await appendOrderEventTx(client, order.id, "OrderPartiallyFilled", {
              orderId: order.id,
              market: order.market,
              filledQty: fills.totalFilled.toFixed(10),
              remainingQty: fills.remaining.toFixed(10),
              avgFillPrice: averagePrice.toFixed(10),
            });
          } else {
            await releaseOrderHoldResidualTx(client, order.userId, holdAsset, order.id);
            await assertOrderHoldClosedTx(client, order.userId, holdAsset, order.id);
            await appendOrderEventTx(client, order.id, "OrderExpired", {
              orderId: order.id,
              reason: "ioc_remainder",
            });
          }
          return { accepted: true, tradeIds };
        }

        if (isGTC) {
          await appendOrderEventTx(client, order.id, "OrderAccepted", {
            orderId: order.id,
          });
          return { accepted: true, tradeIds };
        }

        const expired = await client.query(
          `UPDATE orders
              SET status = 'EXPIRED', version = version + 1, updated_at = NOW()
            WHERE id = $1::uuid AND status = 'NEW'`,
          [order.id],
        );
        if (!expired.rowCount) throw new Error("order_expiry_transition_failed");
        await releaseOrderHoldResidualTx(client, order.userId, holdAsset, order.id);
        await assertOrderHoldClosedTx(client, order.userId, holdAsset, order.id);
        await appendOrderEventTx(client, order.id, "OrderExpired", {
          orderId: order.id,
          reason: "no_liquidity",
        });
        return { accepted: false, tradeIds, reason: "no_liquidity" };
      });
      if (!transaction.enabled) {
        return { accepted: false, orderId: order.id, tradeIds: [], reason: "storage_unavailable" };
      }
      committed = transaction.value;
    } catch (error) {
      logger.error("[engine] matching transaction rolled back", {
        orderId: order.id,
        market: order.market,
        error,
      });
      try {
        await rebuildMarketBookFromAuthority(order.market);
      } catch {
        // The command remains retryable; recovery will attempt another rebuild.
      }
      return { accepted: false, orderId: order.id, tradeIds: [], reason: "matching_failed" };
    }

    try {
      await rebuildMarketBookFromAuthority(order.market);
    } catch (error) {
      logger.error("[engine] post-commit book rebuild failed", {
        orderId: order.id,
        market: order.market,
        error,
      });
    }

    const event = createTradingEvent(
      committed.accepted ? "OrderAccepted" : "OrderExpired",
      { orderId: order.id, market: order.market },
    );
    logger.info("[engine] order committed", {
      eventId: event.eventId,
      orderId: order.id,
      market: order.market,
      accepted: committed.accepted,
      tradeCount: committed.tradeIds.length,
    });
    this.emitCommittedEvents(order, fills.records, committed, averagePrice);

    return {
      accepted: committed.accepted,
      orderId: order.id,
      tradeIds: committed.tradeIds,
      reason: committed.reason,
    };
  }

  private emitCommittedEvents(
    order: Order,
    fills: FillRecord[],
    result: { accepted: boolean; tradeIds: string[]; reason?: string },
    averagePrice: number,
  ): void {
    if (!result.accepted || fills.length === 0) return;
    const bus = getEventBus();
    invalidateStatsCache(order.market);
    for (const fill of fills) {
      const executedAt = new Date().toISOString();
      bus.emit("trade:executed", {
        tradeId: fill.tradeId,
        market: order.market,
        price: fill.tradePrice.toFixed(10),
        quantity: fill.fillQty.toFixed(10),
        buyerOrderId: fill.buyerOrderId,
        sellerOrderId: fill.sellerOrderId,
        buyerUserId: fill.buyerUserId,
        sellerUserId: fill.sellerUserId,
        makerSide: fill.maker.side,
        executedAt,
      });
      bus.emit("order:updated", {
        orderId: fill.maker.orderId,
        userId: fill.maker.userId,
        market: order.market,
        status: fill.makerNewStatus,
        filledQuantity: (fill.maker.originalQty - fill.makerNewRemaining).toFixed(10),
        remainingQuantity: fill.makerNewRemaining.toFixed(10),
        avgFillPrice: fill.tradePrice.toFixed(10),
      });
    }
    bus.emit("order:updated", {
      orderId: order.id,
      userId: order.userId,
      market: order.market,
      status: fills.reduce((sum, fill) => sum + fill.fillQty, 0) >= Number(order.quantity) - 1e-10
        ? "FILLED"
        : "PARTIALLY_FILLED",
      filledQuantity: fills.reduce((sum, fill) => sum + fill.fillQty, 0).toFixed(10),
      remainingQuantity: Math.max(
        0,
        Number(order.quantity) - fills.reduce((sum, fill) => sum + fill.fillQty, 0),
      ).toFixed(10),
      avgFillPrice: averagePrice > 0 ? averagePrice.toFixed(10) : null,
    });
    bus.emit("orderbook:changed", {
      market: order.market,
      snapshot: getOrderBook(order.market).snapshot(50),
      seqNum: nextSeq(order.market),
    });
  }

  async cancelOrder(orderId: string, userId: string): Promise<CancelOrderResult> {
    const lookup = await withDb(async (client) => {
      const row = await client.query<{ market: string }>(
        "SELECT market FROM orders WHERE id = $1::uuid AND user_id = $2",
        [orderId, userId],
      );
      return row.rows[0]?.market ?? null;
    });
    if (!lookup.enabled) return { cancelled: false, orderId, reason: "storage_unavailable" };
    if (!lookup.value) return { cancelled: false, orderId, reason: "order_not_found" };

    const execution = await withExchangeMarketExecutionLock(
      lookup.value,
      () => withLocalMarketLock(lookup.value!, async () => {
        try {
          const transaction = await withTx(async (client) => {
            const order = await getOrderByIdTx(client, orderId);
            if (!order || order.userId !== userId) {
              return { ok: false as const, reason: "order_not_found" };
            }
            if (!["NEW", "PARTIALLY_FILLED"].includes(order.status)) {
              return { ok: false as const, reason: "order_already_terminal" };
            }
            const command = await client.query<{ state: string; hold_asset: string }>(
              `SELECT state, hold_asset
                 FROM exchange_order_commands
                WHERE order_id = $1::uuid
                FOR SHARE`,
              [orderId],
            );
            if (!command.rows[0] || command.rows[0].state !== "final") {
              return { ok: false as const, reason: "order_processing" };
            }

            const updated = await client.query(
              `UPDATE orders
                  SET status = 'CANCELLED', version = version + 1, updated_at = NOW()
                WHERE id = $1::uuid
                  AND user_id = $2
                  AND status IN ('NEW', 'PARTIALLY_FILLED')`,
              [orderId, userId],
            );
            if (!updated.rowCount) throw new Error("order_cancel_race_lost");
            await releaseOrderHoldResidualTx(
              client,
              userId,
              command.rows[0].hold_asset,
              orderId,
            );
            await assertOrderHoldClosedTx(
              client,
              userId,
              command.rows[0].hold_asset,
              orderId,
            );
            await appendOrderEventTx(client, orderId, "OrderCancelled", {
              orderId,
              userId,
              cancelledBy: "user",
            });
            return { ok: true as const, market: order.market };
          });
          if (!transaction.enabled) {
            return { cancelled: false, orderId, reason: "storage_unavailable" };
          }
          if (!transaction.value.ok) {
            return { cancelled: false, orderId, reason: transaction.value.reason };
          }

          await rebuildMarketBookFromAuthority(transaction.value.market);
          const event = createTradingEvent("OrderCancelled", {
            orderId,
            userId,
            market: transaction.value.market,
            cancelledBy: "user",
          });
          logger.info("[engine] OrderCancelled", { eventId: event.eventId, orderId });
          const bus = getEventBus();
          bus.emit("order:updated", {
            orderId,
            userId,
            market: transaction.value.market,
            status: "CANCELLED",
            filledQuantity: "0",
            remainingQuantity: "0",
            avgFillPrice: null,
          });
          bus.emit("orderbook:changed", {
            market: transaction.value.market,
            snapshot: getOrderBook(transaction.value.market).snapshot(50),
            seqNum: nextSeq(transaction.value.market),
          });
          return { cancelled: true, orderId };
        } catch (error) {
          logger.error("[engine] cancelOrder failed closed", { orderId, error });
          return { cancelled: false, orderId, reason: "cancel_failed" };
        }
      }),
      { tryOnly: true },
    );
    if (!execution.acquired) {
      return { cancelled: false, orderId, reason: execution.reason };
    }
    return execution.value;
  }

  async match(market: string): Promise<MatchResult> {
    return { market, trades: [], matched: 0 };
  }

  async snapshot(market: string, depth = 20): Promise<OrderBookSnapshot> {
    return getOrderBook(market).snapshot(depth);
  }
}

declare global {
  var tecpeyMatchingEngine: InProcessMatchingEngine | undefined;
}

export function getMatchingEngine(): MatchingEngineInterface {
  if (!globalThis.tecpeyMatchingEngine) {
    globalThis.tecpeyMatchingEngine = new InProcessMatchingEngine();
  }
  return globalThis.tecpeyMatchingEngine;
}
