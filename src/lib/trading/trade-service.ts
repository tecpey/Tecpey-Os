import { randomUUID } from "crypto";
import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { MakerSide, Trade } from "./types";

// ── Row mapper ────────────────────────────────────────────────────────────────

function rowToTrade(row: Record<string, unknown>): Trade {
  return {
    id: String(row.id),
    market: String(row.market),
    buyerOrderId: String(row.buyer_order_id),
    sellerOrderId: String(row.seller_order_id),
    price: String(row.price),
    quantity: String(row.quantity),
    feeBuyer: String(row.fee_buyer),
    feeSeller: String(row.fee_seller),
    makerSide: String(row.maker_side) as MakerSide,
    executedAt: new Date(row.executed_at as string).toISOString(),
  };
}

// ── Create trade (engine-internal) ───────────────────────────────────────────

export type CreateTradeInput = {
  id: string;
  market: string;
  buyerOrderId: string;
  sellerOrderId: string;
  price: number;
  quantity: number;
  feeBuyer: number;
  feeSeller: number;
  makerSide: MakerSide;
};

export async function createTrade(input: CreateTradeInput): Promise<Trade | null> {
  const id = input.id || randomUUID();
  const result = await withDb(async (client) => {
    const rows = await client.query(
      `INSERT INTO trades
         (id, market, buyer_order_id, seller_order_id, price, quantity,
          fee_buyer, fee_seller, maker_side)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        id,
        input.market.toUpperCase(),
        input.buyerOrderId,
        input.sellerOrderId,
        input.price.toFixed(10),
        input.quantity.toFixed(10),
        input.feeBuyer.toFixed(10),
        input.feeSeller.toFixed(10),
        input.makerSide,
      ],
    );
    return rows.rows[0] ? rowToTrade(rows.rows[0]) : null;
  });

  if (!result.enabled || !result.value) {
    logger.error("[trade-service] failed to create trade", { input });
    return null;
  }
  return result.value;
}

// ── Public trade history ───────────────────────────────────────────────────────
// Returns recent trades for a market — public, no auth required.

export type TradeQueryOptions = {
  market: string;
  limit?: number;
};

export async function listTrades(options: TradeQueryOptions): Promise<Trade[]> {
  const result = await withDb(async (client) => {
    const limit = Math.min(options.limit ?? 50, 500);
    const rows = await client.query(
      `SELECT * FROM trades WHERE market = $1 ORDER BY executed_at DESC LIMIT $2`,
      [options.market.toUpperCase(), limit],
    );
    return rows.rows.map(rowToTrade);
  });

  if (!result.enabled) {
    logger.warn("[trade-service] DB not available for trades query", { market: options.market });
    return [];
  }
  return result.value ?? [];
}

// ── User trade history ─────────────────────────────────────────────────────────
// Returns trades where the given user was either buyer or seller.
// Requires knowing which order IDs belong to the user (join via orders table).

export async function listUserTrades(userId: string, market?: string, limit = 50): Promise<Trade[]> {
  const result = await withDb(async (client) => {
    const safeLimit = Math.min(limit, 200);
    const params: unknown[] = [userId, safeLimit];
    const marketClause = market ? `AND t.market = $${params.push(market.toUpperCase())}` : "";

    const rows = await client.query(
      `SELECT DISTINCT t.*
       FROM trades t
       JOIN orders o ON (o.id = t.buyer_order_id OR o.id = t.seller_order_id)
       WHERE o.user_id = $1 ${marketClause}
       ORDER BY t.executed_at DESC
       LIMIT $2`,
      params,
    );
    return rows.rows.map(rowToTrade);
  });

  if (!result.enabled) return [];
  return result.value ?? [];
}
