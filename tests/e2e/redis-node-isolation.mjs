import { Redis } from "ioredis";

export const webNodeRegistryKey = "tecpey:nodes:web";
export const redisWebNodeDrainTimeoutMs = 70_000;

const activeNodeCountScript = `
local now = ARGV[1]
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now)
return redis.call("ZCOUNT", KEYS[1], "(" .. now, "+inf")
`;

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function waitForRedisWebNodeDrain(
  redis,
  { timeoutMs = redisWebNodeDrainTimeoutMs, pollIntervalMs = 100 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let activeNodes = null;

  while (Date.now() < deadline) {
    const raw = await redis.eval(
      activeNodeCountScript,
      1,
      webNodeRegistryKey,
      String(Date.now()),
    );
    activeNodes = Number(raw);
    if (!Number.isSafeInteger(activeNodes) || activeNodes < 0) {
      throw new Error(`redis_web_node_drain_invalid_count:${String(raw)}`);
    }
    if (activeNodes === 0) return;
    await new Promise((resolvePromise) =>
      setTimeout(resolvePromise, pollIntervalMs),
    );
  }

  let members = [];
  try {
    members = await redis.zrange(webNodeRegistryKey, 0, 9, "WITHSCORES");
  } catch (error) {
    members = [`diagnostic_failed:${safeError(error)}`];
  }
  throw new Error(
    `redis_web_node_drain_timeout:active=${activeNodes ?? "unknown"}:` +
      `members=${JSON.stringify(members)}`,
  );
}

export async function createRedisWebNodeObserver(redisUrl) {
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    commandTimeout: 5_000,
    enableReadyCheck: true,
  });

  try {
    await redis.connect();
    await redis.ping();
  } catch (error) {
    redis.disconnect(false);
    throw new Error(`browser_qa_redis_observer_unavailable:${safeError(error)}`);
  }

  return {
    waitForDrain(options) {
      return waitForRedisWebNodeDrain(redis, options);
    },
    close() {
      redis.disconnect(false);
    },
  };
}
