import { apiOk } from "@/lib/api-validation";
import { isEmailConfigured } from "@/lib/email";

export const dynamic = 'force-dynamic';

async function checkRedis(): Promise<"ok" | "unavailable" | "unconfigured"> {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN;
  if (!url || !token) return "unconfigured";
  try {
    const res = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    const data = await res.json().catch(() => null) as { result?: string } | null;
    return data?.result === "PONG" ? "ok" : "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function GET() {
  const redis = await checkRedis();
  const email = isEmailConfigured() ? "configured" : "unconfigured";

  const checks = {
    app: "ok" as const,
    redis,
    email,
  };

  const isProduction = process.env.NODE_ENV === "production";
  const warnings: string[] = [];
  if (redis === "unconfigured" && isProduction) {
    warnings.push("redis_not_configured: rate limiting is per-instance only");
  }
  if (email === "unconfigured" && isProduction) {
    warnings.push("email_not_configured: transactional emails will not be delivered");
  }

  const overall = redis === "unavailable" ? "degraded" : "ok";

  return apiOk({
    health: overall,
    service: "tecpey-web",
    version: process.env.npm_package_version ?? "unknown",
    environment: process.env.NODE_ENV ?? "unknown",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    node: process.version,
    checks,
    ...(warnings.length > 0 ? { warnings } : {}),
  }, 200, { "Cache-Control": "no-store, max-age=0" });
}
