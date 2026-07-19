import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { logger } from "@/lib/logger";
import { withTx } from "@/lib/db";
import type { Order, OrderBookSnapshot, OrderSide, Trade } from "./types";
import type {
  CancelOrderResult,
  MatchingEngineInterface,
  MatchResult,
  PlaceOrderResult,
} from "./matching-engine";
import { getOrderBook } from "./order-book";
import { getMarket } from "./market-service";
import { getOpenOrdersForBook, getOrder } from "./order-service";
import { createTradeTx } from "./trade-service";
import {
  chargeFeeTx,
  creditFundsTx,
  debitFundsTx,
  releaseFundsTx,
  releaseOutstandingOrderHoldTx,
} from "./wallet-balance-service";
import { createTradingEvent } from "./events";
import { publishRealtimeEvent } from "./realtime";
import { recordLatency, trackTradingMetric } from "./observability";
import { D } from "./decimal";
import {
  calculateExactTradeAmounts,
  crossesLimit,
  decimalAdd,
  decimalMin,
  isPositiveAmount,
  isZeroAmount,
  type ExactTradeAmounts,
} from "./matching-financials";
import {
  ExactOrderBookStore,
  orderToExactEngineOrder,
  type ExactEngineOrder,
} from "./exact-order-book-store";
import {
  applyExactOrderFillTx,
  lockOrdersForMatchTx,
  setExactOrderStatusTx,
} from "./matching-order-service";

const PLATFORM_FEE_WALLET_ID = "system:exchange-fees";
const OPEN_STATUSES = new Set(["NEW", "PARTIALLY_FILLED"]);

class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

type PlannedFill = {
  makerOrderId: string;
  makerSide: OrderSide;
  price: string;
  quantity: string;
};

type CommittedFill = {
  trade: Trade;
  maker: Order;
  taker: Order;
  amounts: ExactTradeAmounts;
};

type PersistResult = {
  taker: Order;
  fills: CommittedFill[];
};

function holdAsset(order: Order, market: NonNullable<Awaited<ReturnType<typeof getMarket>>>): string {
  return order.side === "buy" ? market.quoteAsset : market.baseAsset;
}

function open(order: Order): boolean {
  return OPEN_STATUSES.has(order.status) && D(order.remainingQuantity).gt(0);
}

function makerFeeRates(
  makerSide: OrderSide,
  makerFee: string,
  takerFee: string,
): { buyerFeeRate: string; sellerFeeRate: string } {
  return makerSide === "buy"
    ? { buyerFeeRate: makerFee, sellerFeeRate: takerFee }
    : { buyerFeeRate: takerFee, sellerFeeRate: makerFee };
}

async function requireStep(label: string, result: Promise<boolean>): Promise<void> {
  if (!await result) throw new Error(`matching_settlement_failed:${label}`);
}

async function settleTradeTx(input: {
  client: PoolClient;
  tradeId: string;
  maker: Order;
  taker: Order;
  market: NonNullable<Awaited<ReturnType<typeof getMarket>>>;
  amounts: ExactTradeAmounts;
}): Promise<void> {
  const buyer = input.maker.side === "buy" ? input.maker : input.taker;
  const seller = input.maker.side === "sell" ? input.maker : input.taker;
  if (buyer.userId === seller.userId) throw new Error("self_trade_forbidden");

  const { client, tradeId, market, amounts } = input;

  // Buyer consumes quote held for gross + actual fee.
  await requireStep("buyer_release", releaseFundsTx(
    client,
    buyer.userId,
    market.quoteAsset,
    amounts.buyerQuoteDebit,
    buyer.id,
  ));
  await requireStep("buyer_gross_debit", debitFundsTx(
    client,
    buyer.userId,
    market.quoteAsset,
    amounts.quoteGross,
    tradeId,
  ));
  await requireStep("buyer_fee", chargeFeeTx(
    client,
    buyer.userId,
    market.quoteAsset,
    amounts.buyerFee,
    tradeId,
  ));

  // Seller consumes exact base held by the order.
  await requireStep("seller_release", releaseFundsTx(
    client,
    seller.userId,
    market.baseAsset,
    amounts.quantity,
    seller.id,
  ));
  await requireStep("seller_base_debit", debitFundsTx(
    client,
    seller.userId,
    market.baseAsset,
    amounts.quantity,
    tradeId,
  ));

  // Counterparty credits and fee transfer.
  await requireStep("buyer_base_credit", creditFundsTx(
    client,
    buyer.userId,
    market.baseAsset,
    amounts.quantity,
    tradeId,
  ));
  await requireStep("seller_quote_credit", creditFundsTx(
    client,
    seller.userId,
    market.quoteAsset,
    amounts.quoteGross,
    tradeId,
  ));
  await requireStep("seller_fee", chargeFeeTx(
    client,
    seller.userId,
    market.quoteAsset,
    amounts.sellerFee,
    tradeId,
  ));
  await requireStep("platform_fee_credit", creditFundsTx(
    client,
    PLATFORM_FEE_WALLET_ID,
    market.quoteAsset,
    amounts.platformFeeCredit,
    tradeId,
  ));
}

