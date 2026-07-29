import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  redisWebNodeDrainTimeoutMs,
  waitForRedisWebNodeDrain,
  webNodeRegistryKey,
} from "./redis-node-isolation.mjs";

const e2eRoot = dirname(fileURLToPath(import.meta.url));

test("uses the production web-node registry key", async () => {
  const productionSource = await readFile(
    resolve(e2eRoot, "../../src/lib/redis-pubsub.ts"),
    "utf8",
  );
  assert.match(
    productionSource,
    new RegExp(
      `const WEB_NODE_REGISTRY_KEY = ${JSON.stringify(webNodeRegistryKey)}`,
    ),
  );
});

test("default drain deadline exceeds the production registration TTL", async () => {
  const productionSource = await readFile(
    resolve(e2eRoot, "../../src/lib/redis-pubsub.ts"),
    "utf8",
  );
  const ttlSource = /const NODE_TTL_MS = ([\d_]+);/.exec(productionSource)?.[1];
  assert.ok(ttlSource, "production web-node TTL must remain statically governed");
  const productionTtlMs = Number(ttlSource.replaceAll("_", ""));
  assert.ok(
    redisWebNodeDrainTimeoutMs > productionTtlMs,
    "Redis drain must allow a force-killed server registration to expire",
  );
});

test("waits until Redis reports zero active web nodes", async () => {
  const observedCounts = [2, 1, 0];
  const redis = {
    async eval() {
      return observedCounts.shift();
    },
  };

  await waitForRedisWebNodeDrain(redis, {
    timeoutMs: 1_000,
    pollIntervalMs: 1,
  });
  assert.deepEqual(observedCounts, []);
});

test("fails with bounded Redis member diagnostics when drain stalls", async () => {
  const redis = {
    async eval() {
      return 1;
    },
    async zrange(key, start, stop, withScores) {
      assert.equal(key, webNodeRegistryKey);
      assert.deepEqual([start, stop, withScores], [0, 9, "WITHSCORES"]);
      return ["stale-node-id", "1999999999999"];
    },
  };

  await assert.rejects(
    waitForRedisWebNodeDrain(redis, {
      timeoutMs: 10,
      pollIntervalMs: 1,
    }),
    /redis_web_node_drain_timeout:active=1:members=\["stale-node-id","1999999999999"\]/,
  );
});

test("rejects malformed Redis discovery results", async () => {
  const redis = {
    async eval() {
      return "not-a-count";
    },
  };

  await assert.rejects(
    waitForRedisWebNodeDrain(redis),
    /redis_web_node_drain_invalid_count:not-a-count/,
  );
});
