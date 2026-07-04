// Redis Pub/Sub manager for cross-instance event distribution.
// Phase 33: Distributes trading events to all connected server instances.
//
// Architecture:
//   pubClient  — regular Redis client for PUBLISH commands
//   subClient  — dedicated subscriber-mode client (subscribe-only)
//   nodeId     — unique per-process identifier (for metrics)
//
// Each instance publishes AND subscribes. Every instance (including the
// publisher) receives all events and broadcasts to its local WS clients.
// This eliminates sticky-session requirements.

import { randomUUID } from "crypto";
import { logger } from "@/lib/logger";
import type { Redis } from "ioredis";
import type {
  TradeExecutedPayload,
  OrderUpdatedPayload,
  OrderBookChangedPayload,
  TickerUpdatedPayload,
  WalletChangedPayload,
} from "@/lib/event-bus";

// ── Channels ──────────────────────────────────────────────────────────────────

export const CHANNELS = {
  TRADE:     "tecpey:events:trade",
  ORDER:     "tecpey:events:order",
  ORDERBOOK: "tecpey:events:orderbook",
  TICKER:    "tecpey:events:ticker",
  WALLET:    "tecpey:events:wallet",
} as const;

type ChannelKey = (typeof CHANNELS)[keyof typeof CHANNELS];

// ── Payload envelope ──────────────────────────────────────────────────────────

type Envelope<T> = {
  nodeId: string;
  ts: number;
  payload: T;
};

// ── Dispatcher types ──────────────────────────────────────────────────────────

type PubSubHandlers = {
  onTrade: (payload: TradeExecutedPayload) => void;
  onOrder: (payload: OrderUpdatedPayload) => void;
  onOrderBook: (payload: OrderBookChangedPayload) => void;
  onTicker: (payload: TickerUpdatedPayload) => void;
  onWallet: (payload: WalletChangedPayload) => void;
};

// ── Metrics ───────────────────────────────────────────────────────────────────

export type PubSubMetrics = {
  connected: boolean;
  nodeId: string;
  published: number;
  received: number;
  dropped: number;
  reconnects: number;
  latencyMs: number | null;
  subscribedChannels: number;
};

// ── Class ─────────────────────────────────────────────────────────────────────

class RedisPubSubManager {
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private connected = false;
  private handlers: PubSubHandlers | null = null;
  private metrics = {
    published: 0, received: 0, dropped: 0, reconnects: 0, latencyMs: null as number | null,
  };
  private nodeId = randomUUID().slice(0, 8);
  private nodeRefreshInterval: ReturnType<typeof setInterval> | null = null;
  private obDebounce = new Map<string, ReturnType<typeof setTimeout>>();

  // ── Init ────────────────────────────────────────────────────────────────────

