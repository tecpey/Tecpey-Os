import { withDb } from "@/lib/db";
import { getOrderBook } from "./order-book";
import {
  getOrderBookStore,
  getRedisClient,
  pkStr,
  type EngineOrder,
} from "./order-book-store";
import type { OrderSide } from "./types";

/**
 * Rebuilds one market cache from PostgreSQL authority. Only orders whose durable
 * admission command is final and accepted may become resting maker liquidity.
 * Merely admitted or currently processing orders are deliberately excluded.
 */
export async function rebuildMarketBookFromAuthority(market: string): Promise<void> {
  const normalized = market.toUpperCase();
  globalThis.tecpeyEngineBooks?.delete(normalized);
  const displayBook = getOrderBook(normalized);
  displayBook.clear();

  const redis = getRedisClient();
  if (redis) {
    await redis
      .pipeline()
      .del(`tecpey:ob:${normalized}:bids`)
      .del(`tecpey:ob:${normalized}:asks`)
      .exec();
  }

  const result = await withDb(async (client) => {
    const rows = await client.query<{
      id: string;
      user_id: string;
      side: OrderSide;
      price: string;
      quantity: string;
      remaining_quantity: string;
      created_at: Date;
    }>(
      `SELECT o.id::text, o.user_id, o.side, o.price::text,
              o.quantity::text, o.remaining_quantity::text, o.created_at
         FROM orders o
         JOIN exchange_order_commands command
           ON command.order_id = o.id
        WHERE o.market = $1
          AND o.status IN ('NEW', 'PARTIALLY_FILLED')
          AND o.type = 'limit'
          AND o.price IS NOT NULL
          AND command.state = 'final'
          AND COALESCE((command.result->>'accepted')::boolean, FALSE) = TRUE
        ORDER BY o.created_at ASC, o.id ASC`,
      [normalized],
    );
    return rows.rows;
  });
  if (!result.enabled) throw new Error("order_book_storage_unavailable");

  const store = getOrderBookStore();
  for (const row of result.value) {
    const entry: EngineOrder = {
      orderId: row.id,
      userId: row.user_id,
      market: normalized,
      side: row.side,
      pricePerUnit: Number(row.price),
      originalQty: Number(row.quantity),
      remaining: Number(row.remaining_quantity),
      ts: row.created_at.getTime(),
    };
    if (
      !Number.isFinite(entry.pricePerUnit) ||
      !Number.isFinite(entry.originalQty) ||
      !Number.isFinite(entry.remaining) ||
      entry.pricePerUnit <= 0 ||
      entry.remaining <= 0
    ) {
      throw new Error("order_book_authority_row_invalid");
    }
    store.insert(normalized, entry);
    displayBook.insert(
      entry.side,
      pkStr(entry.pricePerUnit),
      entry.remaining.toFixed(10),
    );
  }
}
