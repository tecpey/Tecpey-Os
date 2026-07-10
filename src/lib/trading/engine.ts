import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { logger } from "@/lib/logger";
import { withTx } from "@/lib/db";
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
  setOrderStatusTx,
} from "./order-service";
import { createTradeTx } from "./trade-service";
import {
  releaseFundsTx,
  debitFundsTx,
  creditFundsTx,
  chargeFeeTx,
} from "./wallet-balance-service";
import { createTradingEvent } from "./events";
import {
  type EngineOrder,
  getOrderBookStore,
  rebuildOrderBook,
  pkStr,
} from "./order-book-store";
import { getEventBus, nextSeq } from "@/lib/event-bus";
import { invalidateStatsCache } from "./market-stats-cache";

// ── Per-market execution lock ─────────────────────────────────────────────────
//
// Serializes placeOrder calls per market so no two matching passes run
// concurrently for the same market. Uses a Promise chain — each call waits
// for the previous one to complete before starting its critical section.
// Market count is bounded (10-100), so the Map never leaks meaningfully.

const marketLocks = new Map<string, Promise<void>>();

async function withMarketLock<T>(market: string, fn: () => Promise<T>): Promise<T> {
  const prev = marketLocks.get(market) ?? Promise.resolve();
  const next = prev.then(() => fn(), () => fn());
  marketLocks.set(market, next.then(() => {}, () => {}));
  return next;
}

// ── Fill record ───────────────────────────────────────────────────────────────
//
// Pre-computed in a pure pass over the in-memory book — zero DB calls.
// The single Postgres transaction uses these records to write all fills atomically.

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

// ── Audit helper ──────────────────────────────────────────────────────────────

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

// ── Hold lookup (inside tx) ───────────────────────────────────────────────────

async function queryOriginalHold(
  client: PoolClient,
  userId: string,
  asset: string,
  orderId: string,
): Promise<number> {
  const rows = await client.query<{ amount: string }>(
    `SELECT amount FROM wallet_ledger
     WHERE wallet_id = $1 AND asset = $2 AND type = 'hold' AND reference_id = $3::uuid
     LIMIT 1`,
    [userId, asset, orderId],
  );
  return rows.rows[0] ? parseFloat(rows.rows[0].amount) : 0;
}

// ── Fill computation (pure — no DB) ──────────────────────────────────────────
//
// Iterates the in-memory book levels to determine fills.
// Book mutations happen only AFTER the DB transaction commits.

function computeFills(
  order: Order,
  limitPrice: number,
  isMarket: boolean,
  makerFeeRate: number,
  takerFeeRate: number,
): { records: FillRecord[]; remaining: number; totalFilled: number; vwapNumerator: number } {
  const store   = getOrderBookStore();
  const oppSide: OrderSide = order.side === "buy" ? "sell" : "buy";
  const levels  = store.getLevels(order.market, oppSide);

  const records: FillRecord[] = [];
  let remaining     = parseFloat(order.quantity);
  let totalFilled   = 0;
  let vwapNumerator = 0;
  const makerAllocated = new Map<string, number>(); // qty allocated per maker in this pass

  outer: for (const level of levels) {
    if (remaining <= 1e-10) break;
    if (!isMarket) {
      if (order.side === "buy"  && level.price > limitPrice) break;
      if (order.side === "sell" && level.price < limitPrice) break;
    }

    for (const maker of level.orders) {
      if (remaining <= 1e-10) break outer;
      const allocated        = makerAllocated.get(maker.orderId) ?? 0;
      const effectiveRem     = maker.remaining - allocated;
      if (effectiveRem <= 1e-10) continue;

      const fillQty        = Math.min(remaining, effectiveRem);
      const tradePrice     = level.price;
      const makerNewRem    = effectiveRem - fillQty;
      const makerNewStatus: OrderStatus = makerNewRem <= 1e-10 ? "FILLED" : "PARTIALLY_FILLED";

      const buyerOrderId  = order.side === "buy"  ? order.id     : maker.orderId;
      const sellerOrderId = order.side === "sell" ? order.id     : maker.orderId;
      const buyerUserId   = order.side === "buy"  ? order.userId : maker.userId;
      const sellerUserId  = order.side === "sell" ? order.userId : maker.userId;

      const feeBuyer  = fillQty * tradePrice * (maker.side === "buy"  ? makerFeeRate : takerFeeRate);
      const feeSeller = fillQty * tradePrice * (maker.side === "sell" ? makerFeeRate : takerFeeRate);

      // Market orders have limitPrice=0 — use tradePrice as release basis
      // so the earmarked funds are properly returned on each fill.
      const effectiveLimit    = limitPrice > 0 ? limitPrice : tradePrice;
      const buyerHoldRelease  = order.side === "buy"
        ? fillQty * effectiveLimit       // incoming BUY: held at limit (or trade) price
        : fillQty * maker.pricePerUnit;  // maker BUY: held at their limit price
      const sellerHoldRelease = fillQty; // sellers always hold base asset qty

      records.push({
        tradeId: randomUUID(),
        maker,
        makerPriceKey: level.priceKey,
        fillQty,
        tradePrice,
        makerNewRemaining: makerNewRem,
        makerNewStatus,
        buyerOrderId,
        sellerOrderId,
        buyerUserId,
        sellerUserId,
        feeBuyer,
        feeSeller,
        buyerHoldRelease,
        sellerHoldRelease,
      });

      makerAllocated.set(maker.orderId, allocated + fillQty);
      remaining     -= fillQty;
      totalFilled   += fillQty;
      vwapNumerator += fillQty * tradePrice;
    }
  }

  return { records, remaining, totalFilled, vwapNumerator };
}

