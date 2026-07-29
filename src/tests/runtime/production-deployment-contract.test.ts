import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { configureProductionConnectionUrls } from "@/lib/production-connection-env";
import { drainRuntime } from "@/lib/runtime-shutdown";

test("production bootstrap safely encodes URI-reserved credential characters", () => {
  const password = "s#tr?o/n%g@p:a ss";
  const env: Record<string, string | undefined> = {
    TECPEY_DATABASE_HOST: "postgres",
    TECPEY_DATABASE_PORT: "5432",
    TECPEY_DATABASE_NAME: "tecpey",
    TECPEY_DATABASE_USER: "tecpey",
    POSTGRES_PASSWORD: password,
    TECPEY_REDIS_HOST: "redis",
    TECPEY_REDIS_PORT: "6379",
    REDIS_PASSWORD: password,
  };

  configureProductionConnectionUrls(env);

  const database = new URL(env.DATABASE_URL!);
  const redis = new URL(env.REDIS_URL!);
  assert.equal(decodeURIComponent(database.password), password);
  assert.equal(decodeURIComponent(redis.password), password);
  assert.equal(database.hostname, "postgres");
  assert.equal(redis.hostname, "redis");
  assert.match(env.DATABASE_URL!, /%23/);
  assert.match(env.REDIS_URL!, /%3F/);
});

test("production bootstrap preserves explicitly configured connection URLs", () => {
  const env = {
    DATABASE_URL: "postgresql://external/database",
    REDIS_URL: "rediss://external:6380",
    TECPEY_DATABASE_HOST: "postgres",
    TECPEY_REDIS_HOST: "redis",
  };

  configureProductionConnectionUrls(env);

  assert.equal(env.DATABASE_URL, "postgresql://external/database");
  assert.equal(env.REDIS_URL, "rediss://external:6380");
});

test("production bootstrap enforces the CSP connection environment before runtime import", () => {
  const bootstrap = readFileSync(
    "scripts/run-production-bootstrap.ts",
    "utf8",
  );
  const environmentLoad = bootstrap.indexOf(
    "loadEnvConfig(process.cwd(), false);",
  );
  const assertion = bootstrap.indexOf("assertCspConnectionEnvironment();");
  const serverImport = bootstrap.indexOf('await import("../server")');

  assert.ok(environmentLoad >= 0);
  assert.ok(assertion >= 0);
  assert.ok(serverImport >= 0);
  assert.ok(environmentLoad < assertion);
  assert.ok(assertion < serverImport);
});

test("CSP runtime authority avoids build-time inlining of public endpoint values", () => {
  const policy = readFileSync(
    "src/lib/security/csp-connection-policy.ts",
    "utf8",
  );

  assert.doesNotMatch(policy, /process\.env\.NEXT_PUBLIC_/);
  assert.match(policy, /env\[name\]/);
});

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
