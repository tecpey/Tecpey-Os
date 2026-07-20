// Redis Pub/Sub manager for cross-instance realtime projection and the
// production single-node matching safety authority.
//
// Durable financial truth remains in PostgreSQL. Redis Pub/Sub is explicitly
// lossy and may only distribute recoverable realtime projections. The web-node
// registry, however, is a required production startup/runtime safety boundary
// while matching locks and the in-memory order book remain process-local.

import { randomUUID } from "crypto";
import { logger } from "@/lib/logger";
import type { Redis, RedisOptions } from "ioredis";
import type {
  TradeExecutedPayload,
  OrderUpdatedPayload,
  OrderBookChangedPayload,
  TickerUpdatedPayload,
  WalletChangedPayload,
} from "@/lib/event-bus";

export const CHANNELS = {
  TRADE: "tecpey:events:trade",
  ORDER: "tecpey:events:order",
  ORDERBOOK: "tecpey:events:orderbook",
  TICKER: "tecpey:events:ticker",
  WALLET: "tecpey:events:wallet",
} as const;

const CHANNEL_VALUES = Object.values(CHANNELS);
const WEB_NODE_REGISTRY_KEY = "tecpey:nodes:web";
const NODE_TTL_MS = 60_000;
const NODE_REFRESH_MS = 20_000;
const LATENCY_PROBE_MS = 60_000;

const DISCOVERY_SCRIPT = `
local now = ARGV[1]
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now)
return redis.call("ZCOUNT", KEYS[1], "(" .. now, "+inf")
`;

type ChannelKey = (typeof CHANNELS)[keyof typeof CHANNELS];

type Envelope<T> = {
  nodeId: string;
  ts: number;
  payload: T;
};

type PubSubHandlers = {
  onTrade: (payload: TradeExecutedPayload) => void;
  onOrder: (payload: OrderUpdatedPayload) => void;
  onOrderBook: (payload: OrderBookChangedPayload) => void;
  onTicker: (payload: TickerUpdatedPayload) => void;
  onWallet: (payload: WalletChangedPayload) => void;
};

export type PubSubHealthState =
  | "idle"
  | "connecting"
  | "ready"
  | "degraded"
  | "failed"
  | "stopping"
  | "stopped";

export type NodeDiscoveryResult =
  | { ok: true; count: number }
  | { ok: false; reason: string };

export type PubSubInitializationResult = {
  ok: true;
  nodeId: string;
  activeWebNodes: number;
  subscribedChannels: number;
};

export type PubSubHealth = {
  state: PubSubHealthState;
  ready: boolean;
  nodeId: string;
  failureReason: string | null;
  activeWebNodes: number | null;
};

export type PubSubMetrics = {
  connected: boolean;
  nodeId: string;
  published: number;
  received: number;
  dropped: number;
  reconnects: number;
  latencyMs: number | null;
  subscribedChannels: number;
  healthState: PubSubHealthState;
};

export type RedisClientFactory = (redisUrl: string, options: RedisOptions) => Redis;

