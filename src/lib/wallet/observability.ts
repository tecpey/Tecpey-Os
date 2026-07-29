// Wallet Observability — Phase 38
// Redis INCR counters, same pattern as auth-metrics.ts.

import type { WalletMetricKey } from "./types";

function getRedis() {
  return (globalThis as Record<string, unknown>).tecpeyRedisClient as {
    incrby(key: string, val: number): Promise<number>;
    get(key: string): Promise<string | null>;
    del(key: string): Promise<number>;
  } | null ?? null;
}

export function trackWalletMetric(key: WalletMetricKey, value = 1): void {
  void (async () => {
    try {
      const redis = getRedis();
      if (!redis) return;
      await redis.incrby(`wallet:metrics:${key}`, value);
    } catch {
      // never block the tx pipeline for metrics
    }
  })();
}

export async function getWalletMetrics(): Promise<Record<WalletMetricKey, number>> {
  const redis = getRedis();

  const ALL_KEYS: WalletMetricKey[] = [
    "withdraw_build_ms",
    "withdraw_sign_ms",
    "withdraw_broadcast_ms",
    "confirmation_latency_ms",
    "rpc_failures",
    "rebroadcast_count",
    "wallet_low_balance",
    "idempotency_duplicate_blocked",
    "tx_dropped_detected",
  ];

  if (!redis) {
    return ALL_KEYS.reduce((acc, k) => { acc[k] = 0; return acc; }, {} as Record<WalletMetricKey, number>);
  }

  const values = await Promise.all(ALL_KEYS.map((k) => redis.get(`wallet:metrics:${k}`)));
  const result = {} as Record<WalletMetricKey, number>;
  for (let i = 0; i < ALL_KEYS.length; i++) {
    result[ALL_KEYS[i]] = parseInt(values[i] ?? "0");
  }
  return result;
}

export async function resetWalletMetrics(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const ALL_KEYS: WalletMetricKey[] = [
    "withdraw_build_ms", "withdraw_sign_ms", "withdraw_broadcast_ms",
    "confirmation_latency_ms", "rpc_failures", "rebroadcast_count",
    "wallet_low_balance", "idempotency_duplicate_blocked", "tx_dropped_detected",
  ];
  await Promise.all(ALL_KEYS.map((k) => redis.del(`wallet:metrics:${k}`)));
}

export function recordLatency(key: WalletMetricKey, startMs: number): void {
  trackWalletMetric(key, Date.now() - startMs);
}
