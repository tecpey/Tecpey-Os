import { randomUUID } from "crypto";
import { logger } from "@/lib/logger";
import type { Order, OrderBookSnapshot, OrderSide, OrderStatus } from "./types";
import type {
  CancelOrderResult,
  MatchingEngineInterface,
  MatchResult,
  PlaceOrderResult,
} from "./matching-engine";
import { getOrderBook } from "./order-book";
import { getMarket } from "./market-service";
import { getOrderById, updateOrderFill, setOrderStatus } from "./order-service";
import { createTrade } from "./trade-service";
import {
  postRelease,
  postTradeDebit,
  postTradeCredit,
  postFee,
} from "./wallet-service";
import { createTradingEvent } from "./events";
import { withDb } from "@/lib/db";

// ── Engine order entry ────────────────────────────────────────────────────────
//
// Tracks a single resting order inside the in-memory book. Separate from the
// display OrderBook (which holds aggregated price levels); this structure holds
// individual orders for FIFO price-time matching.

type EngineOrder = {
  orderId: string;
  userId: string;
  market: string;
  side: OrderSide;
  // Per-unit limit price. 0 means market order (matches any price).
  pricePerUnit: number;
  // Original accepted quantity — used to compute remaining hold on cancel.
  originalQty: number;
  // Current unfilled quantity.
  remaining: number;
  // Epoch ms — establishes FIFO priority within the same price level.
  ts: number;
};

type EngineBook = {
  bids: Map<string, EngineOrder[]>; // priceKey → FIFO queue
  asks: Map<string, EngineOrder[]>; // priceKey → FIFO queue
  // O(1) cancel lookup: orderId → (side, priceKey)
  index: Map<string, { side: OrderSide; priceKey: string }>;
};

// ── Global registry — survives Next.js hot-reload ─────────────────────────────

declare global {
  var tecpeyEngineBooks: Map<string, EngineBook> | undefined;
}

function getEngineBook(market: string): EngineBook {
  if (!globalThis.tecpeyEngineBooks) {
    globalThis.tecpeyEngineBooks = new Map();
  }
  let book = globalThis.tecpeyEngineBooks.get(market);
  if (!book) {
    book = { bids: new Map(), asks: new Map(), index: new Map() };
    globalThis.tecpeyEngineBooks.set(market, book);
  }
  return book;
}

// ── Book helpers ──────────────────────────────────────────────────────────────

function pkStr(price: number): string {
  return price.toFixed(10);
}

function insertIntoBook(book: EngineBook, entry: EngineOrder): void {
  const map = entry.side === "buy" ? book.bids : book.asks;
  const key = pkStr(entry.pricePerUnit);
  const level = map.get(key);
  if (level) {
    level.push(entry);
  } else {
    map.set(key, [entry]);
  }
  book.index.set(entry.orderId, { side: entry.side, priceKey: key });
}

function removeFromBook(book: EngineBook, orderId: string): EngineOrder | null {
  const loc = book.index.get(orderId);
  if (!loc) return null;
  const map = loc.side === "buy" ? book.bids : book.asks;
  const level = map.get(loc.priceKey);
  if (!level) return null;
  const idx = level.findIndex((e) => e.orderId === orderId);
  if (idx === -1) return null;
  const [removed] = level.splice(idx, 1);
  if (level.length === 0) map.delete(loc.priceKey);
  book.index.delete(orderId);
  return removed;
}

// Returns [priceKey, orders] sorted for matching.
// bids: descending (highest price first — best bid = most willing buyer)
// asks: ascending  (lowest price first — best ask = most willing seller)
function sortedLevels(
  map: Map<string, EngineOrder[]>,
  desc: boolean,
): [string, EngineOrder[]][] {
  return Array.from(map.entries())
    .filter(([, q]) => q.length > 0)
    .sort(([a], [b]) => {
      const diff = parseFloat(a) - parseFloat(b);
      return desc ? -diff : diff;
    });
}

