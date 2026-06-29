import { apiOk } from "@/lib/api-validation";
import { isEmailConfigured } from "@/lib/email";
import { checkDbHealth } from "@/lib/db";
import { getAllFlags } from "@/lib/feature-flags";
import { isErrorTrackingConfigured } from "@/lib/error-tracking";
import { emitAlert } from "@/lib/alerts";

export const dynamic = "force-dynamic";

async function checkRedis(): Promise<{ status: "ok" | "unavailable" | "unconfigured"; latencyMs: number }> {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN;
  if (!url || !token) return { status: "unconfigured", latencyMs: 0 };
  const start = Date.now();
  try {
    const res = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    const data = await res.json().catch(() => null) as { result?: string } | null;
    const status = data?.result === "PONG" ? "ok" : "unavailable";
    return { status, latencyMs: Date.now() - start };
  } catch {
    return { status: "unavailable", latencyMs: Date.now() - start };
  }
}

function memoryUsageMb() {
  const mem = process.memoryUsage();
  return {
    rss: Math.round(mem.rss / 1024 / 1024),
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    external: Math.round(mem.external / 1024 / 1024),
  };
}

export async function GET() {
  const start = Date.now();
  const isProduction = process.env.NODE_ENV === "production";

  const [db, redis] = await Promise.all([checkDbHealth(), checkRedis()]);

  const email = isEmailConfigured() ? "configured" : "unconfigured";

  // Emit alerts for critical failures (rate-limited to once per 60 s by the emitter).
  if (db.status === "unavailable") emitAlert("DB_DOWN", "Database health check failed");
  if (redis.status === "unavailable") emitAlert("REDIS_DOWN", "Redis health check failed");
  if (email === "unconfigured" && isProduction) emitAlert("EMAIL_NOT_CONFIGURED", "EMAIL_PROVIDER is not configured");

  const warnings: string[] = [];
  if (db.status === "unconfigured") warnings.push("database_not_configured: DATABASE_URL is missing or placeholder");
  if (db.status === "unavailable") warnings.push("database_unavailable: cannot connect to PostgreSQL");
  if (redis.status === "unconfigured" && isProduction) warnings.push("redis_not_configured: rate limiting is per-instance only");
  if (redis.status === "unavailable") warnings.push("redis_unavailable: cannot reach Redis");
  if (email === "unconfigured" && isProduction) warnings.push("email_not_configured: transactional emails will not be delivered");

  // Overall status: "degraded" on any non-ok non-unconfigured check.
  const overall = (db.status === "unavailable" || redis.status === "unavailable")
    ? "degraded"
    : "ok";

  const checks = {
    app: "ok" as const,
    database: db.status,
    redis: redis.status,
    email,
  };

  const flags = getAllFlags();

  return apiOk({
    health: overall,
    service: "tecpey-web",
    environment: process.env.NODE_ENV ?? "unknown",
    timestamp: new Date().toISOString(),
    healthCheckLatencyMs: Date.now() - start,
    uptime: {
      seconds: Math.floor(process.uptime()),
    },
    build: {
      version: process.env.NEXT_PUBLIC_BUILD_VERSION ?? process.env.npm_package_version ?? "unknown",
      commit: process.env.NEXT_PUBLIC_GIT_COMMIT ?? "unknown",
      node: process.version,
    },
    memory: memoryUsageMb(),
    checks,
    latency: {
      databaseMs: db.latencyMs,
      redisMs: redis.latencyMs,
    },
    migrations: {
      applied: db.migrations ?? null,
      status: db.migrations !== undefined ? "tracked" : "unknown",
    },
    tenantSystem: {
      status: db.status === "ok" ? "available" : "unavailable",
      mode: "single-tenant",
      defaultTenantId: process.env.PLATFORM_DEFAULT_TENANT_ID ?? "tecpey",
    },
    featureFlags: flags,
    observability: {
      errorTracking: isErrorTrackingConfigured() ? "configured" : "unconfigured",
      alertWebhook: process.env.ALERT_WEBHOOK_URL ? "configured" : "unconfigured",
    },
    ...(warnings.length > 0 ? { warnings } : {}),
  }, 200, { "Cache-Control": "no-store, max-age=0" });
}
