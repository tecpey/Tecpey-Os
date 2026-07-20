import { readFile } from "node:fs/promises";

const [redisSource, serverSource, packageSource, runtimeGuardSource, ciSource] = await Promise.all([
  readFile("src/lib/redis-pubsub.ts", "utf8"),
  readFile("server.ts", "utf8"),
  readFile("package.json", "utf8"),
  readFile("scripts/check-runtime-bootstrap.mjs", "utf8"),
  readFile(".github/workflows/ci.yml", "utf8"),
]);

const failures = [];
const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const rejectText = (source, text, message) => {
  if (source.includes(text)) failures.push(message);
};
const requireOrder = (source, first, second, message) => {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) failures.push(message);
};

requireText(
  redisSource,
  "export type NodeDiscoveryResult",
  "Redis node discovery must expose an explicit success/failure result",
);
requireText(
  redisSource,
  'state: PubSubHealthState = "idle"',
  "Redis manager must maintain a typed health state",
);
requireText(
  redisSource,
  "await Promise.all([this.pubClient.ping(), this.subClient.ping()])",
  "publisher and subscriber PING must complete before readiness",
);
requireText(
  redisSource,
  "redis_subscription_incomplete",
  "subscription completeness must be verified",
);
requireText(
  redisSource,
  "await this.registerNodeStrict()",
  "node registration must complete before readiness",
);
requireText(
  redisSource,
  'redis.call("ZREMRANGEBYSCORE"',
  "stale web-node heartbeats must be removed through bounded sorted-set discovery",
);
requireText(
  redisSource,
  'redis.call("ZCOUNT"',
  "active web-node discovery must use bounded sorted-set counting",
);
requireText(
  redisSource,
  'this.handleRuntimeFailure("redis_node_heartbeat_failed")',
  "heartbeat loss must transition runtime safety state",
);
requireText(
  redisSource,
  "this.fatalHandler(reason)",
  "runtime Redis safety loss must invoke the controlled fatal handler",
);
rejectText(
  redisSource,
  ".keys(",
  "blocking Redis KEYS discovery is forbidden",
);
rejectText(
  redisSource,
  "catch { return 1; }",
  "Redis discovery errors must never become the safe-looking node count 1",
);
rejectText(
  redisSource,
  "if (!this.pubClient) return 1",
  "missing Redis authority must never become the safe-looking node count 1",
);

requireText(
  serverSource,
  "pubsub.setFatalHandler",
  "server must terminate through controlled shutdown after runtime Redis safety loss",
);
requireText(
  serverSource,
  "readiness.activeWebNodes > 1",
  "server must reject more than one active web/matching node",
);
requireText(
  serverSource,
  'throw new Error("redis_url_required_in_production")',
  "production must require Redis configuration",
);
requireOrder(
  serverSource,
  "await pubsub.initialize(redisUrl)",
  'await import("./src/workers/withdrawal-worker")',
  "withdrawal workers must start only after Redis readiness verification",
);
requireOrder(
  serverSource,
  "await pubsub.initialize(redisUrl)",
  "await listen()",
  "HTTP/WebSocket traffic must start only after Redis readiness verification",
);
requireOrder(
  serverSource,
  "readiness.activeWebNodes > 1",
  "await listen()",
  "single-node matching policy must be enforced before HTTP listen",
);

requireText(
  packageSource,
  '"redis:safety:check"',
  "package scripts must expose the permanent Redis safety guard",
);
requireText(
  packageSource,
  '"test:redis-safety"',
  "package scripts must expose focused Redis safety tests",
);
requireText(
  packageSource,
  "src/tests/runtime/redis-pubsub-safety.test.ts",
  "focused Redis safety test path must remain explicit",
);
requireText(
  runtimeGuardSource,
  'await import("./check-redis-safety-authority.mjs")',
  "the permanent runtime bootstrap guard must execute Redis safety checks",
);
requireText(
  ciSource,
  "node scripts/check-runtime-bootstrap.mjs",
  "CI must execute the permanent runtime bootstrap authority guard",
);
requireText(
  ciSource,
  "npm test",
  "CI full-suite execution must include the Redis safety test",
);

if (failures.length > 0) {
  console.error("Redis safety authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Redis safety authority check passed: startup and runtime dependency failures fail closed.",
);
