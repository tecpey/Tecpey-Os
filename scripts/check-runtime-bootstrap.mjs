import { readFile } from "node:fs/promises";

const server = await readFile("server.ts", "utf8");
const runtimeSmoke = await readFile("scripts/check-ui-runtime.mjs", "utf8");
const failures = [];

const requireText = (source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const rejectText = (source, text, message) => {
  if (source.includes(text)) failures.push(message);
};

rejectText(
  server,
  'from "./src/workers/withdrawal-worker"',
  "server must not statically import Redis/BullMQ withdrawal workers before environment validation",
);
requireText(
  server,
  'await import("./src/workers/withdrawal-worker")',
  "withdrawal workers must be loaded dynamically after Redis validation",
);
requireText(
  server,
  "process.env.REDIS_URL?.trim()",
  "blank Redis configuration must be normalized before bootstrap decisions",
);
requireText(
  server,
  'throw new Error("redis_url_required_in_production")',
  "production custom server must fail closed without Redis",
);
requireText(
  server,
  'parsed.protocol !== "redis:" && parsed.protocol !== "rediss:"',
  "custom server must reject unsupported Redis URL protocols",
);
requireText(
  server,
  'process.env.TECPEY_BIND_HOST?.trim() || "0.0.0.0"',
  "custom server must define one explicit governed bind hostname",
);
requireText(
  server,
  "next({ dev, hostname, port, httpServer })",
  "Next custom-server bootstrap must receive the same hostname, port and HTTP server identity",
);
requireText(
  server,
  "httpServer.listen(port, hostname",
  "HTTP listen identity must match the hostname and port passed to Next",
);
requireText(
  runtimeSmoke,
  'mode === "development" ? "" : (process.env.REDIS_URL ?? "")',
  "runtime smoke must prove development without Redis and production with governed Redis",
);

if (failures.length) {
  console.error("Runtime bootstrap authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

await import("./check-redis-safety-authority.mjs");

console.log(
  "Runtime bootstrap authority check passed: explicit Next/HTTP network identity, Redis-optional development and fail-closed production.",
);
