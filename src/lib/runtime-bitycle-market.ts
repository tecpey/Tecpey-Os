import WebSocket from "ws";
import Decimal from "decimal.js";
import type { ArenaPriceSnapshot } from "./trading-arena-execution-v2";

const BITYCLE_STREAM_URL = "wss://streamer.bitycle.com/ws/market_data";
const DEFAULT_SOURCE = "binance_spot";
const AUTHORITATIVE_TIMEFRAME = "1m";
const MAX_PRICE_AGE_MS = 15_000;
const MAX_FUTURE_SKEW_MS = 5_000;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_JITTER_RATIO = 0.2;
const MAX_WEBSOCKET_PAYLOAD_BYTES = 64 * 1024;
const INACTIVITY_TIMEOUT_MS = 20_000;
const WATCHDOG_INTERVAL_MS = 5_000;

export type BitycleRealtimeMarket = "BTCUSDT" | "ETHUSDT";

type TimestampAuthority = "provider" | "receipt";

type PricePoint = {
  market: BitycleRealtimeMarket;
  source: string;
  price: string;
  observedAt: string;
  timestampAuthority: TimestampAuthority;
};

type BitycleMpEnvelope = {
  type?: unknown;
  d?: {
    f?: unknown;
    p?: unknown;
    s?: unknown;
  };
};

type BitycleMdEnvelope = {
  type?: unknown;
  d?: {
    c?: unknown;
    f?: unknown;
    s?: unknown;
    t?: unknown;
  };
};

export type BitycleRealtimeHealth = {
  connected: boolean;
  source: string | null;
  lastMessageAt: string | null;
  lastProviderEventAt: string | null;
  reconnectCount: number;
  disconnectCount: number;
};

type RuntimeState = {
  prices: Partial<Record<BitycleRealtimeMarket, PricePoint>>;
  health: BitycleRealtimeHealth;
};

declare global {
  var tecpeyBitycleRealtimeState: RuntimeState | undefined;
}

function emptyHealth(): BitycleRealtimeHealth {
  return {
    connected: false,
    source: null,
    lastMessageAt: null,
    lastProviderEventAt: null,
    reconnectCount: 0,
    disconnectCount: 0,
  };
}

