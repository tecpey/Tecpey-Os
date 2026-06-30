import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { Asset, Market } from "./types";

// ── Row → domain mappers ──────────────────────────────────────────────────────

function rowToAsset(row: Record<string, unknown>): Asset {
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    name: String(row.name),
    precision: Number(row.precision),
    status: String(row.status) as Asset["status"],
    depositEnabled: Boolean(row.deposit_enabled),
    withdrawEnabled: Boolean(row.withdraw_enabled),
    minDeposit: String(row.min_deposit),
    minWithdraw: String(row.min_withdraw),
    withdrawFee: String(row.withdraw_fee),
    displayOrder: Number(row.display_order),
    metadata: (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>,
  };
}

function rowToMarket(row: Record<string, unknown>): Market {
  return {
    symbol: String(row.symbol),
    baseAsset: String(row.base_asset),
    quoteAsset: String(row.quote_asset),
    status: String(row.status) as Market["status"],
    tickSize: String(row.tick_size),
    stepSize: String(row.step_size),
    minOrderValue: String(row.min_order_value),
    maxOrderValue: String(row.max_order_value),
    pricePrecision: Number(row.price_precision),
    quantityPrecision: Number(row.quantity_precision),
    makerFee: String(row.maker_fee),
    takerFee: String(row.taker_fee),
  };
}

// ── Asset queries ─────────────────────────────────────────────────────────────

export async function listAssets(activeOnly = true): Promise<Asset[]> {
  const result = await withDb(async (client) => {
    const query = activeOnly
      ? `SELECT * FROM assets WHERE status = 'active' ORDER BY display_order ASC, symbol ASC`
      : `SELECT * FROM assets ORDER BY display_order ASC, symbol ASC`;
    const rows = await client.query(query);
    return rows.rows.map(rowToAsset);
  });
  if (!result.enabled) {
    logger.warn("[market-service] DB not available, returning empty asset list");
    return [];
  }
  return result.value ?? [];
}

export async function getAsset(symbol: string): Promise<Asset | null> {
  const result = await withDb(async (client) => {
    const rows = await client.query(
      `SELECT * FROM assets WHERE symbol = $1 LIMIT 1`,
      [symbol.toUpperCase()],
    );
    return rows.rows[0] ? rowToAsset(rows.rows[0]) : null;
  });
  if (!result.enabled) return null;
  return result.value ?? null;
}

// ── Market queries ────────────────────────────────────────────────────────────

export async function listMarkets(activeOnly = true): Promise<Market[]> {
  const result = await withDb(async (client) => {
    const query = activeOnly
      ? `SELECT * FROM markets WHERE status = 'active' ORDER BY symbol ASC`
      : `SELECT * FROM markets ORDER BY symbol ASC`;
    const rows = await client.query(query);
    return rows.rows.map(rowToMarket);
  });
  if (!result.enabled) {
    logger.warn("[market-service] DB not available, returning empty market list");
    return [];
  }
  return result.value ?? [];
}

export async function getMarket(symbol: string): Promise<Market | null> {
  const result = await withDb(async (client) => {
    const rows = await client.query(
      `SELECT * FROM markets WHERE symbol = $1 LIMIT 1`,
      [symbol.toUpperCase()],
    );
    return rows.rows[0] ? rowToMarket(rows.rows[0]) : null;
  });
  if (!result.enabled) return null;
  return result.value ?? null;
}