export class MatchingEngine implements MatchingEngineInterface {
  private readonly books = new ExactOrderBookStore();
  private readonly locks = new Map<string, AsyncMutex>();

  private lock(market: string): AsyncMutex {
    const key = market.toUpperCase();
    let lock = this.locks.get(key);
    if (!lock) {
      lock = new AsyncMutex();
      this.locks.set(key, lock);
    }
    return lock;
  }

  async placeOrder(order: Order): Promise<PlaceOrderResult> {
    const market = await getMarket(order.market);
    if (!market || market.status !== "active") {
      await this.terminalize(order, "REJECTED", market ?? null);
      return { accepted: false, orderId: order.id, tradeIds: [], reason: "market_not_active" };
    }
    if (order.type === "stop_limit") {
      await this.terminalize(order, "REJECTED", market);
      return { accepted: false, orderId: order.id, tradeIds: [], reason: "stop_limit_not_supported" };
    }
    if (order.type === "market" && order.side === "buy") {
      await this.terminalize(order, "REJECTED", market);
      return { accepted: false, orderId: order.id, tradeIds: [], reason: "market_buy_depth_reservation_required" };
    }

    return this.lock(order.market).run(async () => {
      const started = Date.now();
      const plan = this.computePlan(order);
      const plannedQuantity = plan.reduce((sum, fill) => sum.plus(D(fill.quantity)), D(0));

      if (order.timeInForce === "FOK" && plannedQuantity.lt(D(order.remainingQuantity))) {
        await this.terminalize(order, "REJECTED", market);
        return { accepted: false, orderId: order.id, tradeIds: [], reason: "fok_no_liquidity" };
      }

      if (plan.length === 0) {
        if (order.type !== "market" && order.timeInForce === "GTC" && order.price) {
          this.insertResting(order);
          trackTradingMetric("orders_accepted");
          recordLatency("matching_latency_ms", started);
          return { accepted: true, orderId: order.id, tradeIds: [] };
        }
        const status = order.timeInForce === "FOK" ? "REJECTED" : "CANCELLED";
        await this.terminalize(order, status, market);
        return { accepted: false, orderId: order.id, tradeIds: [], reason: "no_liquidity" };
      }

      let persisted: PersistResult;
      try {
        persisted = await this.persistPlan(order, plan, market);
      } catch (error) {
        logger.error("[matching-engine] exact matching transaction failed", {
          orderId: order.id,
          market: order.market,
          error,
        });
        await this.terminalize(order, "REJECTED", market);
        return { accepted: false, orderId: order.id, tradeIds: [], reason: "matching_settlement_failed" };
      }

      this.applyCommittedProjection(order, persisted);
      trackTradingMetric("orders_accepted");
      if (persisted.fills.length > 0) trackTradingMetric("trades_executed", persisted.fills.length);
      recordLatency("matching_latency_ms", started);

      return {
        accepted: true,
        orderId: order.id,
        tradeIds: persisted.fills.map((fill) => fill.trade.id),
      };
    });
  }

  private computePlan(order: Order): PlannedFill[] {
    let remaining = D(order.remainingQuantity);
    const limit = order.type === "market" ? null : order.price;
    const plan: PlannedFill[] = [];

    for (const level of this.books.oppositeLevels(order.market, order.side)) {
      if (!crossesLimit({ takerSide: order.side, takerLimit: limit, makerPrice: level.price })) break;
      for (const maker of level.orders) {
        if (maker.userId === order.userId) continue;
        const quantity = decimalMin(remaining.toString(), maker.remainingQuantity);
        if (!isPositiveAmount(quantity)) continue;
        plan.push({
          makerOrderId: maker.id,
          makerSide: maker.side,
          price: maker.price,
          quantity,
        });
        remaining = remaining.minus(D(quantity));
        if (remaining.lte(0)) return plan;
      }
    }
    return plan;
  }

