// Custom Next.js server with WebSocket support and Redis pub/sub.
// See docs/WEBSOCKET.md and docs/SCALING.md for architecture.

import { loadEnvConfig } from "@next/env";

// Load .env.local and .env before environment-sensitive runtime modules.
loadEnvConfig(process.cwd());

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import next from "next";
import { WebSocketServer } from "ws";
import type WebSocket from "ws";
import { getWsManager } from "./src/lib/ws/ws-manager";
import { getRedisPubSub } from "./src/lib/redis-pubsub";
import { wireRedisPublisher } from "./src/lib/event-bus";
import { bootstrapComplianceProviders } from "./src/lib/compliance/index";
import {
  assertProductionCustodyConfiguration,
  getCustodyLaunchStatus,
} from "./src/lib/wallet/custody-launch-policy";

const port = parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.TECPEY_BIND_HOST?.trim() || "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";

const httpServer = createServer();
// Next.js 16 custom-server/proxy bootstrap needs the same explicit network
// identity that the real HTTP server will bind. Keeping hostname, port and
// httpServer aligned prevents development internals from resolving a different
// dist/runtime context than the server that ultimately handles the request.
const app = next({ dev, hostname, port, httpServer });
const handle = app.getRequestHandler();
const pubsub = getRedisPubSub();

type WithdrawalWorkerModule = typeof import("./src/workers/withdrawal-worker");
let withdrawalWorkers: WithdrawalWorkerModule | null = null;
let webSocketServer: WebSocketServer | null = null;
let redisConfigured = false;
let shutdownPromise: Promise<void> | null = null;

function configuredRedisUrl(): string | null {
  const raw = process.env.REDIS_URL?.trim();
  if (!raw) {
    if (!dev) throw new Error("redis_url_required_in_production");
    return null;
  }

  try {
    const parsed = new URL(raw);
    if ((parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") || !parsed.hostname) {
      throw new Error("unsupported");
    }
  } catch {
    throw new Error("redis_url_invalid");
  }

  return raw;
}

async function closeWebSocketServer(): Promise<void> {
  const current = webSocketServer;
  webSocketServer = null;
  if (!current) return;

  for (const client of current.clients) client.terminate();
  await new Promise<void>((resolve) => {
    current.close(() => resolve());
  });
}

async function closeHttpServer(): Promise<void> {
  if (!httpServer.listening) return;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      httpServer.closeAllConnections();
      resolve();
    }, 10_000);
    timeout.unref?.();

    httpServer.close((error) => {
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    });
  });
}

async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    console.error(`> TecPey controlled shutdown: ${reason}`);

    const failures: string[] = [];
    try {
      await closeWebSocketServer();
    } catch (error) {
      failures.push(`websocket:${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      await closeHttpServer();
    } catch (error) {
      failures.push(`http:${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      await withdrawalWorkers?.stopWithdrawalWorkers();
    } catch (error) {
      failures.push(`workers:${error instanceof Error ? error.message : String(error)}`);
    }

    if (redisConfigured) {
      try {
        await pubsub.shutdown();
      } catch (error) {
        failures.push(`redis:${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (failures.length > 0) {
      console.error(`> Shutdown completed with errors: ${failures.join(", ")}`);
    }

    process.exit(exitCode);
  })();

  return shutdownPromise;
}

function assertBootstrapActive(): void {
  if (shutdownPromise) throw new Error("bootstrap_aborted_by_controlled_shutdown");
}

async function listen(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      httpServer.off("error", onError);
      reject(error);
    };

    httpServer.once("error", onError);
    httpServer.listen(port, hostname, () => {
      httpServer.off("error", onError);
      resolve();
    });
  });
}

async function main(): Promise<void> {
  await app.prepare();

  // ── Compliance and custody launch policy ─────────────────────────────────
  bootstrapComplianceProviders();
  assertProductionCustodyConfiguration();
  const custodyStatus = getCustodyLaunchStatus();
  const redisUrl = configuredRedisUrl();

  // ── Redis safety authority ────────────────────────────────────────────────
  // Production HTTP, WebSocket, matching and background workers must share one
  // verified bootstrap decision. Redis connection, PING, subscription, node
  // registration and role-scoped discovery all complete before anything listens.
  if (redisUrl) {
    redisConfigured = true;
    pubsub.setFatalHandler((reason) => {
      void shutdown(`redis_safety_authority_lost:${reason}`, 1);
    });

    const readiness = await pubsub.initialize(redisUrl);
    assertBootstrapActive();

    if (readiness.activeWebNodes > 1) {
      throw new Error(
        `multiple_web_matching_nodes_detected:${readiness.activeWebNodes}`,
      );
    }

    // Realtime Redis messages are recoverable projections only. PostgreSQL/API
    // reads remain authoritative for financial and account state.
    wireRedisPublisher(pubsub);
    getWsManager().setupRedisSubscriptions(pubsub);

    console.log(
      `> Redis safety authority ready — node ${readiness.nodeId}, ` +
      `${readiness.subscribedChannels} channels, ${readiness.activeWebNodes} active web node`,
    );
  } else {
    console.log(
      "> No REDIS_URL — development UI mode (local EventBus, wallet workers disabled)",
    );
  }

  assertBootstrapActive();

  // ── Withdrawal pipeline workers ──────────────────────────────────────────
  // Worker modules instantiate BullMQ queues at import time. They may start only
  // after the complete Redis production readiness decision has passed.
  if (redisUrl && custodyStatus.workerEnabled) {
    withdrawalWorkers = await import("./src/workers/withdrawal-worker");
    withdrawalWorkers.startWithdrawalWorkers();
  } else if (redisUrl) {
    console.warn(
      "> Custody disabled — withdrawal execution, signing and broadcast workers were not started",
    );
  }

  assertBootstrapActive();

  // ── HTTP and WebSocket traffic ────────────────────────────────────────────
  httpServer.on("request", (req: IncomingMessage, res: ServerResponse) => {
    handle(req, res);
  });

  webSocketServer = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = req.url ?? "";
    if (url === "/ws" || url.startsWith("/ws?")) {
      webSocketServer?.handleUpgrade(req, socket, head, (ws: WebSocket) => {
        getWsManager().handleConnection(ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  await listen();
  const displayHost = hostname === "0.0.0.0" ? "localhost" : hostname;
  console.log(
    `> TecPey server ready on http://${displayHost}:${port} ` +
    `(${dev ? "development" : "production"}) — WS at ws://${displayHost}:${port}/ws`,
  );
}

process.once("SIGTERM", () => void shutdown("sigterm", 0));
process.once("SIGINT", () => void shutdown("sigint", 0));

void main().catch((error) => {
  const message = error instanceof Error ? error.message : "server_bootstrap_failed";
  console.error(`FATAL: TecPey server bootstrap failed: ${message}`);
  void shutdown(`bootstrap_failed:${message}`, 1);
});
