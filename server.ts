// Custom Next.js server with WebSocket support and Redis pub/sub.
// See docs/WEBSOCKET.md and docs/SCALING.md for architecture.

import { loadEnvConfig } from "@next/env";

// Load .env.local and .env before anything else.
loadEnvConfig(process.cwd());

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import next from "next";
import { WebSocketServer } from "ws";
import type WebSocket from "ws";
import { getWsManager } from "./src/lib/ws/ws-manager";
import { getRedisPubSub } from "./src/lib/redis-pubsub";
import { wireRedisPublisher } from "./src/lib/event-bus";
import { bootstrapComplianceProviders } from "./src/lib/compliance/index";
import { startWithdrawalWorkers, stopWithdrawalWorkers } from "./src/workers/withdrawal-worker";

const port = parseInt(process.env.PORT ?? "3000", 10);
const dev  = process.env.NODE_ENV !== "production";

const httpServer = createServer();
const app = next({ dev, httpServer });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // ── Compliance providers (Phase 36) ──────────────────────────────────────
  bootstrapComplianceProviders();

  // ── Withdrawal pipeline workers (Phase 38) ────────────────────────────────
  if (process.env.REDIS_URL) {
    startWithdrawalWorkers();
  }

  // ── Redis pub/sub (Phase 33) ───────────────────────────────────────────────
  // When REDIS_URL is set, wire up cross-instance event distribution.
  // Each instance publishes via EventBus → Redis and subscribes to receive
  // events from all instances (including itself) → WsManager broadcast.
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const pubsub = getRedisPubSub();
    await pubsub.initialize(redisUrl);

    // Route local EventBus events → Redis pub channels.
    wireRedisPublisher(pubsub);

    // Route Redis sub events → WsManager broadcast (replaces local EventBus path).
    getWsManager().setupRedisSubscriptions(pubsub);

    console.log("> Redis pub/sub active — multi-instance mode enabled");
  } else {
    console.log("> No REDIS_URL — single-instance mode (local EventBus)");
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
    await stopWithdrawalWorkers();
    if (redisUrl) await getRedisPubSub().shutdown();
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT",  () => void shutdown());

  httpServer.listen(port, () => {
    console.log(
      `> TecPey server ready on http://localhost:${port} ` +
      `(${dev ? "development" : "production"}) — WS at ws://localhost:${port}/ws`,
    );
  });
});
