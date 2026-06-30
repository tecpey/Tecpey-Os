// Custom Next.js server with WebSocket support.
// See docs/WEBSOCKET.md for architecture and usage.

import { loadEnvConfig } from "@next/env";

// Load .env.local and .env before anything else.
loadEnvConfig(process.cwd());

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import next from "next";
import { WebSocketServer } from "ws";
import type WebSocket from "ws";
import { getWsManager } from "./src/lib/ws/ws-manager";

const port = parseInt(process.env.PORT ?? "3000", 10);
const dev  = process.env.NODE_ENV !== "production";

const httpServer = createServer();
const app = next({ dev, httpServer });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  // HTTP: delegate all non-upgrade requests to Next.js.
  httpServer.on("request", (req: IncomingMessage, res: ServerResponse) => {
    handle(req, res);
  });

  // WebSocket: attach on /ws path.
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

  httpServer.listen(port, () => {
    console.log(
      `> TecPey server ready on http://localhost:${port} ` +
      `(${dev ? "development" : "production"}) — WS at ws://localhost:${port}/ws`,
    );
  });
});
