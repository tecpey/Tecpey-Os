import { withDb } from "@/lib/db";

export type MarketStats = {
  market: string;
  lastPrice: string | null;
  openPrice24h: string | null;
  closePrice: string | null;
  highPrice24h: string | null;
  lowPrice24h: string | null;
  baseVolume24h: string;
  quoteVolume24h: string;
  vwap24h: string | null;
  priceChange24h: string | null;
  priceChangePct24h: string | null;
  tradeCount24h: number;
  updatedAt: string;
};

export async function getMarketStats(market: string): Promise<MarketStats | null> {
  const result = await withDb(async (client) => {
    const sym = market.toUpperCase();
    const rows = await client.query<{
      trade_count: string;
      base_volume: string;
      quote_volume: string;
      high_24h: string | null;
      low_24h: string | null;
      vwap_24h: string | null;
      open_24h: string | null;
      last_price: string | null;
    }>(
      `SELECT
         COUNT(*)::text                                           AS trade_count,
         COALESCE(SUM(quantity::numeric), 0)::text               AS base_volume,
         COALESCE(SUM(quantity::numeric * price::numeric), 0)::text AS quote_volume,
         MAX(price::numeric)::text                               AS high_24h,
         MIN(price::numeric)::text                               AS low_24h,
         CASE WHEN SUM(quantity::numeric) > 0
              THEN (SUM(quantity::numeric * price::numeric) / SUM(quantity::numeric))::text
              ELSE NULL
         END                                                     AS vwap_24h,
         (SELECT price FROM trades
          WHERE market = $1 AND executed_at >= NOW() - INTERVAL '24 hours'
          ORDER BY executed_at ASC LIMIT 1)                      AS open_24h,
         (SELECT price FROM trades
          WHERE market = $1
          ORDER BY executed_at DESC LIMIT 1)                     AS last_price
       FROM trades
       WHERE market = $1 AND executed_at >= NOW() - INTERVAL '24 hours'`,
      [sym],
    );

    const row = rows.rows[0];
    if (!row) return null;

    const open = row.open_24h ? parseFloat(row.open_24h) : null;
    const last = row.last_price ? parseFloat(row.last_price) : null;

    let priceChange: string | null = null;
    let priceChangePct: string | null = null;
    if (open !== null && last !== null) {
      const change = last - open;
      priceChange = change.toFixed(10);
      priceChangePct = open !== 0 ? ((change / open) * 100).toFixed(4) : null;
    }

    return {
      market: sym,
      lastPrice: row.last_price ?? null,
      openPrice24h: row.open_24h ?? null,
      closePrice: row.last_price ?? null,
      highPrice24h: row.high_24h ?? null,
      lowPrice24h: row.low_24h ?? null,
      baseVolume24h: row.base_volume,
      quoteVolume24h: row.quote_volume,
      vwap24h: row.vwap_24h ?? null,
      priceChange24h: priceChange,
      priceChangePct24h: priceChangePct,
      tradeCount24h: parseInt(row.trade_count, 10),
      updatedAt: new Date().toISOString(),
    };
  });

  if (!result.enabled) return null;
  return result.value ?? null;
}
