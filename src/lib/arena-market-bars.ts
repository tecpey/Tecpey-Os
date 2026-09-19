import Decimal from "decimal.js";
import type { ArenaExecutionAsset } from "./trading-arena-execution-v2";

const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";
const REQUEST_TIMEOUT_MS = 4_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_BARS = 1_000;

export const ARENA_BAR_RESOLUTIONS = ["1", "5", "15", "60", "240", "1D"] as const;
export type ArenaBarResolution = typeof ARENA_BAR_RESOLUTIONS[number];

export type ArenaMarketBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ArenaMarketBarsSnapshot = {
  asset: ArenaExecutionAsset;
  resolution: ArenaBarResolution;
  bars: ArenaMarketBar[];
  source: "binance_spot_public";
  observedAt: string;
};

export class ArenaMarketBarsError extends Error {
  constructor(message = "arena_market_bars_unavailable") {
    super(message);
    this.name = "ArenaMarketBarsError";
  }
}

const INTERVAL: Record<ArenaBarResolution, string> = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "60": "1h",
  "240": "4h",
  "1D": "1d",
};

export function parseArenaBarAsset(value: unknown): ArenaExecutionAsset | null {
  const asset = typeof value === "string" ? value.trim().toUpperCase() : "";
  return asset === "BTC" || asset === "ETH" ? asset : null;
}

export function parseArenaBarResolution(value: unknown): ArenaBarResolution | null {
  const resolution = typeof value === "string" ? value.trim().toUpperCase() : "";
  return (ARENA_BAR_RESOLUTIONS as readonly string[]).includes(resolution)
    ? resolution as ArenaBarResolution
    : null;
}

function finiteDecimal(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  try {
    const parsed = new Decimal(value);
    if (!parsed.isFinite() || parsed.isNegative()) return null;
    const number = parsed.toNumber();
    return Number.isFinite(number) ? number : null;
  } catch {
    return null;
  }
}

export function parseBinanceKlines(payload: unknown): ArenaMarketBar[] {
  if (!Array.isArray(payload)) throw new ArenaMarketBarsError("arena_market_bars_invalid_payload");
  const bars: ArenaMarketBar[] = [];
  let previousTime = -1;
  for (const row of payload) {
    if (!Array.isArray(row) || row.length < 6) {
      throw new ArenaMarketBarsError("arena_market_bars_invalid_payload");
    }
    const time = Number(row[0]);
    const open = finiteDecimal(row[1]);
    const high = finiteDecimal(row[2]);
    const low = finiteDecimal(row[3]);
    const close = finiteDecimal(row[4]);
    const volume = finiteDecimal(row[5]);
    if (!Number.isSafeInteger(time) || time < 0 || open === null || high === null || low === null || close === null || volume === null) {
      throw new ArenaMarketBarsError("arena_market_bars_invalid_payload");
    }
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || high < Math.max(open, close, low) || low > Math.min(open, close, high) || time <= previousTime) {
      throw new ArenaMarketBarsError("arena_market_bars_invalid_payload");
    }
    previousTime = time;
    bars.push({ time, open, high, low, close, volume });
  }
  return bars;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const length = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
    throw new ArenaMarketBarsError("arena_market_bars_response_too_large");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new ArenaMarketBarsError("arena_market_bars_response_too_large");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ArenaMarketBarsError("arena_market_bars_invalid_json");
  }
}

export async function getArenaMarketBars(input: {
  asset: ArenaExecutionAsset;
  resolution: ArenaBarResolution;
  from?: number;
  to?: number;
  countBack?: number;
}): Promise<ArenaMarketBarsSnapshot> {
  const countBack = Math.max(1, Math.min(MAX_BARS, Math.trunc(input.countBack || 300)));
  const params = new URLSearchParams({
    symbol: `${input.asset}USDT`,
    interval: INTERVAL[input.resolution],
    limit: String(countBack),
  });
  if (Number.isSafeInteger(input.from) && Number(input.from) > 0) params.set("startTime", String(Number(input.from) * 1000));
  if (Number.isSafeInteger(input.to) && Number(input.to) > 0) params.set("endTime", String((Number(input.to) * 1000) - 1));

  let response: Response;
  try {
    response = await fetch(`${BINANCE_KLINES_URL}?${params}`, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ArenaMarketBarsError();
  }
  if (!response.ok) throw new ArenaMarketBarsError(`arena_market_bars_http_${response.status}`);
  const bars = parseBinanceKlines(await readBoundedJson(response));
  return {
    asset: input.asset,
    resolution: input.resolution,
    bars,
    source: "binance_spot_public",
    observedAt: new Date().toISOString(),
  };
}
