import { D } from "@/lib/trading/decimal";
import { recordWithdrawalPriceSnapshot } from "./withdrawal-price-authority";

const PROVIDER_TIMEOUT_MS = 3_000;
const MAX_QUOTE_AGE_MS = 60_000;
const MAX_FUTURE_SKEW_MS = 30_000;
const MAX_SPREAD_RATIO = "0.02";

const COINBASE_PRODUCTS: Record<string, string> = {
  BTC: "BTC-USD", ETH: "ETH-USD", USDT: "USDT-USD", USDC: "USDC-USD",
  XRP: "XRP-USD", SOL: "SOL-USD", ADA: "ADA-USD", DOGE: "DOGE-USD",
  LTC: "LTC-USD", DOT: "DOT-USD", LINK: "LINK-USD", AVAX: "AVAX-USD",
  MATIC: "POL-USD",
};

const KRAKEN_PAIRS: Record<string, string> = {
  BTC: "XBTUSD", ETH: "ETHUSD", USDT: "USDTUSD", USDC: "USDCUSD",
  BNB: "BNBUSD", XRP: "XRPUSD", SOL: "SOLUSD", ADA: "ADAUSD",
  DOGE: "XDGUSD", TRX: "TRXUSD", LTC: "LTCUSD", DOT: "DOTUSD",
  LINK: "LINKUSD", AVAX: "AVAXUSD", MATIC: "POLUSD",
};

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", USDT: "tether", USDC: "usd-coin",
  BNB: "binancecoin", XRP: "ripple", SOL: "solana", ADA: "cardano",
  DOGE: "dogecoin", TRX: "tron", LTC: "litecoin", DOT: "polkadot",
  LINK: "chainlink", AVAX: "avalanche-2", MATIC: "polygon-ecosystem-token",
};

export type WithdrawalProviderQuote = {
  provider: "coinbase" | "kraken" | "coingecko";
  priceUsd: string;
  observedAt: Date;
};

export type WithdrawalPriceConsensus = {
  priceUsd: string;
  observedAt: Date;
  sources: string[];
};

async function fetchJson(
  url: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    headers: { accept: "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`price_provider_http_${response.status}`);
  const text = await response.text();
  if (text.length > 128_000) throw new Error("price_provider_response_too_large");
  return JSON.parse(text) as unknown;
}

async function coinbaseQuote(asset: string): Promise<WithdrawalProviderQuote | null> {
  const product = COINBASE_PRODUCTS[asset];
  if (!product) return null;
  const payload = (await fetchJson(
    `https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/stats`,
  )) as { last?: unknown };
  if (typeof payload.last !== "string") return null;
  return { provider: "coinbase", priceUsd: payload.last, observedAt: new Date() };
}

async function krakenQuote(asset: string): Promise<WithdrawalProviderQuote | null> {
  const pair = KRAKEN_PAIRS[asset];
  if (!pair) return null;
  const payload = (await fetchJson(
    `https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pair)}`,
  )) as { error?: unknown; result?: Record<string, { c?: unknown }> };
  if (!Array.isArray(payload.error) || payload.error.length > 0 || !payload.result) {
    return null;
  }
  const ticker = Object.values(payload.result)[0];
  const close = Array.isArray(ticker?.c) ? ticker.c[0] : null;
  if (typeof close !== "string") return null;
  return { provider: "kraken", priceUsd: close, observedAt: new Date() };
}

async function coinGeckoQuote(asset: string): Promise<WithdrawalProviderQuote | null> {
  const id = COINGECKO_IDS[asset];
  if (!id) return null;
  const apiKey = process.env.COINGECKO_API_KEY?.trim();
  const payload = (await fetchJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_last_updated_at=true&precision=18`,
    apiKey ? { headers: { "x-cg-demo-api-key": apiKey } } : {},
  )) as Record<string, { usd?: unknown; last_updated_at?: unknown }>;
  const row = payload[id];
  if (!row || (typeof row.usd !== "number" && typeof row.usd !== "string")) {
    return null;
  }
  const observedAt =
    typeof row.last_updated_at === "number"
      ? new Date(row.last_updated_at * 1000)
      : new Date();
  return { provider: "coingecko", priceUsd: String(row.usd), observedAt };
}

export function buildWithdrawalPriceConsensus(
  quotes: WithdrawalProviderQuote[],
  now = Date.now(),
): WithdrawalPriceConsensus | null {
  const valid = quotes
    .filter((quote) => {
      const age = now - quote.observedAt.getTime();
      if (age > MAX_QUOTE_AGE_MS || age < -MAX_FUTURE_SKEW_MS) return false;
      try {
        const price = D(quote.priceUsd);
        return price.isFinite() && price.gt(0);
      } catch {
        return false;
      }
    })
    .sort((a, b) => D(a.priceUsd).comparedTo(D(b.priceUsd)));

  const providers = new Set(valid.map((quote) => quote.provider));
  if (valid.length < 2 || providers.size < 2) return null;

  const min = D(valid[0].priceUsd);
  const max = D(valid[valid.length - 1].priceUsd);
  const midpoint = min.plus(max).div(2);
  if (midpoint.lte(0) || max.minus(min).div(midpoint).gt(MAX_SPREAD_RATIO)) {
    return null;
  }

  const median =
    valid.length % 2 === 1
      ? D(valid[Math.floor(valid.length / 2)].priceUsd)
      : D(valid[valid.length / 2 - 1].priceUsd)
          .plus(valid[valid.length / 2].priceUsd)
          .div(2);
  return {
    priceUsd: median.toFixed(18),
    observedAt: new Date(Math.min(...valid.map((quote) => quote.observedAt.getTime()))),
    sources: [...providers].sort(),
  };
}

export async function refreshWithdrawalPriceSnapshot(asset: string): Promise<boolean> {
  const normalized = asset.toUpperCase().trim();
  const settled = await Promise.allSettled([
    coinbaseQuote(normalized),
    krakenQuote(normalized),
    coinGeckoQuote(normalized),
  ]);
  const quotes = settled.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );
  const consensus = buildWithdrawalPriceConsensus(quotes);
  if (!consensus) return false;

  const id = await recordWithdrawalPriceSnapshot({
    asset: normalized,
    priceUsd: consensus.priceUsd,
    source: `consensus:${consensus.sources.join("+")}`,
    observedAt: consensus.observedAt,
    ttlSeconds: 120,
  });
  return Boolean(id);
}
