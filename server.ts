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
const dev = process.env.NODE_ENV !== "production";

const httpServer = createServer();
const app = next({ dev, httpServer });
const handle = app.getRequestHandler();

type WithdrawalWorkerModule = typeof import("./src/workers/withdrawal-worker");
let withdrawalWorkers: WithdrawalWorkerModule | null = null;

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

app.prepare().then(async () => {
  // ── Compliance providers (Phase 36) ──────────────────────────────────────
  bootstrapComplianceProviders();
  assertProductionCustodyConfiguration();
  const custodyStatus = getCustodyLaunchStatus();

  const redisUrl = configuredRedisUrl();

  // ── Withdrawal pipeline workers (Phase 38) ────────────────────────────────
  // Worker modules instantiate BullMQ queues at import time. Import them only
  // after a non-empty Redis URL has been validated so local UI development does
  // not crash merely because Redis is intentionally absent.
  if (redisUrl && custodyStatus.workerEnabled) {
    withdrawalWorkers = await import("./src/workers/withdrawal-worker");
    withdrawalWorkers.startWithdrawalWorkers();
  } else if (redisUrl) {
    console.warn(
      "> Custody disabled — withdrawal execution, signing and broadcast workers were not started",
    );
  }

  // ── Redis pub/sub (Phase 33) ───────────────────────────────────────────────
  // When REDIS_URL is set, wire up cross-instance event distribution.
  // Each instance publishes via EventBus → Redis and subscribes to receive
  // events from all instances (including itself) → WsManager broadcast.
  if (redisUrl) {
    const pubsub = getRedisPubSub();
    await pubsub.initialize(redisUrl);

    // ── Single-instance matching guardrail (production only) ────────────────
    // The per-market matching mutex and in-memory order book are process-local.
    // Distributed matching (advisory/distributed locks) is NOT yet implemented,
    // so running more than one web/matching application node causes stale order
    // books, spurious matching failures, and inconsistent realtime snapshots.
    // Fail closed rather than start silently in an unsafe mode.
    if (!dev) {
      const webNodes = await pubsub.countActiveWebNodes();
      if (webNodes < 0) {
        console.error(
          "\nFATAL: active web-node count could not be verified.\n" +
          "Single-instance matching safety cannot be guaranteed.\n",
        );
        await pubsub.shutdown();
        process.exit(1);
      }
      if (webNodes > 1) {
        console.error(
          `\nFATAL: ${webNodes} active TecPey web/matching nodes detected.\n` +
          "Distributed matching is NOT enabled. Production is currently restricted " +
          "to a SINGLE web/matching application instance.\n" +
          "Scaling BullMQ workers is allowed; scaling the web/matching application is not.\n" +
          "Shut down the extra instance(s) before starting, or implement distributed " +
          "matching locks first.\n",
        );
        await pubsub.shutdown();
        process.exit(1);
      }
    }

    // Route local EventBus events → Redis pub channels.
    wireRedisPublisher(pubsub);

    // Route Redis sub events → WsManager broadcast (replaces local EventBus path).
    getWsManager().setupRedisSubscriptions(pubsub);

    console.log("> Redis pub/sub active — multi-instance mode enabled");
  } else {
    console.log("> No REDIS_URL — development UI mode (local EventBus, wallet workers disabled)");
  }

  // ── HTTP: delegate to Next.js ─────────────────────────────────────────────
  httpServer.on("request", (req: IncomingMessage, res: ServerResponse) => {
    handle(req, res);
  });

  // ── WebSocket: attach on /ws path ─────────────────────────────────────────
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = req.url ?? "";
    if (url === "/ws" || url.startsWith("/ws?")) {
      wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
        getWsManager().handleConnection(ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async () => {
    await withdrawalWorkers?.stopWithdrawalWorkers();
    if (redisUrl) await getRedisPubSub().shutdown();
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());

  httpServer.listen(port, () => {
    console.log(
      `> TecPey server ready on http://localhost:${port} ` +
      `(${dev ? "development" : "production"}) — WS at ws://localhost:${port}/ws`,
    );
  });
}).catch((error) => {
  const message = error instanceof Error ? error.message : "server_bootstrap_failed";
  console.error(`FATAL: TecPey server bootstrap failed: ${message}`);
  process.exit(1);
});