// Available quantity at price levels matching the incoming order.
function availableVolumeForFOK(
  book: EngineBook,
  side: OrderSide,
  limitPrice: number,
): number {
  const map = side === "buy" ? book.asks : book.bids;
  const desc = side === "sell"; // bids are checked desc for sell
  let total = 0;
  for (const [priceKey, orders] of sortedLevels(map, desc)) {
    const p = parseFloat(priceKey);
    if (side === "buy" && p > limitPrice) break; // ask too high
    if (side === "sell" && p < limitPrice) break; // bid too low
    for (const o of orders) total += o.remaining;
  }
  return total;
}

// ── Audit helper ──────────────────────────────────────────────────────────────

async function appendOrderEvent(
  orderId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  void withDb((client) =>
    client.query(
      `INSERT INTO order_events (order_id, event_type, payload)
       VALUES ($1::uuid, $2, $3::jsonb)`,
      [orderId, eventType, JSON.stringify(payload)],
    ),
  );
}

// ── In-process matching engine ────────────────────────────────────────────────
//
// Implements MatchingEngineInterface for Phase 29.
// Price-time priority: best price first, FIFO within same price level.
// Matching is synchronous within placeOrder — no background loop needed.
//
// Limitations (document as production gaps):
//   - In-memory book lost on hot-reload or process restart
//   - No DB transaction wrapping the full match sequence
//   - Single-process only; multi-instance requires Redis (Phase 30/32)
//   - Available balance computed outside a DB transaction (Phase 30 gap)