  private async persistPlan(
    submitted: Order,
    plan: PlannedFill[],
    market: NonNullable<Awaited<ReturnType<typeof getMarket>>>,
  ): Promise<PersistResult> {
    const result = await withTx(async (client) => {
      const locked = await lockOrdersForMatchTx(client, [submitted.id, ...plan.map((fill) => fill.makerOrderId)]);
      let taker = locked.get(submitted.id);
      if (!taker || !open(taker) || taker.userId !== submitted.userId) {
        throw new Error("taker_order_not_open");
      }
      const initialTakerRemaining = taker.remainingQuantity;
      const committed: CommittedFill[] = [];

      for (const planned of plan) {
        const maker = locked.get(planned.makerOrderId);
        if (!maker || !open(maker) || maker.userId === taker.userId) continue;
        if (!maker.price || maker.side === taker.side) continue;
        if (!crossesLimit({
          takerSide: taker.side,
          takerLimit: taker.type === "market" ? null : taker.price,
          makerPrice: maker.price,
        })) continue;

        const quantity = decimalMin(
          planned.quantity,
          decimalMin(taker.remainingQuantity, maker.remainingQuantity),
        );
        if (!isPositiveAmount(quantity)) continue;

        const rates = makerFeeRates(maker.side, market.makerFee, market.takerFee);
        const amounts = calculateExactTradeAmounts({
          quantity,
          price: maker.price,
          ...rates,
        });
        if (isZeroAmount(amounts.quoteGross)) throw new Error("trade_value_below_database_scale");

        const tradeId = randomUUID();
        const buyerOrderId = maker.side === "buy" ? maker.id : taker.id;
        const sellerOrderId = maker.side === "sell" ? maker.id : taker.id;
        const trade = await createTradeTx(client, {
          id: tradeId,
          market: submitted.market,
          buyerOrderId,
          sellerOrderId,
          price: amounts.price,
          quantity: amounts.quantity,
          feeBuyer: amounts.buyerFee,
          feeSeller: amounts.sellerFee,
          makerSide: maker.side,
        });
        if (!trade) throw new Error("trade_insert_failed");

        const nextMaker = await applyExactOrderFillTx(client, maker.id, amounts.quantity, amounts.price);
        const nextTaker = await applyExactOrderFillTx(client, taker.id, amounts.quantity, amounts.price);
        if (!nextMaker || !nextTaker) throw new Error("order_fill_update_failed");

        await settleTradeTx({ client, tradeId, maker, taker, market, amounts });

        if (nextMaker.status === "FILLED") {
          await releaseOutstandingOrderHoldTx(
            client,
            nextMaker.userId,
            holdAsset(nextMaker, market),
            nextMaker.id,
          );
        }

        locked.set(nextMaker.id, nextMaker);
        locked.set(nextTaker.id, nextTaker);
        taker = nextTaker;
        committed.push({ trade, maker: nextMaker, taker: nextTaker, amounts });
        if (!open(taker)) break;
      }

      const committedQuantity = committed.reduce(
        (sum, fill) => sum.plus(D(fill.amounts.quantity)),
        D(0),
      );
      if (submitted.timeInForce === "FOK" && !committedQuantity.eq(D(initialTakerRemaining))) {
        throw new Error("fok_atomicity_failed");
      }

      if (open(taker) && (submitted.timeInForce !== "GTC" || submitted.type === "market")) {
        const terminalStatus = submitted.timeInForce === "FOK" ? "REJECTED" : "CANCELLED";
        const terminal = await setExactOrderStatusTx(client, taker.id, terminalStatus);
        if (!terminal) throw new Error("taker_terminal_transition_failed");
        taker = terminal;
      }

      if (!open(taker)) {
        await releaseOutstandingOrderHoldTx(
          client,
          taker.userId,
          holdAsset(taker, market),
          taker.id,
        );
      }

      return { taker, fills: committed };
    });
    if (!result.enabled) throw new Error("matching_database_unavailable");
    return result.value;
  }

  private applyCommittedProjection(submitted: Order, result: PersistResult): void {
    const displayBook = getOrderBook(submitted.market);
    for (const fill of result.fills) {
      this.books.updateRemaining(
        fill.maker.id,
        fill.maker.market,
        fill.maker.side,
        fill.maker.remainingQuantity,
      );
      displayBook.applyTrade(
        fill.maker.side,
        Number(fill.amounts.price),
        Number(fill.amounts.quantity),
      );
      const event = createTradingEvent("TradeExecuted", {
        tradeId: fill.trade.id,
        market: fill.trade.market,
        price: fill.trade.price,
        quantity: fill.trade.quantity,
        buyerOrderId: fill.trade.buyerOrderId,
        sellerOrderId: fill.trade.sellerOrderId,
        makerSide: fill.trade.makerSide,
        feeBuyer: fill.trade.feeBuyer,
        feeSeller: fill.trade.feeSeller,
      });
      publishRealtimeEvent(event);
    }

    if (open(result.taker) && result.taker.timeInForce === "GTC" && result.taker.price) {
      this.insertResting(result.taker);
    }
  }

