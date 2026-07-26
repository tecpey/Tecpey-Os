import assert from "node:assert/strict";
import test from "node:test";
import { drainRuntime } from "@/lib/runtime-shutdown";

test("bounded shutdown drains HTTP and WebSocket traffic before workers and Redis", async () => {
  const events: string[] = [];
  const server = {
    listening: true,
    close(callback: (error?: Error) => void) {
      setTimeout(() => {
        events.push("http-drained");
        this.listening = false;
        callback();
      }, 40);
    },
    closeIdleConnections() {},
    closeAllConnections() {
      this.listening = false;
    },
  };

  const client = {
    close() {
      setTimeout(() => {
        events.push("websocket-drained");
        clients.delete(client);
      }, 20);
    },
    terminate() {
      clients.delete(client);
      events.push("websocket-forced");
    },
  };
  const clients = new Set([client]);
  const webSocketServer = {
    clients,
    close(callback: () => void) {
      callback();
    },
  };

  const failures = await drainRuntime({
    httpServer: server as never,
    webSocketServer: webSocketServer as never,
    workers: {
      async stopWithdrawalWorkers() {
        events.push("workers-stopped");
      },
    },
    redis: {
      async shutdown() {
        events.push("redis-stopped");
      },
    },
    redisConfigured: true,
    deadlineMs: 500,
  });

  assert.deepEqual(failures, []);
  assert.deepEqual(events, [
    "websocket-drained",
    "http-drained",
    "workers-stopped",
    "redis-stopped",
  ]);
});

test("shutdown deadline force-closes non-draining WebSockets", async () => {
  const server = {
    listening: true,
    close(callback: (error?: Error) => void) {
      this.listening = false;
      callback();
    },
    closeIdleConnections() {},
    closeAllConnections() {
      this.listening = false;
    },
  };
  let terminated = false;
  const client = {
    close() {},
    terminate() {
      terminated = true;
      clients.delete(client);
    },
  };
  const clients = new Set([client]);
  const webSocketServer = { clients, close: (callback: () => void) => callback() };

  await drainRuntime({
    httpServer: server as never,
    webSocketServer: webSocketServer as never,
    workers: null,
    redis: { async shutdown() {} },
    redisConfigured: false,
    deadlineMs: 30,
  });
  assert.equal(terminated, true);
});