export class InProcessMatchingEngine implements MatchingEngineInterface {
  async placeOrder(order: Order): Promise<PlaceOrderResult> {
    const market = await getMarket(order.market);
    if (!market) {
      logger.warn("[engine] market not found", { market: order.market });
      await setOrderStatus(order.id, "REJECTED");
      await appendOrderEvent(order.id, "OrderRejected", {
        orderId: order.id,
        market: order.market,
        reason: "market_not_found",
      });
      return { accepted: false, orderId: order.id, tradeIds: [], reason: "market_not_found" };
    }

    const baseAsset = market.baseAsset;
    const quoteAsset = market.quoteAsset;
    const makerFeeRate = parseFloat(market.makerFee);
    const takerFeeRate = parseFloat(market.takerFee);
    const isMarket = order.type === "market";
    const isFOK = order.timeInForce === "FOK" || order.type === "fok";
    const isIOC = order.timeInForce === "IOC" || order.type === "ioc";
    const isGTC = !isMarket && !isFOK && !isIOC;
    const limitPrice = order.price ? parseFloat(order.price) : 0;

    const book = getEngineBook(order.market);

    // ── FOK pre-flight ────────────────────────────────────────────────────────
    // FOK orders must be fully fillable before any execution begins.
    if (isFOK) {
      const available = availableVolumeForFOK(book, order.side, limitPrice);
      const requested = parseFloat(order.quantity);
      if (available < requested - 1e-10) {
        logger.info("[engine] FOK order rejected — insufficient liquidity", {
          orderId: order.id,
          requested,
          available,
        });
        await setOrderStatus(order.id, "EXPIRED");
        await appendOrderEvent(order.id, "OrderExpired", {
          orderId: order.id,
          market: order.market,
          reason: "fok_insufficient_liquidity",
        });
        const ev = createTradingEvent("OrderExpired", { orderId: order.id, market: order.market });
        logger.info("[engine] OrderExpired (FOK)", { eventId: ev.eventId, orderId: order.id });
        // Release the full hold since nothing was filled.
        const holdAsset = order.side === "buy" ? quoteAsset : baseAsset;
        const holdAmount = order.side === "buy" ? limitPrice * requested : requested;
        await postRelease(order.userId, holdAsset, holdAmount, order.id);
        return { accepted: false, orderId: order.id, tradeIds: [], reason: "fok_insufficient_liquidity" };
      }
    }

    // ── Matching loop ─────────────────────────────────────────────────────────
    let remaining = parseFloat(order.quantity);
    const tradeIds: string[] = [];
    let totalFilled = 0;
    let vwapNumerator = 0;

    // Incoming BUY matches against asks (ascending); SELL matches against bids (descending).
    const oppMap = order.side === "buy" ? book.asks : book.bids;
    const levelsDesc = order.side === "sell"; // bids are iterated descending

    const displayBook = getOrderBook(order.market);

    matchLoop: for (const [priceKey, makerQueue] of sortedLevels(oppMap, levelsDesc)) {
      const makerPrice = parseFloat(priceKey);

      // Price crossing check (limit and IOC/FOK only; market orders cross any price).
      if (!isMarket) {
        if (order.side === "buy" && makerPrice > limitPrice) break;
        if (order.side === "sell" && makerPrice < limitPrice) break;
      }

      // Iterate makers at this price level (FIFO).
      let mi = 0;
      while (mi < makerQueue.length && remaining > 1e-10) {
        const maker = makerQueue[mi];
        const fillQty = Math.min(remaining, maker.remaining);
        const tradePrice = makerPrice;
        const tradeId = randomUUID();

        // Determine maker/taker sides.
        // The resting order is always the maker; the incoming order is the taker.
        const makerSide = maker.side;
        const buyerOrderId = order.side === "buy" ? order.id : maker.orderId;
        const sellerOrderId = order.side === "sell" ? order.id : maker.orderId;
        const buyerUserId = order.side === "buy" ? order.userId : maker.userId;
        const sellerUserId = order.side === "sell" ? order.userId : maker.userId;

        const feeBuyer = fillQty * tradePrice * (makerSide === "buy" ? makerFeeRate : takerFeeRate);
        const feeSeller = fillQty * tradePrice * (makerSide === "sell" ? makerFeeRate : takerFeeRate);

        // 1. Persist trade record.
        const trade = await createTrade({
          id: tradeId,
          market: order.market,
          buyerOrderId,
          sellerOrderId,
          price: tradePrice,
          quantity: fillQty,
          feeBuyer,
          feeSeller,
          makerSide,
        });
        if (!trade) {
          logger.error("[engine] createTrade failed — stopping match", { tradeId });
          break matchLoop;
        }
        tradeIds.push(tradeId);

        // 2. Post ledger entries — buyer side.
        // Release the held USDT for the filled portion (at limit price, not trade price).
        // trade_debit is the actual cost (at trade price — may be lower = price improvement).
        const buyerHoldRelease =
          order.side === "buy"
            ? fillQty * limitPrice              // incoming buy: held at limitPrice
            : fillQty * maker.pricePerUnit;     // maker buy: held at their limit price
        await postRelease(buyerUserId, quoteAsset, buyerHoldRelease, buyerOrderId);
        await postTradeDebit(buyerUserId, quoteAsset, fillQty * tradePrice, tradeId);
        await postTradeCredit(buyerUserId, baseAsset, fillQty, tradeId);
        await postFee(buyerUserId, quoteAsset, feeBuyer, tradeId);

        // 3. Post ledger entries — seller side.
        // Release the held base asset for the filled portion.
        const sellerHoldRelease = fillQty; // seller always holds base asset qty
        await postRelease(sellerUserId, baseAsset, sellerHoldRelease, sellerOrderId);
        await postTradeDebit(sellerUserId, baseAsset, fillQty, tradeId);
        await postTradeCredit(sellerUserId, quoteAsset, fillQty * tradePrice, tradeId);
        await postFee(sellerUserId, quoteAsset, feeSeller, tradeId);

        // 4. Determine maker's new status and update DB.
        const makerNewRemaining = maker.remaining - fillQty;
        const makerNewStatus: OrderStatus = makerNewRemaining <= 1e-10 ? "FILLED" : "PARTIALLY_FILLED";
        await updateOrderFill(maker.orderId, fillQty, tradePrice, makerNewStatus);

        // 5. Emit trade and maker-fill events + audit.
        const tradeEv = createTradingEvent("TradeExecuted", {
          tradeId,
          market: order.market,
          price: tradePrice.toFixed(10),
          quantity: fillQty.toFixed(10),
          buyerOrderId,
          sellerOrderId,
          makerSide: String(makerSide),
        });
        logger.info("[engine] TradeExecuted", { eventId: tradeEv.eventId, tradeId, market: order.market });
        await appendOrderEvent(maker.orderId, "TradeExecuted", {
          tradeId, fillQty, tradePrice, newStatus: makerNewStatus,
        });
        await appendOrderEvent(order.id, "TradeExecuted", {
          tradeId, fillQty, tradePrice,
        });

        // 6. Update engine state.
        maker.remaining = makerNewRemaining;
        if (makerNewRemaining <= 1e-10) {
          // Maker fully filled — remove from engine book and display book.
          makerQueue.splice(mi, 1);
          book.index.delete(maker.orderId);
          displayBook.cancel(maker.side, priceKey, fillQty.toFixed(10));
        } else {
          // Maker partially filled — stays in book at same price.
          displayBook.cancel(maker.side, priceKey, fillQty.toFixed(10));
          mi++;
        }

        remaining -= fillQty;
        totalFilled += fillQty;
        vwapNumerator += fillQty * tradePrice;
      }

      // Clean up empty price level from map.
      if (makerQueue.length === 0) oppMap.delete(priceKey);
    }

    // ── Post-match: finalise incoming order ───────────────────────────────────
    const fullyFilled = remaining <= 1e-10;

    if (fullyFilled) {
      // Order completely filled.
      const avgPrice = totalFilled > 0 ? vwapNumerator / totalFilled : 0;
      await updateOrderFill(order.id, totalFilled, avgPrice, "FILLED");
      await appendOrderEvent(order.id, "OrderAccepted", { orderId: order.id, market: order.market });
      const acceptEv = createTradingEvent("OrderAccepted", { orderId: order.id, market: order.market });
      logger.info("[engine] order FILLED", { eventId: acceptEv.eventId, orderId: order.id, tradeCount: tradeIds.length });

    } else if (totalFilled > 0) {
      // Partially filled.
      const avgPrice = vwapNumerator / totalFilled;
      const partialStatus: OrderStatus = isGTC ? "PARTIALLY_FILLED" : "CANCELLED";
      await updateOrderFill(order.id, totalFilled, avgPrice, partialStatus);

      if (isGTC) {
        // Insert remaining quantity into engine book and display book.
        const engineEntry: EngineOrder = {
          orderId: order.id,
          userId: order.userId,
          market: order.market,
          side: order.side,
          pricePerUnit: limitPrice,
          originalQty: parseFloat(order.quantity),
          remaining,
          ts: Date.now(),
        };
        insertIntoBook(book, engineEntry);
        displayBook.insert(order.side, pkStr(limitPrice), remaining.toFixed(10));
        await appendOrderEvent(order.id, "OrderAccepted", { orderId: order.id, market: order.market, remainingQty: remaining });
        const acceptEv = createTradingEvent("OrderAccepted", { orderId: order.id, market: order.market });
        logger.info("[engine] order PARTIALLY_FILLED, remainder in book", { eventId: acceptEv.eventId, orderId: order.id, remaining });
      } else {
        // IOC/FOK/MARKET: cancel remainder, release remaining hold.
        const holdAsset = order.side === "buy" ? quoteAsset : baseAsset;
        const holdRemainder = order.side === "buy" ? remaining * limitPrice : remaining;
        await postRelease(order.userId, holdAsset, holdRemainder, order.id);
        await appendOrderEvent(order.id, "OrderExpired", { orderId: order.id, market: order.market, reason: "ioc_remainder" });
        const expEv = createTradingEvent("OrderExpired", { orderId: order.id, market: order.market });
        logger.info("[engine] order IOC/MARKET partially filled, remainder expired", { eventId: expEv.eventId, orderId: order.id });
      }

    } else {
      // Zero fills.
      if (isGTC) {
        // No fills yet — rest in book as NEW.
        const engineEntry: EngineOrder = {
          orderId: order.id,
          userId: order.userId,
          market: order.market,
          side: order.side,
          pricePerUnit: limitPrice,
          originalQty: parseFloat(order.quantity),
          remaining,
          ts: Date.now(),
        };
        insertIntoBook(book, engineEntry);
        displayBook.insert(order.side, pkStr(limitPrice), remaining.toFixed(10));
        await appendOrderEvent(order.id, "OrderAccepted", { orderId: order.id, market: order.market });
        const acceptEv = createTradingEvent("OrderAccepted", { orderId: order.id, market: order.market });
        logger.info("[engine] GTC order accepted, resting in book", { eventId: acceptEv.eventId, orderId: order.id });
      } else {
        // IOC/FOK/MARKET with zero fills — expire entirely.
        await setOrderStatus(order.id, "EXPIRED");
        const holdAsset = order.side === "buy" ? quoteAsset : baseAsset;
        const holdAmount = order.side === "buy"
          ? remaining * (limitPrice || 0)
          : remaining;
        await postRelease(order.userId, holdAsset, holdAmount, order.id);
        await appendOrderEvent(order.id, "OrderExpired", { orderId: order.id, market: order.market, reason: "no_liquidity" });
        const expEv = createTradingEvent("OrderExpired", { orderId: order.id, market: order.market });
        logger.info("[engine] order expired — no fills", { eventId: expEv.eventId, orderId: order.id });
        return { accepted: false, orderId: order.id, tradeIds: [], reason: "no_liquidity" };
      }
    }

    return { accepted: true, orderId: order.id, tradeIds };
  }