// ── In-process matching engine ────────────────────────────────────────────────
//
// Price-time priority FIFO matching.
// Phase 30 additions:
//   - Pre-tx fill computation (pure, reads in-memory book)
//   - Single Postgres transaction for all DB writes in a match sequence
//   - Atomic balance operations via wallet_balances table
//   - In-memory book updates happen post-tx commit
//   - Warm-start recovery from DB on empty book

export class InProcessMatchingEngine implements MatchingEngineInterface {
  private async ensureBookReady(market: string): Promise<void> {
    const store = getOrderBookStore();
    if (
      store.getLevels(market, "buy").length  === 0 &&
      store.getLevels(market, "sell").length === 0
    ) {
      await rebuildOrderBook(market);
    }
  }

  async placeOrder(order: Order): Promise<PlaceOrderResult> {
    const market = await getMarket(order.market);
    if (!market) {
      logger.warn("[engine] market not found", { market: order.market });
      try {
        await withTx(async (client) => {
          await setOrderStatusTx(client, order.id, "REJECTED");
          await appendOrderEventTx(client, order.id, "OrderRejected", {
            orderId: order.id, reason: "market_not_found",
          });
          return true;
        });
      } catch { /* best-effort */ }
      return { accepted: false, orderId: order.id, tradeIds: [], reason: "market_not_found" };
    }

    const baseAsset    = market.baseAsset;
    const quoteAsset   = market.quoteAsset;
    const makerFeeRate = parseFloat(market.makerFee);
    const takerFeeRate = parseFloat(market.takerFee);
    const isMarket = order.type === "market";
    const isFOK    = order.timeInForce === "FOK";
    const isIOC    = order.timeInForce === "IOC";
    const isGTC    = !isMarket && !isFOK && !isIOC;
    const limitPrice = order.price ? parseFloat(order.price) : 0;
    const holdAsset  = order.side === "buy" ? quoteAsset : baseAsset;

    // ── Serialized per-market execution ──────────────────────────────────
    // Only one placeOrder runs the critical section per market at a time.
    return withMarketLock(order.market, async () => {
      await this.ensureBookReady(order.market);

      const store       = getOrderBookStore();
      const displayBook = getOrderBook(order.market);

    // ── FOK pre-flight ────────────────────────────────────────────────────────
    if (isFOK) {
      const available = store.getFOKVolume(order.market, order.side, limitPrice);
      const requested = parseFloat(order.quantity);
      if (available < requested - 1e-10) {
        logger.info("[engine] FOK rejected — insufficient liquidity", {
          orderId: order.id, available, requested,
        });
        const holdAmt = order.side === "buy" ? limitPrice * requested : requested;
        try {
          await withTx(async (client) => {
            await setOrderStatusTx(client, order.id, "EXPIRED");
            await releaseFundsTx(client, order.userId, holdAsset, holdAmt, order.id);
            await appendOrderEventTx(client, order.id, "OrderExpired", {
              orderId: order.id, reason: "fok_insufficient_liquidity",
            });
            return true;
          });
        } catch (err) {
          logger.error("[engine] FOK rejection tx failed", { orderId: order.id, err });
        }
        const ev = createTradingEvent("OrderExpired", { orderId: order.id, market: order.market });
        logger.info("[engine] OrderExpired (FOK)", { eventId: ev.eventId, orderId: order.id });
        return { accepted: false, orderId: order.id, tradeIds: [], reason: "fok_insufficient_liquidity" };
      }
    }

    // ── Compute fills (pure) ──────────────────────────────────────────────────
    const fills       = computeFills(order, limitPrice, isMarket, makerFeeRate, takerFeeRate);
    const fullyFilled = fills.remaining <= 1e-10;
    const avgPrice    = fills.totalFilled > 0 ? fills.vwapNumerator / fills.totalFilled : 0;

    // Safety re-check for FOK (guards against book state diverging from pre-flight).
    if (isFOK && fills.remaining > 1e-10) {
      const holdAmt = order.side === "buy" ? limitPrice * parseFloat(order.quantity) : parseFloat(order.quantity);
      try {
        await withTx(async (client) => {
          await setOrderStatusTx(client, order.id, "EXPIRED");
          await releaseFundsTx(client, order.userId, holdAsset, holdAmt, order.id);
          await appendOrderEventTx(client, order.id, "OrderExpired", { orderId: order.id, reason: "fok_partial" });
          return true;
        });
      } catch { /* best-effort */ }
      return { accepted: false, orderId: order.id, tradeIds: [], reason: "fok_partial" };
    }

    // ── Single Postgres transaction ───────────────────────────────────────────
    type TxReturn = { tradeIds: string[]; accepted: boolean; reason?: string };

    let txReturn: TxReturn;
    try {
      const txResult = await withTx(async (client): Promise<TxReturn> => {
        const ids: string[] = [];

        for (const fill of fills.records) {
          // Trade record
          const trade = await createTradeTx(client, {
            id:            fill.tradeId,
            market:        order.market,
            buyerOrderId:  fill.buyerOrderId,
            sellerOrderId: fill.sellerOrderId,
            price:         fill.tradePrice,
            quantity:      fill.fillQty,
            feeBuyer:      fill.feeBuyer,
            feeSeller:     fill.feeSeller,
            makerSide:     fill.maker.side,
          });
          if (!trade) throw new Error("trade_creation_failed");
          ids.push(fill.tradeId);

          // Buyer: release held → debit actual cost → credit received asset → fee
          await releaseFundsTx(client, fill.buyerUserId, quoteAsset, fill.buyerHoldRelease,  fill.buyerOrderId);
          await debitFundsTx  (client, fill.buyerUserId, quoteAsset, fill.fillQty * fill.tradePrice, fill.tradeId);
          await creditFundsTx (client, fill.buyerUserId, baseAsset,  fill.fillQty,                   fill.tradeId);
          if (fill.feeBuyer  > 1e-12) await chargeFeeTx(client, fill.buyerUserId,  quoteAsset, fill.feeBuyer,  fill.tradeId);

          // Seller: release held base → debit qty → credit quote → fee
          await releaseFundsTx(client, fill.sellerUserId, baseAsset,  fill.sellerHoldRelease, fill.sellerOrderId);
          await debitFundsTx  (client, fill.sellerUserId, baseAsset,  fill.fillQty,                   fill.tradeId);
          await creditFundsTx (client, fill.sellerUserId, quoteAsset, fill.fillQty * fill.tradePrice, fill.tradeId);
          if (fill.feeSeller > 1e-12) await chargeFeeTx(client, fill.sellerUserId, quoteAsset, fill.feeSeller, fill.tradeId);

          // Update maker order + audit
          const makerUpdated = await updateOrderFillTx(client, fill.maker.orderId, fill.fillQty, fill.tradePrice, fill.makerNewStatus);
          if (!makerUpdated) throw new Error("maker_fill_rejected");
          await appendOrderEventTx(client, fill.maker.orderId, "TradeExecuted", {
            tradeId: fill.tradeId, fillQty: fill.fillQty, tradePrice: fill.tradePrice, newStatus: fill.makerNewStatus,
          });
          await appendOrderEventTx(client, order.id, "TradeExecuted", {
            tradeId: fill.tradeId, fillQty: fill.fillQty, tradePrice: fill.tradePrice,
          });
        }

        // Finalise incoming order
        if (fullyFilled) {
          const takerUpdated = await updateOrderFillTx(client, order.id, fills.totalFilled, avgPrice, "FILLED");
          if (!takerUpdated) throw new Error("taker_fill_rejected");
          await appendOrderEventTx(client, order.id, "OrderFilled", {
            orderId: order.id, market: order.market,
            filledQty: fills.totalFilled.toFixed(10), avgFillPrice: avgPrice.toFixed(10),
          });
          return { tradeIds: ids, accepted: true };

        } else if (fills.totalFilled > 0) {
          const partialStatus: OrderStatus = isGTC ? "PARTIALLY_FILLED" : "CANCELLED";
          const takerPartialUpdated = await updateOrderFillTx(client, order.id, fills.totalFilled, avgPrice, partialStatus);
          if (!takerPartialUpdated) throw new Error("taker_fill_rejected");

          if (!isGTC) {
            // Release unfilled portion of hold.
            const orig     = await queryOriginalHold(client, order.userId, holdAsset, order.id);
            const released = fills.records.reduce(
              (s, f) => s + (order.side === "buy" ? f.buyerHoldRelease : f.sellerHoldRelease), 0,
            );
            const rem = Math.max(0, orig - released);
            if (rem > 0) await releaseFundsTx(client, order.userId, holdAsset, rem, order.id);
            await appendOrderEventTx(client, order.id, "OrderExpired", { orderId: order.id, reason: "ioc_remainder" });
          } else {
            await appendOrderEventTx(client, order.id, "OrderPartiallyFilled", {
              orderId: order.id, market: order.market,
              filledQty: fills.totalFilled.toFixed(10),
              remainingQty: fills.remaining.toFixed(10),
              avgFillPrice: avgPrice.toFixed(10),
            });
          }
          return { tradeIds: ids, accepted: true };

        } else {
          // Zero fills
          if (isGTC) {
            await appendOrderEventTx(client, order.id, "OrderAccepted", { orderId: order.id });
            return { tradeIds: ids, accepted: true };
          } else {
            await setOrderStatusTx(client, order.id, "EXPIRED");
            const holdAmt = await queryOriginalHold(client, order.userId, holdAsset, order.id);
            if (holdAmt > 0) await releaseFundsTx(client, order.userId, holdAsset, holdAmt, order.id);
            await appendOrderEventTx(client, order.id, "OrderExpired", { orderId: order.id, reason: "no_liquidity" });
            return { tradeIds: ids, accepted: false, reason: "no_liquidity" };
          }
        }
      });

      if (!txResult.enabled) {
        logger.error("[engine] placeOrder tx unavailable", { orderId: order.id });
        return { accepted: false, orderId: order.id, tradeIds: [], reason: "storage_unavailable" };
      }
      txReturn = txResult.value;
    } catch (err) {
      logger.error("[engine] placeOrder tx rolled back", { orderId: order.id, err });
      return { accepted: false, orderId: order.id, tradeIds: [], reason: "matching_failed" };
    }

    // ── Post-tx: update in-memory book ────────────────────────────────────────
    for (const fill of fills.records) {
      store.updateMakerRemaining(fill.maker.orderId, fill.makerNewRemaining);
      displayBook.cancel(fill.maker.side, fill.makerPriceKey, fill.fillQty.toFixed(10));
    }

    if (!fullyFilled && isGTC && fills.remaining > 1e-10) {
      const entry: EngineOrder = {
        orderId:      order.id,
        userId:       order.userId,
        market:       order.market,
        side:         order.side,
        pricePerUnit: limitPrice,
        originalQty:  parseFloat(order.quantity),
        remaining:    fills.remaining,
        ts:           Date.now(),
      };
      store.insert(order.market, entry);
      displayBook.insert(order.side, pkStr(limitPrice), fills.remaining.toFixed(10));
    }

    const suffix = fullyFilled ? "filled" : (fills.totalFilled > 0 ? "partial" : "resting");
    const ev = createTradingEvent(txReturn.accepted ? "OrderAccepted" : "OrderExpired", {
      orderId: order.id, market: order.market,
    });
    logger.info("[engine] order processed", {
      eventId: ev.eventId, orderId: order.id, suffix,
      accepted: txReturn.accepted, tradeCount: txReturn.tradeIds.length,
    });

    // ── Post-tx: event bus emissions ──────────────────────────────────────────
    if (txReturn.accepted && fills.records.length > 0) {
      const bus = getEventBus();
      const mkt = await getMarket(order.market);
      invalidateStatsCache(order.market);

      for (const fill of fills.records) {
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
        // Wallet change signals (client re-fetches balance)
        if (mkt) {
          bus.emit("wallet:changed", { userId: fill.buyerUserId, asset: mkt.quoteAsset });
          bus.emit("wallet:changed", { userId: fill.buyerUserId, asset: mkt.baseAsset });
          bus.emit("wallet:changed", { userId: fill.sellerUserId, asset: mkt.quoteAsset });
          bus.emit("wallet:changed", { userId: fill.sellerUserId, asset: mkt.baseAsset });
        }
        // Maker order update
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

      // Taker order update
      const takerFinalStatus: OrderStatus = fullyFilled
        ? "FILLED"
        : fills.totalFilled > 0 && isGTC ? "PARTIALLY_FILLED" : "CANCELLED";
      bus.emit("order:updated", {
        orderId: order.id,
        userId: order.userId,
        market: order.market,
        status: takerFinalStatus,
        filledQuantity: fills.totalFilled.toFixed(10),
        remainingQuantity: fills.remaining.toFixed(10),
        avgFillPrice: avgPrice > 0 ? avgPrice.toFixed(10) : null,
      });

      // Order book snapshot after all mutations
      bus.emit("orderbook:changed", {
        market: order.market,
        snapshot: displayBook.snapshot(50),
        seqNum: nextSeq(order.market),
      });
    }

    return {
      accepted: txReturn.accepted,
      orderId:  order.id,
      tradeIds: txReturn.tradeIds,
      reason:   txReturn.reason,
    };
    });
  }

  async cancelOrder(orderId: string, userId: string): Promise<CancelOrderResult> {
    const store = getOrderBookStore();
    // Remove from in-memory book immediately; restore if the DB update fails.
    const engineEntry = store.findAndRemove(orderId);

    try {
      const txResult = await withTx(async (client) => {
        const order = await getOrderByIdTx(client, orderId);
        if (!order)                                          return { ok: false, reason: "order_not_found" as string };
        if (order.userId !== userId)                         return { ok: false, reason: "order_not_found" as string };
        if (!["NEW", "PARTIALLY_FILLED"].includes(order.status)) {
          return { ok: false, reason: "order_already_terminal" as string };
        }

        await setOrderStatusTx(client, orderId, "CANCELLED");

        const mkt = await getMarket(order.market);
        if (mkt) {
          const holdAsset = order.side === "buy" ? mkt.quoteAsset : mkt.baseAsset;
          let releaseAmount: number;
          if (engineEntry) {
            releaseAmount = order.side === "buy"
              ? engineEntry.remaining * engineEntry.pricePerUnit
              : engineEntry.remaining;
          } else {
            const rem   = parseFloat(order.remainingQuantity);
            const price = order.price ? parseFloat(order.price) : 0;
            releaseAmount = order.side === "buy" ? rem * price : rem;
          }
          if (releaseAmount > 0) {
            await releaseFundsTx(client, userId, holdAsset, releaseAmount, orderId);
          }
        }

        await appendOrderEventTx(client, orderId, "OrderCancelled", {
          orderId, userId, cancelledBy: "user",
        });
        return { ok: true, reason: undefined as string | undefined };
      });

      if (!txResult.enabled) {
        if (engineEntry) store.insert(engineEntry.market, engineEntry);
        return { cancelled: false, orderId, reason: "storage_unavailable" };
      }

      const res = txResult.value;
      if (!res.ok) {
        if (engineEntry) store.insert(engineEntry.market, engineEntry);
        return { cancelled: false, orderId, reason: res.reason };
      }
    } catch (err) {
      logger.error("[engine] cancelOrder tx failed", { orderId, err });
      if (engineEntry) store.insert(engineEntry.market, engineEntry);
      return { cancelled: false, orderId, reason: "cancel_failed" };
    }

    if (engineEntry) {
      const displayBook = getOrderBook(engineEntry.market);
      displayBook.cancel(engineEntry.side, pkStr(engineEntry.pricePerUnit), engineEntry.remaining.toFixed(10));
    }

    const ev = createTradingEvent("OrderCancelled", {
      orderId, userId, market: engineEntry?.market ?? "unknown", cancelledBy: "user",
    });
    logger.info("[engine] OrderCancelled", { eventId: ev.eventId, orderId });

    // Emit cancel events
    if (engineEntry) {
      const bus = getEventBus();
      bus.emit("order:updated", {
        orderId, userId, market: engineEntry.market, status: "CANCELLED",
        filledQuantity: (engineEntry.originalQty - engineEntry.remaining).toFixed(10),
        remainingQuantity: "0",
        avgFillPrice: null,
      });
      bus.emit("orderbook:changed", {
        market: engineEntry.market,
        snapshot: getOrderBook(engineEntry.market).snapshot(50),
        seqNum: nextSeq(engineEntry.market),
      });
    }

    return { cancelled: true, orderId };
  }

  async match(market: string): Promise<MatchResult> {
    return { market, trades: [], matched: 0 };
  }

  async snapshot(market: string, depth = 20): Promise<OrderBookSnapshot> {
    return getOrderBook(market).snapshot(depth);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

declare global {
  var tecpeyMatchingEngine: InProcessMatchingEngine | undefined;
}

export function getMatchingEngine(): MatchingEngineInterface {
  if (!globalThis.tecpeyMatchingEngine) {
    globalThis.tecpeyMatchingEngine = new InProcessMatchingEngine();
  }
  return globalThis.tecpeyMatchingEngine;
}
