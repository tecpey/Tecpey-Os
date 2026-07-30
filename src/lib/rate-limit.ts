import { NextRequest } from "next/server";
import { logger } from "./logger";
import { getTrustedClientIp } from "./security/trusted-client-ip";

// Logged at most once per process lifetime to avoid flooding logs.
let _redisUnconfiguredWarned = false;
let _untrustedProxyHeadersWarned = false;

function warnRedisUnconfigured() {
  if (_redisUnconfiguredWarned) return;
  _redisUnconfiguredWarned = true;
  logger.error(
    "[rate-limit] Redis is not configured in production. Rate limits are per-instance only " +
    "and will not coordinate across multiple server instances. Set UPSTASH_REDIS_REST_URL " +
    "and UPSTASH_REDIS_REST_TOKEN before deploying.",
  );
}

function warnUntrustedProxyHeaders() {
  if (_untrustedProxyHeadersWarned) return;
  _untrustedProxyHeadersWarned = true;
  logger.error(
    "[rate-limit] client IP is not verifiable: TECPEY_TRUSTED_PROXY_HEADER / " +
    "TECPEY_TRUSTED_PROXY_HOPS is unset or the configured forwarding header is missing/invalid. " +
    "Spoofable forwarding headers are ignored and affected requests share one conservative " +
    "fail-closed bucket. Configure the trusted proxy contract before deploying.",
  );
}

function allowMemoryFallback(): boolean {
  return process.env.TECPEY_ALLOW_MEMORY_RATE_LIMIT === "1";
}

function productionFallbackResult(windowMs: number): RateLimitResult {
  return { ok: false, remaining: 0, resetAt: Date.now() + windowMs, retryAfterSeconds: Math.ceil(windowMs / 1000), mode: "memory" };
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  mode: "redis" | "memory";
};

type MemoryBucket = { count: number; resetAt: number };

declare global {
  var tecpeyRateLimitBuckets: Map<string, MemoryBucket> | undefined;
}

const fallbackBuckets = () => {
  const store = globalThis.tecpeyRateLimitBuckets ?? new Map<string, MemoryBucket>();
  globalThis.tecpeyRateLimitBuckets = store;
  return store;
};

/**
 * Client identity for rate limiting and audit trails.
 *
 * Security contract (docs/audit/FINDINGS.md F-007): forwarding headers are
 * attacker-controlled and may be trusted only when the deployment explicitly
 * opts in through TECPEY_TRUSTED_PROXY_HEADER / TECPEY_TRUSTED_PROXY_HOPS
 * (see src/lib/security/trusted-client-ip.ts and scripts/validate-env.mjs).
 *
 * When the trusted contract cannot establish a verified address, production
 * requests share one conservative bucket instead of trusting a spoofable
 * header value. Outside production the legacy header order is kept so local
 * development remains ergonomic.
 */
export function getClientIp(request: NextRequest) {
  const trusted = getTrustedClientIp(request);
  if (trusted) return trusted.slice(0, 80);

  if (process.env.NODE_ENV === "production") {
    warnUntrustedProxyHeaders();
    return "untrusted-identity";
  }

  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  ).slice(0, 80);
}

function memoryRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const store = fallbackBuckets();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { ok: true, remaining: Math.max(0, limit - 1), resetAt, retryAfterSeconds: 0, mode: "memory" };
  }
  current.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  return {
    ok: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
    retryAfterSeconds: current.count <= limit ? 0 : retryAfterSeconds,
    mode: "memory",
  };
}

async function redisRestRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const safeKey = `tecpey:rl:${key.replace(/[^a-zA-Z0-9:_-]/g, "_")}`;
  const now = Date.now();
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  // Atomic create-with-TTL + increment in one pipeline round-trip. The previous
  // INCR-then-EXPIRE pair could leave a key without any TTL when the second
  // call failed, permanently blocking the identity — a self-inflicted denial
  // of service against legitimate users.
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["SET", safeKey, "0", "PX", String(windowMs), "NX"],
      ["INCR", safeKey],
    ]),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as Array<{ result?: unknown }> | null;
  const count = Number(data?.[1]?.result ?? 0);
  if (!Number.isFinite(count) || count < 1) return null;

  const ok = count <= limit;
  const remaining = Math.max(0, limit - count);
  return {
    ok,
    remaining,
    resetAt: now + windowMs,
    retryAfterSeconds: ok ? 0 : windowSeconds,
    mode: "redis",
  };
}

/** Rate limit by user ID instead of IP (for authenticated endpoints). */
export async function rateLimitUser(
  request: NextRequest,
  options: { namespace: string; limit: number; windowMs: number; userId: string },
): Promise<RateLimitResult> {
  const key = `${options.namespace}:user:${options.userId}`;
  try {
    const redis = await redisRestRateLimit(key, options.limit, options.windowMs);
    if (redis) return redis;
  } catch { /* fallback */ }
  if (process.env.NODE_ENV === "production") {
    warnRedisUnconfigured();
    if (!allowMemoryFallback()) return productionFallbackResult(options.windowMs);
  }
  return memoryRateLimit(key, options.limit, options.windowMs);
}

/** Rate limit by API key ID. */
export async function rateLimitApiKey(
  options: { namespace: string; limit: number; windowMs: number; keyId: string },
): Promise<RateLimitResult> {
  const key = `${options.namespace}:apikey:${options.keyId}`;
  try {
    const redis = await redisRestRateLimit(key, options.limit, options.windowMs);
    if (redis) return redis;
  } catch { /* fallback */ }
  if (process.env.NODE_ENV === "production") {
    warnRedisUnconfigured();
    if (!allowMemoryFallback()) return productionFallbackResult(options.windowMs);
  }
  return memoryRateLimit(key, options.limit, options.windowMs);
}

export async function rateLimit(request: NextRequest, options: { namespace: string; limit: number; windowMs: number; identity?: string }) {
  const identity = options.identity || getClientIp(request);
  const key = `${options.namespace}:${identity}`;
  try {
    const redis = await redisRestRateLimit(key, options.limit, options.windowMs);
    if (redis) return redis;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[rate-limit] Redis unavailable, falling back to in-memory limiter", { key, message: msg });
  }
  // In production, log an error the first time we fall back to memory-only limiting.
  if (process.env.NODE_ENV === "production") {
    warnRedisUnconfigured();
    if (!allowMemoryFallback()) return productionFallbackResult(options.windowMs);
  }
  return memoryRateLimit(key, options.limit, options.windowMs);
}