  async cancelOrder(orderId: string, userId: string): Promise<CancelOrderResult> {
    // Try to find and remove from engine book first.
    // Iterate all market books since we only have orderId.
    let engineEntry: EngineOrder | null = null;
    if (globalThis.tecpeyEngineBooks) {
      for (const [, book] of globalThis.tecpeyEngineBooks) {
        const found = removeFromBook(book, orderId);
        if (found) {
          engineEntry = found;
          break;
        }
      }
    }

    // Fetch the order from DB for audit and release computation.
    const order = await getOrderById(orderId);

    if (!order) {
      return { cancelled: false, orderId, reason: "order_not_found" };
    }
    if (order.userId !== userId) {
      return { cancelled: false, orderId, reason: "order_not_found" };
    }
    if (!["NEW", "PARTIALLY_FILLED"].includes(order.status)) {
      return { cancelled: false, orderId, reason: "order_already_terminal" };
    }

    // Update DB.
    await setOrderStatus(orderId, "CANCELLED");

    // Release remaining hold if we found the engine entry.
    if (engineEntry) {
      const market = await getMarket(engineEntry.market);
      if (market) {
        const holdAsset = engineEntry.side === "buy" ? market.quoteAsset : market.baseAsset;
        const releaseAmount =
          engineEntry.side === "buy"
            ? engineEntry.remaining * engineEntry.pricePerUnit
            : engineEntry.remaining;
        await postRelease(userId, holdAsset, releaseAmount, orderId);

        // Remove from display order book.
        const displayBook = getOrderBook(engineEntry.market);
        displayBook.cancel(engineEntry.side, pkStr(engineEntry.pricePerUnit), engineEntry.remaining.toFixed(10));
      }
    } else {
      // Engine book lost state (e.g., after hot-reload). Release based on DB order.
      // Use remaining_quantity from DB and price from DB order.
      const market = await getMarket(order.market);
      if (market) {
        const remaining = parseFloat(order.remainingQuantity);
        const price = order.price ? parseFloat(order.price) : 0;
        const holdAsset = order.side === "buy" ? market.quoteAsset : market.baseAsset;
        const releaseAmount = order.side === "buy" ? remaining * price : remaining;
        if (releaseAmount > 0) {
          await postRelease(userId, holdAsset, releaseAmount, orderId);
        }
      }
    }

    const ev = createTradingEvent("OrderCancelled", {
      orderId,
      userId,
      market: order.market,
      cancelledBy: "user",
    });
    logger.info("[engine] OrderCancelled", { eventId: ev.eventId, orderId, market: order.market });
    await appendOrderEvent(orderId, "OrderCancelled", { orderId, userId, cancelledBy: "user" });

    return { cancelled: true, orderId };
  }

  // match() is a no-op for the in-process engine — matching is synchronous
  // within placeOrder(). Required by the interface for future async engines.
  async match(market: string): Promise<MatchResult> {
    return { market, trades: [], matched: 0 };
  }

  async snapshot(market: string, depth = 20): Promise<OrderBookSnapshot> {
    return getOrderBook(market).snapshot(depth);
  }
}

// ── Singleton accessor ────────────────────────────────────────────────────────

declare global {
  var tecpeyMatchingEngine: InProcessMatchingEngine | undefined;
}

export function getMatchingEngine(): MatchingEngineInterface {
  if (!globalThis.tecpeyMatchingEngine) {
    globalThis.tecpeyMatchingEngine = new InProcessMatchingEngine();
  }
  return globalThis.tecpeyMatchingEngine;
}
