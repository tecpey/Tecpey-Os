import WebSocket from "ws";
import Decimal from "decimal.js";
import type { ArenaPriceSnapshot } from "./trading-arena-execution-v2";

const BITYCLE_STREAM_URL = "wss://streamer.bitycle.com/ws/market_data";
const DEFAULT_SOURCE = "binance_spot";
const MAX_PRICE_AGE_MS = 15_000;
const MAX_FUTURE_SKEW_MS = 5_000;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export type BitycleRealtimeMarket = "BTCUSDT" | "ETHUSDT";

type PricePoint = {
  market: BitycleRealtimeMarket;
  source: string;
  price: string;
  observedAt: string;
};

type BitycleMpEnvelope = {
  type?: unknown;
  d?: {
    f?: unknown;
    p?: unknown;
    s?: unknown;
  };
};

type RuntimeState = {
  prices: Partial<Record<BitycleRealtimeMarket, PricePoint>>;
};

declare global {
  var tecpeyBitycleRealtimeState: RuntimeState | undefined;
}

function state(): RuntimeState {
  if (!globalThis.tecpeyBitycleRealtimeState) {
    globalThis.tecpeyBitycleRealtimeState = { prices: {} };
  }
  return globalThis.tecpeyBitycleRealtimeState;
}

function decimalPrice(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  try {
    const price = new Decimal(value);
    if (!price.isFinite() || price.lte(0) || price.gte("1000000000")) return null;
    return price.toDecimalPlaces(10, Decimal.ROUND_DOWN).toFixed(10);
  } catch {
    return null;
  }
}

function marketName(value: unknown): BitycleRealtimeMarket | null {
  const market = typeof value === "string" ? value.trim().toUpperCase() : "";
  return market === "BTCUSDT" || market === "ETHUSDT" ? market : null;
}

function sourceName(value: unknown): string | null {
  const source = typeof value === "string" ? value.trim() : "";
  if (!/^[a-z0-9_]{2,40}$/.test(source)) return null;
  return source;
}

export function parseBitycleRealtimeMarketMessage(
  value: unknown,
  observedAt = new Date().toISOString(),
): PricePoint | null {
  let payload: unknown = value;
  if (Buffer.isBuffer(value)) payload = value.toString("utf8");
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== "object") return null;

  const envelope = payload as BitycleMpEnvelope;
  if (envelope.type !== "mp" || !envelope.d || typeof envelope.d !== "object") return null;
  const market = marketName(envelope.d.s);
  const source = sourceName(envelope.d.f);
  const price = decimalPrice(envelope.d.p);
  const time = Date.parse(observedAt);
  if (!market || !source || !price || !Number.isFinite(time)) return null;

  return { market, source, price, observedAt: new Date(time).toISOString() };
}

export function recordBitycleRealtimePrice(point: PricePoint): void {
  state().prices[point.market] = point;
}

export function getFreshBitycleArenaSnapshot(now = Date.now()): ArenaPriceSnapshot | null {
  const current = state().prices;
  const btc = current.BTCUSDT;
  const eth = current.ETHUSDT;
  if (!btc || !eth) return null;

  for (const point of [btc, eth]) {
    const observed = Date.parse(point.observedAt);
    if (!Number.isFinite(observed)) return null;
    const age = now - observed;
    if (age > MAX_PRICE_AGE_MS || age < -MAX_FUTURE_SKEW_MS) return null;
  }
  if (btc.source !== eth.source) return null;

  const observedAt = Date.parse(btc.observedAt) <= Date.parse(eth.observedAt)
    ? btc.observedAt
    : eth.observedAt;

  return {
    prices: { BTC: btc.price, ETH: eth.price },
    source: `bitycle_ws:${btc.source}`,
    observedAt,
  };
}

export function clearBitycleRealtimeMarketForTests(): void {
  globalThis.tecpeyBitycleRealtimeState = { prices: {} };
}

export type BitycleMarketRealtimeController = {
  stop(): Promise<void>;
};

export function startBitycleMarketRealtime(): BitycleMarketRealtimeController | null {
  const token = process.env.BITYCLE_STREAM_TOKEN?.trim();
  if (!token) return null;

  const source = sourceName(process.env.BITYCLE_MARKET_SOURCE?.trim() || DEFAULT_SOURCE) || DEFAULT_SOURCE;
  let socket: WebSocket | null = null;
  let stopped = false;
  let reconnectMs = RECONNECT_MIN_MS;
  let reconnectTimer: NodeJS.Timeout | null = null;

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectMs);
    reconnectTimer.unref?.();
    reconnectMs = Math.min(reconnectMs * 2, RECONNECT_MAX_MS);
  };

  const connect = () => {
    if (stopped) return;
    const ws = new WebSocket(BITYCLE_STREAM_URL, {
      headers: { "X-Bitycle-Token": token },
      handshakeTimeout: 5_000,
      perMessageDeflate: false,
    });
    socket = ws;

    ws.on("open", () => {
      reconnectMs = RECONNECT_MIN_MS;
      for (const market of ["BTCUSDT", "ETHUSDT"] as const) {
        ws.send(JSON.stringify({
          message_type: "subscribe_market_price",
          data: { market, source },
        }));
      }
    });

    ws.on("message", (data) => {
      const point = parseBitycleRealtimeMarketMessage(data, new Date().toISOString());
      if (point && point.source === source) recordBitycleRealtimePrice(point);
    });

    ws.on("error", () => {
      // The close handler owns bounded reconnect. Avoid logging credentials or raw frames.
    });

    ws.on("close", () => {
      if (socket === ws) socket = null;
      scheduleReconnect();
    });
  };

  connect();

  return {
    async stop() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      const active = socket;
      socket = null;
      if (!active || active.readyState === WebSocket.CLOSED) return;
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          active.terminate();
          resolve();
        }, 1_000);
        timeout.unref?.();
        active.once("close", () => {
          clearTimeout(timeout);
          resolve();
        });
        active.close(1000, "server_shutdown");
      });
    },
  };
}