  private insertResting(order: Order): void {
    const exact = orderToExactEngineOrder(order);
    this.books.insert(exact);
    // The legacy public book is a disposable projection only; matching authority
    // remains the exact store and PostgreSQL.
    getOrderBook(order.market).insert(
      order.side,
      Number(exact.price),
      Number(exact.remainingQuantity),
      exact.id,
    );
    const event = createTradingEvent("OrderAccepted", {
      orderId: order.id,
      userId: order.userId,
      market: order.market,
      side: order.side,
      type: order.type,
      price: order.price,
      quantity: order.quantity,
    });
    publishRealtimeEvent(event);
  }

  private async terminalize(
    order: Order,
    status: "CANCELLED" | "REJECTED",
    market: NonNullable<Awaited<ReturnType<typeof getMarket>>> | null,
  ): Promise<void> {
    if (!market) return;
    const result = await withTx(async (client) => {
      const locked = await lockOrdersForMatchTx(client, [order.id]);
      const current = locked.get(order.id);
      if (!current) throw new Error("order_not_found");
      let terminal = current;
      if (open(current)) {
        const updated = await setExactOrderStatusTx(client, current.id, status);
        if (!updated) throw new Error("terminal_status_failed");
        terminal = updated;
      }
      await releaseOutstandingOrderHoldTx(
        client,
        terminal.userId,
        holdAsset(terminal, market),
        terminal.id,
      );
      return terminal;
    });
    if (!result.enabled) throw new Error("terminal_database_unavailable");
  }

  async cancelOrder(orderId: string, userId: string): Promise<CancelOrderResult> {
    const existing = await getOrder(orderId, userId === "system" ? undefined : userId);
    if (!existing) return { cancelled: false, orderId, reason: "order_not_found" };
    const market = await getMarket(existing.market);
    if (!market) return { cancelled: false, orderId, reason: "market_not_found" };

    try {
      const result = await withTx(async (client) => {
        const locked = await lockOrdersForMatchTx(client, [orderId]);
        const current = locked.get(orderId);
        if (!current) throw new Error("order_not_found");
        if (userId !== "system" && current.userId !== userId) throw new Error("order_not_owned");
        let cancelled = current;
        if (open(current)) {
          const updated = await setExactOrderStatusTx(client, current.id, "CANCELLED");
          if (!updated) throw new Error("cancel_transition_failed");
          cancelled = updated;
        } else if (current.status !== "CANCELLED") {
          throw new Error(`order_not_cancellable:${current.status}`);
        }
        await releaseOutstandingOrderHoldTx(
          client,
          cancelled.userId,
          holdAsset(cancelled, market),
          cancelled.id,
        );
        return cancelled;
      });
      if (!result.enabled) throw new Error("cancel_database_unavailable");

      this.books.remove(orderId, existing.market, existing.side);
      getOrderBook(existing.market).remove(existing.side, orderId);
      const event = createTradingEvent("OrderCancelled", {
        orderId,
        userId: existing.userId,
        market: existing.market,
        side: existing.side,
        remainingQuantity: result.value.remainingQuantity,
      });
      publishRealtimeEvent(event);
      return { cancelled: true, orderId };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "cancel_failed";
      return { cancelled: false, orderId, reason };
    }
  }

  async match(market: string): Promise<MatchResult> {
    return { market: market.toUpperCase(), trades: [], matched: 0 };
  }

  async snapshot(market: string, depth = 50): Promise<OrderBookSnapshot> {
    return getOrderBook(market).snapshot(depth);
  }

  async rebuildFromDatabase(): Promise<{ markets: number; orders: number }> {
    const openOrders = await getOpenOrdersForBook();
    this.books.clear();
    const markets = new Set<string>();
    let inserted = 0;

    for (const order of openOrders) {
      if (!order.price || order.type === "market" || !open(order)) continue;
      try {
        this.insertResting(order);
        markets.add(order.market);
        inserted++;
      } catch (error) {
        logger.error("[matching-engine] exact rebuild skipped invalid order", { orderId: order.id, error });
      }
    }
    logger.info("[matching-engine] exact order book rebuilt", { markets: markets.size, orders: inserted });
    return { markets: markets.size, orders: inserted };
  }
}

let engine: MatchingEngine | null = null;

export function getMatchingEngine(): MatchingEngine {
  if (!engine) engine = new MatchingEngine();
  return engine;
}

export async function rebuildMatchingEngineFromDatabase(): Promise<{ markets: number; orders: number }> {
  return getMatchingEngine().rebuildFromDatabase();
}