  async initialize(redisUrl: string): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Redis } = require("ioredis") as typeof import("ioredis");

      const baseOpts = {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryStrategy: (times: number) => Math.min(times * 200, 5_000),
        reconnectOnError: () => true,
      };

      this.pubClient = new Redis(redisUrl, baseOpts);
      this.subClient = new Redis(redisUrl, { ...baseOpts, maxRetriesPerRequest: null });

      this.pubClient.on("ready", () => { this.connected = true; });
      this.pubClient.on("close", () => { this.connected = false; this.metrics.reconnects++; });
      this.pubClient.on("error", (e) => logger.warn("[pubsub] pub error", { err: String(e) }));
      this.subClient.on("error", (e) => logger.warn("[pubsub] sub error", { err: String(e) }));
      this.subClient.on("reconnecting", () => { this.metrics.reconnects++; });

      // Subscribe to all event channels
      await this.subClient.subscribe(
        CHANNELS.TRADE, CHANNELS.ORDER, CHANNELS.ORDERBOOK,
        CHANNELS.TICKER, CHANNELS.WALLET,
      );

      this.subClient.on("message", (channel: string, raw: string) => {
        this.handleMessage(channel as ChannelKey, raw);
      });

      // Register node for discovery
      await this.registerNode();
      this.nodeRefreshInterval = setInterval(() => void this.registerNode(), 30_000);

      if (!globalThis.tecpeyRedisClient) {
        globalThis.tecpeyRedisClient = this.pubClient;
      }

      // Latency probe every 60s
      setInterval(() => void this.measureLatency(), 60_000);

      logger.info("[pubsub] initialized", { nodeId: this.nodeId, redisUrl: redisUrl.replace(/:[^@]*@/, ":***@") });
    } catch (err) {
      logger.error("[pubsub] initialization failed", { err });
    }
  }

  // ── Node registry ───────────────────────────────────────────────────────────

  private async registerNode(): Promise<void> {
    if (!this.pubClient) return;
    try {
      await this.pubClient.set(
        `tecpey:node:${this.nodeId}`,
        JSON.stringify({ startedAt: new Date().toISOString(), pid: process.pid }),
        "EX", 60,
      );
    } catch { /* non-critical */ }
  }

  async countNodes(): Promise<number> {
    if (!this.pubClient) return 1;
    try {
      const keys = await this.pubClient.keys("tecpey:node:*");
      return keys.length;
    } catch { return 1; }
  }

  // ── Latency probe ───────────────────────────────────────────────────────────

  private async measureLatency(): Promise<void> {
    if (!this.pubClient) return;
    try {
      const t0 = Date.now();
      await this.pubClient.ping();
      this.metrics.latencyMs = Date.now() - t0;
    } catch { /* ignore */ }
  }

  // ── Publish ─────────────────────────────────────────────────────────────────

  publish<T>(channel: string, payload: T): void {
    if (!this.pubClient || !this.connected) {
      this.metrics.dropped++;
      return;
    }
    const envelope: Envelope<T> = { nodeId: this.nodeId, ts: Date.now(), payload };
    void this.pubClient.publish(channel as ChannelKey, JSON.stringify(envelope)).then(() => {
      this.metrics.published++;
    }).catch(() => {
      this.metrics.dropped++;
    });
  }

  // Debounced orderbook publish — coalesces multiple order-book mutations
  // within a 50ms window into a single Redis PUBLISH per market.
  publishOrderBook(payload: OrderBookChangedPayload): void {
    const market = payload.market;
    const existing = this.obDebounce.get(market);
    if (existing) clearTimeout(existing);
    this.obDebounce.set(market, setTimeout(() => {
      this.obDebounce.delete(market);
      this.publish(CHANNELS.ORDERBOOK, payload);
    }, 50));
  }

  // ── Subscribe / dispatch ────────────────────────────────────────────────────

  setHandlers(handlers: PubSubHandlers): void {
    this.handlers = handlers;
  }

  private handleMessage(channel: ChannelKey, raw: string): void {
    this.metrics.received++;
    if (!this.handlers) return;
    try {
      const envelope = JSON.parse(raw) as Envelope<unknown>;
      const payload = envelope.payload;

      switch (channel) {
        case CHANNELS.TRADE:     this.handlers.onTrade(payload as TradeExecutedPayload); break;
        case CHANNELS.ORDER:     this.handlers.onOrder(payload as OrderUpdatedPayload); break;
        case CHANNELS.ORDERBOOK: this.handlers.onOrderBook(payload as OrderBookChangedPayload); break;
        case CHANNELS.TICKER:    this.handlers.onTicker(payload as TickerUpdatedPayload); break;
        case CHANNELS.WALLET:    this.handlers.onWallet(payload as WalletChangedPayload); break;
      }
    } catch { /* malformed message */ }
  }

  // ── Health ──────────────────────────────────────────────────────────────────

  isConnected(): boolean { return this.connected; }

  async ping(): Promise<boolean> {
    if (!this.pubClient) return false;
    try { await this.pubClient.ping(); return true; }
    catch { return false; }
  }

  // ── Metrics ─────────────────────────────────────────────────────────────────

  getMetrics(): PubSubMetrics {
    return {
      connected: this.connected,
      nodeId: this.nodeId,
      ...this.metrics,
      subscribedChannels: Object.keys(CHANNELS).length,
    };
  }

  // ── Shutdown ────────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    if (this.nodeRefreshInterval) clearInterval(this.nodeRefreshInterval);
    for (const t of this.obDebounce.values()) clearTimeout(t);
    this.obDebounce.clear();
    try { await this.pubClient?.quit(); } catch { /* ignore */ }
    try { await this.subClient?.quit(); } catch { /* ignore */ }
    this.connected = false;
    logger.info("[pubsub] shutdown complete", { nodeId: this.nodeId });
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

declare global {
  var tecpeyPubSub: RedisPubSubManager | undefined;
  var tecpeyRedisClient: Redis | undefined;
}

export function getRedisPubSub(): RedisPubSubManager {
  if (!globalThis.tecpeyPubSub) {
    globalThis.tecpeyPubSub = new RedisPubSubManager();
  }
  return globalThis.tecpeyPubSub;
}