function state(): RuntimeState {
  if (!globalThis.tecpeyBitycleRealtimeState) {
    globalThis.tecpeyBitycleRealtimeState = { prices: {}, health: emptyHealth() };
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

function timeframeName(value: unknown): string | null {
  return typeof value === "string" && value.trim() === AUTHORITATIVE_TIMEFRAME
    ? AUTHORITATIVE_TIMEFRAME
    : null;
}

function receiptTimestamp(value: string): string | null {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function providerTimestampFromSeconds(value: unknown): string | null {
  const seconds = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 10_000_000_000) return null;
  const milliseconds = Math.trunc(seconds * 1_000);
  if (!Number.isSafeInteger(milliseconds)) return null;
  try {
    return new Date(milliseconds).toISOString();
  } catch {
    return null;
  }
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

  const envelopeType = (payload as { type?: unknown }).type;
  if (envelopeType === "md") {
    const envelope = payload as BitycleMdEnvelope;
    if (!envelope.d || typeof envelope.d !== "object" || !Array.isArray(envelope.d.c)) return null;
    const market = marketName(envelope.d.s);
    const source = sourceName(envelope.d.f);
    const timeframe = timeframeName(envelope.d.t);
    const price = decimalPrice(envelope.d.c[4]);
    const providerAt = providerTimestampFromSeconds(envelope.d.c[6]);
    if (!market || !source || !timeframe || !price || !providerAt) return null;
    return {
      market,
      source,
      price,
      observedAt: providerAt,
      timestampAuthority: "provider",
    };
  }

  if (envelopeType === "mp") {
    const envelope = payload as BitycleMpEnvelope;
    if (!envelope.d || typeof envelope.d !== "object") return null;
    const market = marketName(envelope.d.s);
    const source = sourceName(envelope.d.f);
    const price = decimalPrice(envelope.d.p);
    const receiptAt = receiptTimestamp(observedAt);
    if (!market || !source || !price || !receiptAt) return null;
    return {
      market,
      source,
      price,
      observedAt: receiptAt,
      timestampAuthority: "receipt",
    };
  }

  return null;
}

export function recordBitycleRealtimePrice(point: PricePoint): boolean {
  const current = state().prices[point.market];
  const nextAt = Date.parse(point.observedAt);
  if (!Number.isFinite(nextAt)) return false;
  if (current) {
    const currentAt = Date.parse(current.observedAt);
    if (Number.isFinite(currentAt) && nextAt < currentAt) return false;
  }
  state().prices[point.market] = point;
  return true;
}

export function getFreshBitycleArenaSnapshot(now = Date.now()): ArenaPriceSnapshot | null {
  const current = state().prices;
  const btc = current.BTCUSDT;
  const eth = current.ETHUSDT;
  if (!btc || !eth) return null;
  if (btc.timestampAuthority !== "provider" || eth.timestampAuthority !== "provider") return null;

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

export function getBitycleRealtimeHealth(): BitycleRealtimeHealth {
  return { ...state().health };
}

export function clearBitycleRealtimeMarketForTests(): void {
  globalThis.tecpeyBitycleRealtimeState = { prices: {}, health: emptyHealth() };
}

export type BitycleMarketRealtimeController = {
  stop(): Promise<void>;
};

function reconnectDelay(baseMs: number): number {
  const spread = baseMs * RECONNECT_JITTER_RATIO;
  return Math.max(
    RECONNECT_MIN_MS,
    Math.round(baseMs - spread + (Math.random() * spread * 2)),
  );
}

export function startBitycleMarketRealtime(): BitycleMarketRealtimeController | null {
  const token = process.env.BITYCLE_STREAM_TOKEN?.trim();
  if (!token) return null;

  const source = sourceName(process.env.BITYCLE_MARKET_SOURCE?.trim() || DEFAULT_SOURCE) || DEFAULT_SOURCE;
  let socket: WebSocket | null = null;
  let stopped = false;
  let reconnectMs = RECONNECT_MIN_MS;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let watchdogTimer: NodeJS.Timeout | null = null;

  const runtime = state();
  runtime.prices = {};
  runtime.health = { ...emptyHealth(), source };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    const delay = reconnectDelay(reconnectMs);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      runtime.health.reconnectCount += 1;
      connect();
    }, delay);
    reconnectTimer.unref?.();
    reconnectMs = Math.min(reconnectMs * 2, RECONNECT_MAX_MS);
  };

  const connect = () => {
    if (stopped) return;
    const ws = new WebSocket(BITYCLE_STREAM_URL, {
      headers: { "X-Bitycle-Token": token },
      handshakeTimeout: 5_000,
      maxPayload: MAX_WEBSOCKET_PAYLOAD_BYTES,
      perMessageDeflate: false,
    });
    socket = ws;

    ws.on("open", () => {
      reconnectMs = RECONNECT_MIN_MS;
      runtime.health.connected = true;
      runtime.health.lastMessageAt = new Date().toISOString();
      for (const market of ["BTCUSDT", "ETHUSDT"] as const) {
        ws.send(JSON.stringify({
          message_type: "subscribe_live_market",
          data: { market, tf: AUTHORITATIVE_TIMEFRAME, source },
        }));
      }
    });

    ws.on("message", (data) => {
      const receivedAt = new Date().toISOString();
      runtime.health.lastMessageAt = receivedAt;
      const point = parseBitycleRealtimeMarketMessage(data, receivedAt);
      if (point && point.source === source && recordBitycleRealtimePrice(point)) {
        if (point.timestampAuthority === "provider") {
          runtime.health.lastProviderEventAt = point.observedAt;
        }
      }
    });

    ws.on("error", () => {
      // The close handler owns bounded reconnect. Avoid logging credentials or raw frames.
    });

    ws.on("close", () => {
      if (socket === ws) socket = null;
      runtime.health.connected = false;
      runtime.health.disconnectCount += 1;
      scheduleReconnect();
    });
  };

  connect();
  watchdogTimer = setInterval(() => {
    if (stopped || !socket || socket.readyState !== WebSocket.OPEN) return;
    const lastMessageAt = runtime.health.lastMessageAt
      ? Date.parse(runtime.health.lastMessageAt)
      : Number.NaN;
    if (!Number.isFinite(lastMessageAt) || Date.now() - lastMessageAt > INACTIVITY_TIMEOUT_MS) {
      socket.terminate();
    }
  }, WATCHDOG_INTERVAL_MS);
  watchdogTimer.unref?.();

  return {
    async stop() {
      stopped = true;
      runtime.health.connected = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      if (watchdogTimer) clearInterval(watchdogTimer);
      watchdogTimer = null;
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
