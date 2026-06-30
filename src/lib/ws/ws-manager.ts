import { EventEmitter } from "events";
import type { IncomingMessage } from "http";
import type WebSocket from "ws";
import { getEventBus } from "@/lib/event-bus";
import type {
  TradeExecutedPayload,
  OrderUpdatedPayload,
  OrderBookChangedPayload,
  TickerUpdatedPayload,
  WalletChangedPayload,
} from "@/lib/event-bus";
import { buildTickerPayload, getCachedMarketStats } from "@/lib/trading/market-stats-cache";
import { getOrderBook } from "@/lib/trading/order-book";
import { nextSeq } from "@/lib/event-bus";

// ── Types ─────────────────────────────────────────────────────────────────────

type ConnId = string;

type Conn = {
  id: ConnId;
  ws: WebSocket;
  userId: string | null;
  subs: Set<string>;         // channel keys, e.g. "ticker:BTCUSDT"
  lastPong: number;
  msgsSent: number;
  connectedAt: number;
  remoteIp: string;
};

// ── Outbound message helpers ──────────────────────────────────────────────────

function send(ws: WebSocket, msg: Record<string, unknown>): void {
  if (ws.readyState !== 1 /* OPEN */) return;
  // Basic backpressure: drop if buffer exceeds 1 MB.
  if ((ws as unknown as { bufferedAmount?: number }).bufferedAmount ?? 0 > 1_048_576) return;
  try { ws.send(JSON.stringify(msg)); } catch { /* connection may be closing */ }
}

