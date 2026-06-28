import { NextResponse } from 'next/server';

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

  const checks = {
    app: "ok" as const,
    redis,
  };

  const overall = redis === "unavailable" ? "degraded" : "ok";

  return NextResponse.json(
    {
      ok: overall === "ok",
      status: overall,
      service: 'tecpey-web',
      version: process.env.npm_package_version ?? "unknown",
      environment: process.env.NODE_ENV ?? "unknown",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      node: process.version,
      checks,
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  );
}
