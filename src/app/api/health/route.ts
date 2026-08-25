import { apiOk } from "@/lib/api-validation";
import { isEmailRuntimeConfigured } from "@/lib/email";
import { checkDbHealth } from "@/lib/db";
import { getAllFlags } from "@/lib/feature-flags";
import { errorTrackingStatus } from "@/lib/error-tracking";
import { alertWebhookStatus } from "@/lib/alerts";
import { emitAlert } from "@/lib/alerts";
import { getRedisPubSub } from "@/lib/redis-pubsub";
import { getRuntimeReadiness } from "@/lib/runtime-readiness";

export const dynamic = "force-dynamic";

async function checkRedis(): Promise<{ status: "ok" | "unavailable" | "unconfigured"; latencyMs: number }> {
  const runtimeRedis = getRedisPubSub();
  if (process.env.REDIS_URL?.trim()) {
    const start = Date.now();
    const status = runtimeRedis.getHealth().ready && await runtimeRedis.ping()
      ? "ok"
      : "unavailable";
    return { status, latencyMs: Date.now() - start };
  }
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

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("probe") === "live") {
    return Response.json(
      { status: "alive" },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const start = Date.now();
  const isProduction = process.env.NODE_ENV === "production";

  const [db, redis, emailConfigured] = await Promise.all([
    checkDbHealth(),
    checkRedis(),
    isEmailRuntimeConfigured(),
  ]);
  const runtime = getRuntimeReadiness();

  const email = emailConfigured ? "configured" : "unconfigured";

  // Emit alerts for critical failures (rate-limited to once per 60 s by the emitter).
  if (db.status === "unavailable") emitAlert("DB_DOWN", "Database health check failed");
  if (db.status === "ok" && db.schema?.status !== "current") {
    emitAlert("MIGRATION_FAILED", `Database schema is not ready: ${db.schema?.status ?? "unknown"}`);
  }
  if (redis.status === "unavailable") emitAlert("REDIS_DOWN", "Redis health check failed");
  if (email === "unconfigured" && isProduction) emitAlert("EMAIL_NOT_CONFIGURED", "EMAIL_PROVIDER is not configured");

  const warnings: string[] = [];
  if (db.status === "unconfigured") warnings.push("database_not_configured: DATABASE_URL is missing or placeholder");
  if (db.status === "unavailable") warnings.push("database_unavailable: cannot connect to PostgreSQL");
  if (db.status === "ok" && db.schema?.status !== "current") {
    warnings.push(`database_schema_not_ready: ${db.schema?.status ?? "unknown"}`);
  }
  if (redis.status === "unconfigured" && isProduction) warnings.push("redis_not_configured: production requires shared Redis");
  if (redis.status === "unavailable") warnings.push("redis_unavailable: cannot reach Redis");
  if (email === "unconfigured" && isProduction) warnings.push("email_not_configured: transactional emails will not be delivered");

  // Production must fail closed when a dependency required for a healthy
  // promoted runtime is unavailable or missing. Transactional email is a
  // production readiness dependency: preflight refuses an unusable provider,
  // and the post-start health endpoint must make the same decision visible to
  // Compose/load-balancer curl --fail probes rather than returning HTTP 200.
  const criticalDependencyFailure =
    db.status !== "ok" ||
    db.schema?.status !== "current" ||
    (isProduction && redis.status !== "ok") ||
    (isProduction && email !== "configured") ||
    (isProduction && (runtime.phase !== "ready" || runtime.requiredWorkers === "starting"));

  const overall = criticalDependencyFailure
    ? "unhealthy"
    : warnings.length > 0
      ? "degraded"
      : "ok";

  const checks = {
    app: "ok" as const,
    database: db.status,
    schema: db.schema?.status ?? "unavailable",
    redis: redis.status,
    runtime: runtime.phase,
    requiredWorkers: runtime.requiredWorkers,
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
      commit: process.env.TECPEY_IMMUTABLE_BUILD_COMMIT_SHA ?? "unknown",
      node: process.version,
    },
    memory: memoryUsageMb(),
    checks,
    latency: {
      databaseMs: db.latencyMs,
      redisMs: redis.latencyMs,
    },
    migrations: {
      applied: db.schema?.applied ?? null,
      expected: db.schema?.expected ?? null,
      status: db.schema?.status ?? "unavailable",
      planHash: db.schema?.planHash ?? null,
      runnerId: db.schema?.runnerId ?? null,
      startedAt: db.schema?.startedAt ?? null,
      finishedAt: db.schema?.finishedAt ?? null,
      errorCode: db.schema?.errorCode ?? null,
    },
    tenantSystem: {
      status: db.status === "ok" && db.schema?.status === "current" ? "available" : "unavailable",
      mode: "single-tenant",
      defaultTenantId: process.env.PLATFORM_DEFAULT_TENANT_ID ?? "tecpey",
    },
    featureFlags: flags,
    observability: {
      errorTracking: errorTrackingStatus(),
      alertWebhook: alertWebhookStatus(),
    },
    ...(warnings.length > 0 ? { warnings } : {}),
  }, criticalDependencyFailure ? 503 : 200, { "Cache-Control": "no-store, max-age=0" });
}