function sendError(ws: WebSocket, code: string, message: string): void {
  send(ws, { type: "error", code, message });
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export type WsMetrics = {
  connectedClients: number;
  authenticatedClients: number;
  totalSubscriptions: number;
  subscriptionsByChannel: Record<string, number>;
  totalMsgsSent: number;
  uptimeMs: number;
};

// ── Manager ───────────────────────────────────────────────────────────────────

declare global {
  var tecpeyWsManager: WsManager | undefined;
}

export class WsManager extends EventEmitter {
  private conns = new Map<ConnId, Conn>();
  private channels = new Map<string, Set<ConnId>>();
  private msgsSentTotal = 0;
  private startedAt = Date.now();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.setupEventBusListeners();
    this.startHeartbeat();
  }

  // ── Connection lifecycle ────────────────────────────────────────────────────

  handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const id = Math.random().toString(36).slice(2);
    const remoteIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      "unknown";

    const conn: Conn = {
      id, ws, userId: null, subs: new Set(),
      lastPong: Date.now(), msgsSent: 0,
      connectedAt: Date.now(), remoteIp,
    };
    this.conns.set(id, conn);

    // Immediately parse session cookie for auth.
    void this.tryAuthFromRequest(conn, req);

    ws.on("message", (raw) => this.handleMessage(conn, raw.toString()));
    ws.on("pong", () => { conn.lastPong = Date.now(); });
    ws.on("close", () => this.handleDisconnect(id));
    ws.on("error", () => this.handleDisconnect(id));

    send(ws, { type: "connected", connId: id, serverTime: new Date().toISOString() });
  }

  private handleDisconnect(id: ConnId): void {
    const conn = this.conns.get(id);
    if (!conn) return;
    for (const ch of conn.subs) {
      this.channels.get(ch)?.delete(id);
      if (this.channels.get(ch)?.size === 0) this.channels.delete(ch);
    }
    this.conns.delete(id);
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  private async tryAuthFromRequest(conn: Conn, req: IncomingMessage): Promise<void> {
    const cookie = req.headers.cookie ?? "";
    const userId = await resolveUserIdFromCookie(cookie);
    if (userId) {
      conn.userId = userId;
      send(conn.ws, { type: "authenticated", userId });
    }
  }

  // ── Message handling ────────────────────────────────────────────────────────

  private async handleMessage(conn: Conn, raw: string): Promise<void> {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw) as Record<string, unknown>; }
    catch { sendError(conn.ws, "invalid_json", "Message must be valid JSON"); return; }

    const type = msg.type as string;

    if (type === "ping") {
      send(conn.ws, { type: "pong" });
      return;
    }

    if (type === "pong") {
      conn.lastPong = Date.now();
      return;
    }

    if (type === "auth") {
      const token = msg.token as string | undefined;
      if (!token) { sendError(conn.ws, "missing_token", "Provide token field"); return; }
      const userId = await resolveUserIdFromToken(token);
      if (!userId) { sendError(conn.ws, "auth_failed", "Invalid or expired token"); return; }
      conn.userId = userId;
      send(conn.ws, { type: "authenticated", userId });
      return;
    }

    if (type === "subscribe") {
      await this.handleSubscribe(conn, msg);
      return;
    }

    if (type === "unsubscribe") {
      this.handleUnsubscribe(conn, msg);
      return;
    }

    if (type === "get_snapshot") {
      await this.handleGetSnapshot(conn, msg);
      return;
    }

    sendError(conn.ws, "unknown_type", `Unknown message type: ${type}`);
  }

  // ── Subscribe ───────────────────────────────────────────────────────────────

  private async handleSubscribe(conn: Conn, msg: Record<string, unknown>): Promise<void> {
    const channel = msg.channel as string;
    const market = (msg.market as string | undefined)?.toUpperCase();

    if (conn.subs.size >= 100) {
      sendError(conn.ws, "sub_limit", "Maximum 100 subscriptions per connection"); return;
    }

    const USER_CHANNELS = ["user-orders", "user-trades", "wallet", "notifications"];
    if (USER_CHANNELS.includes(channel) && !conn.userId) {
      sendError(conn.ws, "auth_required", "Authentication required for this channel"); return;
    }

    const chKey = market ? `${channel}:${market}` : `${channel}:${conn.userId ?? ""}`;

    if (!this.channels.has(chKey)) this.channels.set(chKey, new Set());
    this.channels.get(chKey)!.add(conn.id);
    conn.subs.add(chKey);

    send(conn.ws, { type: "subscribed", channel, market: market ?? null });

    // Send snapshot on subscribe
    await this.sendSnapshot(conn, channel, market);
  }

  private handleUnsubscribe(conn: Conn, msg: Record<string, unknown>): void {
    const channel = msg.channel as string;
    const market = (msg.market as string | undefined)?.toUpperCase();
    const chKey = market ? `${channel}:${market}` : `${channel}:${conn.userId ?? ""}`;

    conn.subs.delete(chKey);
    this.channels.get(chKey)?.delete(conn.id);
    if (this.channels.get(chKey)?.size === 0) this.channels.delete(chKey);

    send(conn.ws, { type: "unsubscribed", channel, market: market ?? null });
  }

  // ── Snapshot on subscribe ───────────────────────────────────────────────────

  private async sendSnapshot(conn: Conn, channel: string, market?: string): Promise<void> {
    try {
      if (channel === "orderbook" && market) {
        const snap = getOrderBook(market).snapshot(50);
        send(conn.ws, {
          type: "snapshot", channel: "orderbook", market,
          seq: nextSeq(market), data: snap,
        });
      } else if (channel === "ticker" && market) {
        const ticker = await buildTickerPayload(market);
        send(conn.ws, { type: "snapshot", channel: "ticker", market, data: ticker });
      } else if (channel === "market-summary" && market) {
        const stats = await getCachedMarketStats(market);
        send(conn.ws, { type: "snapshot", channel: "market-summary", market, data: stats });
      }
    } catch { /* snapshot is best-effort */ }
  }

  private async handleGetSnapshot(conn: Conn, msg: Record<string, unknown>): Promise<void> {
    const channel = msg.channel as string;
    const market = (msg.market as string | undefined)?.toUpperCase();
    await this.sendSnapshot(conn, channel, market);
  }

  // ── Broadcast helpers ───────────────────────────────────────────────────────

  private broadcast(chKey: string, msg: Record<string, unknown>): void {
    const ids = this.channels.get(chKey);
    if (!ids?.size) return;
    const payload = JSON.stringify(msg);
    for (const id of ids) {
      const conn = this.conns.get(id);
      if (!conn || conn.ws.readyState !== 1) continue;
      if ((conn.ws as unknown as { bufferedAmount?: number }).bufferedAmount ?? 0 > 1_048_576) continue;
      try {
        conn.ws.send(payload);
        conn.msgsSent++;
        this.msgsSentTotal++;
      } catch { /* ignore */ }
    }
  }

  private broadcastToUser(userId: string, channel: string, msg: Record<string, unknown>): void {
    this.broadcast(`${channel}:${userId}`, msg);
  }

  // ── Event bus listeners ─────────────────────────────────────────────────────

  private setupEventBusListeners(): void {
    const bus = getEventBus();

    const onTrade = (payload: TradeExecutedPayload) => {
      const msg = { type: "update", channel: "trades", market: payload.market, data: payload };
      this.broadcast(`trades:${payload.market}`, msg);

      // User trade streams
      const buyerOrder = payload.makerSide === "sell" ? payload.buyerOrderId : payload.sellerOrderId;
      const sellerOrder = payload.makerSide === "sell" ? payload.sellerOrderId : payload.buyerOrderId;
      void buyerOrder; void sellerOrder; // referenced by userId on order streams
      this.broadcastToUser(payload.buyerUserId, "user-trades", { type: "update", channel: "user-trades", data: payload });
      this.broadcastToUser(payload.sellerUserId, "user-trades", { type: "update", channel: "user-trades", data: payload });

      // Refresh ticker
      void buildTickerPayload(payload.market).then((ticker) => {
        this.broadcast(`ticker:${payload.market}`, { type: "update", channel: "ticker", market: payload.market, data: ticker });
        this.broadcast(`market-summary:${payload.market}`, { type: "update", channel: "market-summary", market: payload.market, data: ticker });
      });
    };

    const onOrderUpdated = (payload: OrderUpdatedPayload) => {
      this.broadcastToUser(payload.userId, "user-orders", { type: "update", channel: "user-orders", data: payload });
    };

    const onOrderBookChanged = (payload: OrderBookChangedPayload) => {
      this.broadcast(`orderbook:${payload.market}`, {
        type: "update", channel: "orderbook", market: payload.market,
        seq: payload.seqNum, data: payload.snapshot,
      });
    };

    const onTickerUpdated = (payload: TickerUpdatedPayload) => {
      this.broadcast(`ticker:${payload.market}`, { type: "update", channel: "ticker", market: payload.market, data: payload });
    };

    const onWalletChanged = (payload: WalletChangedPayload) => {
      this.broadcastToUser(payload.userId, "wallet", { type: "update", channel: "wallet", data: payload });
    };

    // Remove old listeners (safe for HMR), then add fresh ones.
    bus.off("trade:executed", onTrade as Parameters<typeof bus.off>[1]);
    bus.off("order:updated", onOrderUpdated as Parameters<typeof bus.off>[1]);
    bus.off("orderbook:changed", onOrderBookChanged as Parameters<typeof bus.off>[1]);
    bus.off("ticker:updated", onTickerUpdated as Parameters<typeof bus.off>[1]);
    bus.off("wallet:changed", onWalletChanged as Parameters<typeof bus.off>[1]);

    bus.on("trade:executed", onTrade);
    bus.on("order:updated", onOrderUpdated);
    bus.on("orderbook:changed", onOrderBookChanged);
    bus.on("ticker:updated", onTickerUpdated);
    bus.on("wallet:changed", onWalletChanged);
  }

  // ── Heartbeat ───────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;
    const PING_INTERVAL = 30_000;
    const PONG_TIMEOUT  = 15_000;
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, conn] of this.conns) {
        if (now - conn.lastPong > PING_INTERVAL + PONG_TIMEOUT) {
          // Client missed a pong — terminate.
          conn.ws.terminate();
          this.handleDisconnect(id);
          continue;
        }
        if (conn.ws.readyState === 1) {
          conn.ws.ping();
          send(conn.ws, { type: "ping" });
        }
      }
    }, PING_INTERVAL);
  }

  // ── Metrics ─────────────────────────────────────────────────────────────────

  getMetrics(): WsMetrics {
    const subsByChannel: Record<string, number> = {};
    for (const [ch, ids] of this.channels) {
      subsByChannel[ch] = ids.size;
    }
    let totalSubs = 0;
    for (const conn of this.conns.values()) totalSubs += conn.subs.size;

    return {
      connectedClients: this.conns.size,
      authenticatedClients: [...this.conns.values()].filter((c) => c.userId).length,
      totalSubscriptions: totalSubs,
      subscriptionsByChannel: subsByChannel,
      totalMsgsSent: this.msgsSentTotal,
      uptimeMs: Date.now() - this.startedAt,
    };
  }
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
// Lightweight port of getCanonicalSession for Node.js IncomingMessage.
// Tries the unified session cookie, then academy auth and student session.

function parseCookieJar(cookie: string): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const part of cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    jar[k] = decodeURIComponent(v);
  }
  return jar;
}

async function resolveUserIdFromCookie(cookie: string): Promise<string | null> {
  if (!cookie) return null;
  try {
    const jar = parseCookieJar(cookie);
    const { verifyUnifiedSession } = await import("@/lib/unified-session");
    // Try unified session (primary path since Phase 23+)
    for (const name of ["tecpey_session", "tecpey_academy_session", "tecpey_student_session"]) {
      const token = jar[name];
      if (!token) continue;
      const payload = await verifyUnifiedSession(token);
      if (payload) return payload.accountId ?? payload.studentId ?? null;
    }
    return null;
  } catch { return null; }
}

async function resolveUserIdFromToken(token: string): Promise<string | null> {
  try {
    const { verifyUnifiedSession } = await import("@/lib/unified-session");
    const payload = await verifyUnifiedSession(token);
    return payload ? (payload.accountId ?? payload.studentId ?? null) : null;
  } catch { return null; }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function getWsManager(): WsManager {
  if (!globalThis.tecpeyWsManager) {
    globalThis.tecpeyWsManager = new WsManager();
  }
  return globalThis.tecpeyWsManager;
}