const createRedisClient: RedisClientFactory = (redisUrl, options) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Redis } = require("ioredis") as typeof import("ioredis");
  return new Redis(redisUrl, options);
};

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class RedisPubSubManager {
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private handlers: PubSubHandlers | null = null;
  private state: PubSubHealthState = "idle";
  private failureReason: string | null = null;
  private activeWebNodes: number | null = null;
  private initializationPromise: Promise<PubSubInitializationResult> | null = null;
  private fatalHandler: ((reason: string) => void) | null = null;
  private fatalRaised = false;
  private nodeRefreshInterval: ReturnType<typeof setInterval> | null = null;
  private latencyInterval: ReturnType<typeof setInterval> | null = null;
  private obDebounce = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly nodeId = randomUUID();
  private metrics = {
    published: 0,
    received: 0,
    dropped: 0,
    reconnects: 0,
    latencyMs: null as number | null,
  };

  constructor(private readonly clientFactory: RedisClientFactory = createRedisClient) {}

  setFatalHandler(handler: ((reason: string) => void) | null): void {
    this.fatalHandler = handler;
  }

  async initialize(redisUrl: string): Promise<PubSubInitializationResult> {
    if (this.state === "ready" && this.activeWebNodes !== null) {
      return {
        ok: true,
        nodeId: this.nodeId,
        activeWebNodes: this.activeWebNodes,
        subscribedChannels: CHANNEL_VALUES.length,
      };
    }

    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = this.initializeOnce(redisUrl).finally(() => {
      this.initializationPromise = null;
    });
    return this.initializationPromise;
  }

  private async initializeOnce(redisUrl: string): Promise<PubSubInitializationResult> {
    this.state = "connecting";
    this.failureReason = null;
    this.activeWebNodes = null;
    this.fatalRaised = false;

    try {
      await this.closeClients({ deregister: true, logFailures: false });

      const baseOpts: RedisOptions = {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        connectTimeout: 10_000,
        commandTimeout: 10_000,
        retryStrategy: (times: number) => Math.min(times * 200, 5_000),
        reconnectOnError: () => true,
      };

      this.pubClient = this.clientFactory(redisUrl, baseOpts);
      this.subClient = this.clientFactory(redisUrl, {
        ...baseOpts,
        maxRetriesPerRequest: null,
      });
      this.attachClientListeners();

      await Promise.all([this.pubClient.ping(), this.subClient.ping()]);

      this.subClient.on("message", (channel: string, raw: string) => {
        this.handleMessage(channel as ChannelKey, raw);
      });

      const subscribedRaw = await this.subClient.subscribe(...CHANNEL_VALUES);
      const subscribedChannels = Number(subscribedRaw);
      if (
        !Number.isSafeInteger(subscribedChannels) ||
        subscribedChannels < CHANNEL_VALUES.length
      ) {
        throw new Error(
          `redis_subscription_incomplete:${subscribedChannels}/${CHANNEL_VALUES.length}`,
        );
      }

      await this.registerNodeStrict();
      const discovery = await this.countActiveWebNodes();
      if (!discovery.ok) throw new Error(discovery.reason);

      this.activeWebNodes = discovery.count;
      this.state = "ready";
      this.startTimers();
      globalThis.tecpeyRedisClient = this.pubClient;

      logger.info("[pubsub] initialized", {
        nodeId: this.nodeId,
        activeWebNodes: discovery.count,
        subscribedChannels,
        redisUrl: redisUrl.replace(/:[^@]*@/, ":***@"),
      });

      return {
        ok: true,
        nodeId: this.nodeId,
        activeWebNodes: discovery.count,
        subscribedChannels,
      };
    } catch (error) {
      const reason = `redis_initialization_failed:${safeError(error)}`;
      this.state = "failed";
      this.failureReason = reason;
      await this.closeClients({ deregister: true, logFailures: false });
      logger.error("[pubsub] initialization failed", { reason });
      throw new Error(reason, { cause: error });
    }
  }

  private attachClientListeners(): void {
    if (!this.pubClient || !this.subClient) {
      throw new Error("redis_clients_missing");
    }

    this.pubClient.on("ready", () => {
      if (this.state === "ready") this.failureReason = null;
    });
    this.pubClient.on("close", () => {
      this.metrics.reconnects++;
      this.handleRuntimeFailure("redis_publisher_closed");
    });
    this.pubClient.on("error", (error: Error) => {
      logger.warn("[pubsub] publisher error", { err: safeError(error) });
      this.handleRuntimeFailure("redis_publisher_error");
    });

    this.subClient.on("close", () => {
      this.metrics.reconnects++;
      this.handleRuntimeFailure("redis_subscriber_closed");
    });
    this.subClient.on("error", (error: Error) => {
      logger.warn("[pubsub] subscriber error", { err: safeError(error) });
      this.handleRuntimeFailure("redis_subscriber_error");
    });
    this.subClient.on("reconnecting", () => {
      this.metrics.reconnects++;
    });
  }

  private handleRuntimeFailure(reason: string): void {
    if (this.state !== "ready" && this.state !== "degraded") return;

    this.state = "degraded";
    this.failureReason = reason;
    logger.error("[pubsub] runtime safety authority degraded", {
      nodeId: this.nodeId,
      reason,
    });

    if (!this.fatalRaised && this.fatalHandler) {
      this.fatalRaised = true;
      this.fatalHandler(reason);
    }
  }

  private async registerNodeStrict(): Promise<void> {
    if (!this.pubClient) throw new Error("redis_publisher_unavailable");
    await this.pubClient.zadd(
      WEB_NODE_REGISTRY_KEY,
      Date.now() + NODE_TTL_MS,
      this.nodeId,
    );
  }

  private startTimers(): void {
    this.clearTimers();

    this.nodeRefreshInterval = setInterval(() => {
      void this.registerNodeStrict().catch((error) => {
        logger.error("[pubsub] node heartbeat failed", {
          nodeId: this.nodeId,
          err: safeError(error),
        });
        this.handleRuntimeFailure("redis_node_heartbeat_failed");
      });
    }, NODE_REFRESH_MS);
    this.nodeRefreshInterval.unref?.();

    this.latencyInterval = setInterval(() => {
      void this.measureLatency().catch((error) => {
        logger.error("[pubsub] latency probe failed", {
          nodeId: this.nodeId,
          err: safeError(error),
        });
        this.handleRuntimeFailure("redis_latency_probe_failed");
      });
    }, LATENCY_PROBE_MS);
    this.latencyInterval.unref?.();
  }

  private clearTimers(): void {
    if (this.nodeRefreshInterval) clearInterval(this.nodeRefreshInterval);
    if (this.latencyInterval) clearInterval(this.latencyInterval);
    this.nodeRefreshInterval = null;
    this.latencyInterval = null;
  }

  async countActiveWebNodes(): Promise<NodeDiscoveryResult> {
    if (!this.pubClient) {
      return { ok: false, reason: "redis_node_discovery_unavailable" };
    }

    try {
      const now = Date.now();
      const raw = await this.pubClient.eval(
        DISCOVERY_SCRIPT,
        1,
        WEB_NODE_REGISTRY_KEY,
        String(now),
      );
      const count = Number(raw);
      if (!Number.isSafeInteger(count) || count < 0) {
        return { ok: false, reason: "redis_node_discovery_invalid_result" };
      }
      return { ok: true, count };
    } catch (error) {
      logger.error("[pubsub] node discovery failed", { err: safeError(error) });
      return { ok: false, reason: "redis_node_discovery_failed" };
    }
  }

  private async measureLatency(): Promise<void> {
    if (!this.pubClient) throw new Error("redis_publisher_unavailable");
    const startedAt = Date.now();
    await this.pubClient.ping();
    this.metrics.latencyMs = Date.now() - startedAt;
  }

  // Realtime projection only. Callers must persist durable domain state before
  // publishing and clients must recover through authoritative API reads.
  publish<T>(channel: string, payload: T): void {
    if (!this.pubClient || this.state !== "ready") {
      this.metrics.dropped++;
      return;
    }

    const envelope: Envelope<T> = { nodeId: this.nodeId, ts: Date.now(), payload };
    void this.pubClient
      .publish(channel as ChannelKey, JSON.stringify(envelope))
      .then(() => {
        this.metrics.published++;
      })
      .catch((error) => {
        this.metrics.dropped++;
        logger.error("[pubsub] projection publish failed", { err: safeError(error) });
        this.handleRuntimeFailure("redis_projection_publish_failed");
      });
  }

  publishOrderBook(payload: OrderBookChangedPayload): void {
    const existing = this.obDebounce.get(payload.market);
    if (existing) clearTimeout(existing);

    const timeout = setTimeout(() => {
      this.obDebounce.delete(payload.market);
      this.publish(CHANNELS.ORDERBOOK, payload);
    }, 50);
    timeout.unref?.();
    this.obDebounce.set(payload.market, timeout);
  }

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
        case CHANNELS.TRADE:
          this.handlers.onTrade(payload as TradeExecutedPayload);
          break;
        case CHANNELS.ORDER:
          this.handlers.onOrder(payload as OrderUpdatedPayload);
          break;
        case CHANNELS.ORDERBOOK:
          this.handlers.onOrderBook(payload as OrderBookChangedPayload);
          break;
        case CHANNELS.TICKER:
          this.handlers.onTicker(payload as TickerUpdatedPayload);
          break;
        case CHANNELS.WALLET:
          this.handlers.onWallet(payload as WalletChangedPayload);
          break;
      }
    } catch (error) {
      this.metrics.dropped++;
      logger.warn("[pubsub] malformed projection ignored", { err: safeError(error) });
    }
  }

  isConnected(): boolean {
    return this.state === "ready";
  }

  isReady(): boolean {
    return this.state === "ready";
  }

  async ping(): Promise<boolean> {
    if (!this.pubClient || this.state !== "ready") return false;
    try {
      await this.pubClient.ping();
      return true;
    } catch {
      return false;
    }
  }

  getHealth(): PubSubHealth {
    return {
      state: this.state,
      ready: this.state === "ready",
      nodeId: this.nodeId,
      failureReason: this.failureReason,
      activeWebNodes: this.activeWebNodes,
    };
  }

  getMetrics(): PubSubMetrics {
    return {
      connected: this.state === "ready",
      nodeId: this.nodeId,
      ...this.metrics,
      subscribedChannels: CHANNEL_VALUES.length,
      healthState: this.state,
    };
  }

  async shutdown(): Promise<void> {
    if (this.state === "stopping" || this.state === "stopped") return;

    this.state = "stopping";
    this.clearTimers();
    for (const timeout of this.obDebounce.values()) clearTimeout(timeout);
    this.obDebounce.clear();

    await this.closeClients({ deregister: true, logFailures: true });
    this.activeWebNodes = null;
    this.state = "stopped";
    this.failureReason = null;
    this.fatalRaised = false;

    logger.info("[pubsub] shutdown complete", { nodeId: this.nodeId });
  }

  private async closeClients(options: {
    deregister: boolean;
    logFailures: boolean;
  }): Promise<void> {
    const pubClient = this.pubClient;
    const subClient = this.subClient;
    this.pubClient = null;
    this.subClient = null;

    if (options.deregister && pubClient) {
      try {
        await pubClient.zrem(WEB_NODE_REGISTRY_KEY, this.nodeId);
      } catch (error) {
        if (options.logFailures) {
          logger.warn("[pubsub] node deregistration failed", { err: safeError(error) });
        }
      }
    }

    try {
      await subClient?.quit();
    } catch (error) {
      if (options.logFailures) {
        logger.warn("[pubsub] subscriber shutdown failed", { err: safeError(error) });
      }
      subClient?.disconnect(false);
    }

    try {
      await pubClient?.quit();
    } catch (error) {
      if (options.logFailures) {
        logger.warn("[pubsub] publisher shutdown failed", { err: safeError(error) });
      }
      pubClient?.disconnect(false);
    }

    if (globalThis.tecpeyRedisClient === pubClient) {
      globalThis.tecpeyRedisClient = undefined;
    }
  }
}

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
