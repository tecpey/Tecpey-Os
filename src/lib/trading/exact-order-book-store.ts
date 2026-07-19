import { D } from "./decimal";
import type { Order, OrderSide } from "./types";

export type ExactEngineOrder = {
  id: string;
  userId: string;
  market: string;
  side: OrderSide;
  price: string;
  originalQuantity: string;
  remainingQuantity: string;
  timeInForce: "GTC" | "IOC" | "FOK";
  createdAt: string;
};

export type ExactPriceLevel = {
  price: string;
  orders: ExactEngineOrder[];
};

type SideBook = Map<string, ExactEngineOrder[]>;
type MarketBook = { bids: SideBook; asks: SideBook };

function canonical(value: string): string {
  return D(value).toFixed(10);
}

export function orderToExactEngineOrder(order: Order): ExactEngineOrder {
  if (!order.price) throw new Error("resting_order_price_required");
  return {
    id: order.id,
    userId: order.userId,
    market: order.market,
    side: order.side,
    price: canonical(order.price),
    originalQuantity: canonical(order.quantity),
    remainingQuantity: canonical(order.remainingQuantity),
    timeInForce: order.timeInForce,
    createdAt: order.createdAt,
  };
}

export class ExactOrderBookStore {
  private readonly books = new Map<string, MarketBook>();

  private market(market: string): MarketBook {
    const key = market.toUpperCase();
    let book = this.books.get(key);
    if (!book) {
      book = { bids: new Map(), asks: new Map() };
      this.books.set(key, book);
    }
    return book;
  }

  insert(order: ExactEngineOrder): void {
    if (D(order.remainingQuantity).lte(0)) return;
    const book = this.market(order.market);
    const side = order.side === "buy" ? book.bids : book.asks;
    const price = canonical(order.price);
    const queue = side.get(price) ?? [];
    if (queue.some((existing) => existing.id === order.id)) return;
    queue.push({ ...order, price });
    queue.sort((left, right) => {
      const time = Date.parse(left.createdAt) - Date.parse(right.createdAt);
      return time !== 0 ? time : left.id.localeCompare(right.id);
    });
    side.set(price, queue);
  }

  remove(orderId: string, market: string, side: OrderSide): boolean {
    const book = this.books.get(market.toUpperCase());
    if (!book) return false;
    const sideBook = side === "buy" ? book.bids : book.asks;
    for (const [price, orders] of sideBook) {
      const next = orders.filter((order) => order.id !== orderId);
      if (next.length === orders.length) continue;
      if (next.length === 0) sideBook.delete(price);
      else sideBook.set(price, next);
      return true;
    }
    return false;
  }

  updateRemaining(orderId: string, market: string, side: OrderSide, remaining: string): void {
    const book = this.books.get(market.toUpperCase());
    if (!book) return;
    const sideBook = side === "buy" ? book.bids : book.asks;
    for (const [price, orders] of sideBook) {
      const found = orders.find((order) => order.id === orderId);
      if (!found) continue;
      if (D(remaining).lte(0)) {
        this.remove(orderId, market, side);
      } else {
        found.remainingQuantity = canonical(remaining);
        sideBook.set(price, orders);
      }
      return;
    }
  }

  oppositeLevels(market: string, takerSide: OrderSide): ExactPriceLevel[] {
    const book = this.books.get(market.toUpperCase());
    if (!book) return [];
    const side = takerSide === "buy" ? book.asks : book.bids;
    return [...side.entries()]
      .sort(([left], [right]) => takerSide === "buy" ? D(left).cmp(D(right)) : D(right).cmp(D(left)))
      .map(([price, orders]) => ({ price, orders: orders.map((order) => ({ ...order })) }));
  }

  availableVolume(market: string, takerSide: OrderSide, limitPrice: string | null): string {
    let total = D(0);
    for (const level of this.oppositeLevels(market, takerSide)) {
      if (limitPrice !== null) {
        const crosses = takerSide === "buy"
          ? D(level.price).lte(D(limitPrice))
          : D(level.price).gte(D(limitPrice));
        if (!crosses) break;
      }
      for (const order of level.orders) total = total.plus(D(order.remainingQuantity));
    }
    return total.toFixed(10);
  }

  clear(): void {
    this.books.clear();
  }
}
