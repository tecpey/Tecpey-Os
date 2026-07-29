import { randomUUID } from "crypto";
import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { MakerSide, Trade } from "./types";
import { canonicalMatchingInput } from "./matching-financials";

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

export type CreateTradeInput = {
  id: string;
  market: string;
  buyerOrderId: string;
  sellerOrderId: string;
  price: string;
  quantity: string;
  feeBuyer: string;
  feeSeller: string;
  makerSide: MakerSide;
};

function canonicalTradeInput(input: CreateTradeInput): CreateTradeInput {
  return {
    ...input,
    market: input.market.toUpperCase(),
    price: canonicalMatchingInput(input.price, "trade_price"),
    quantity: canonicalMatchingInput(input.quantity, "trade_quantity"),
    feeBuyer: canonicalMatchingInput(input.feeBuyer, "buyer_trade_fee"),
    feeSeller: canonicalMatchingInput(input.feeSeller, "seller_trade_fee"),
  };
}

export async function createTradeTx(
  client: import("pg").PoolClient,
  rawInput: CreateTradeInput,
): Promise<Trade | null> {
  const input = canonicalTradeInput(rawInput);
  const id = input.id || randomUUID();
  try {
    const rows = await client.query(
      `INSERT INTO trades
         (id, market, buyer_order_id, seller_order_id, price, quantity,
          fee_buyer, fee_seller, maker_side)
       VALUES ($1,$2,$3,$4,$5::numeric,$6::numeric,$7::numeric,$8::numeric,$9)
       RETURNING *`,
      [
        id,
        input.market,
        input.buyerOrderId,
        input.sellerOrderId,
        input.price,
        input.quantity,
        input.feeBuyer,
        input.feeSeller,
        input.makerSide,
      ],
    );
    return rows.rows[0] ? rowToTrade(rows.rows[0]) : null;
  } catch (error) {
    logger.error("[trade-service] createTradeTx failed", { input, error });
    return null;
  }
}

export async function createTrade(input: CreateTradeInput): Promise<Trade | null> {
  const result = await withDb((client) => createTradeTx(client, input));
  if (!result.enabled || !result.value) {
    logger.error("[trade-service] failed to create trade", { input });
    return null;
  }
  return result.value;
}

export type TradeQueryOptions = {
  market: string;
  limit?: number;
  before?: string;
  from?: string;
  to?: string;
};

export async function listTrades(options: TradeQueryOptions): Promise<Trade[]> {
  const result = await withDb(async (client) => {
    const params: unknown[] = [options.market.toUpperCase()];
    const conditions: string[] = ["market = $1"];
    if (options.before) {
      params.push(options.before);
      conditions.push(`executed_at < $${params.length}`);
    }
    if (options.from) {
      params.push(options.from);
      conditions.push(`executed_at >= $${params.length}`);
    }
    if (options.to) {
      params.push(options.to);
      conditions.push(`executed_at <= $${params.length}`);
    }
    const limit = Math.min(options.limit ?? 50, 500);
    params.push(limit);
    const rows = await client.query(
      `SELECT * FROM trades WHERE ${conditions.join(" AND ")}
       ORDER BY executed_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.rows.map(rowToTrade);
  });
  if (!result.enabled) {
    logger.warn("[trade-service] DB not available for trades query", {
      market: options.market,
    });
    return [];
  }
  return result.value ?? [];
}

export async function listUserTrades(
  userId: string,
  market?: string,
  limit = 50,
  before?: string,
): Promise<Trade[]> {
  const result = await withDb(async (client) => {
    const safeLimit = Math.min(limit, 200);
    const params: unknown[] = [userId];
    const beforeFilter = before ? `AND executed_at < $2` : "";
    if (before) params.push(before);
    const marketFilter = market
      ? `AND market = '${market.toUpperCase().replace(/'/g, "''")}'`
      : "";
    const rows = await client.query(
      `SELECT * FROM (
         SELECT t.* FROM trades t
          WHERE t.buyer_order_id IN (SELECT id FROM orders WHERE user_id = $1)
          ${marketFilter} ${beforeFilter}
         UNION
         SELECT t.* FROM trades t
          WHERE t.seller_order_id IN (SELECT id FROM orders WHERE user_id = $1)
          ${marketFilter} ${beforeFilter}
       ) combined
       ORDER BY executed_at DESC
       LIMIT ${safeLimit}`,
      params,
    );
    return rows.rows.map(rowToTrade);
  });
  if (!result.enabled) return [];
  return result.value ?? [];
}
