// Lightweight in-memory metrics store.
// Backed by globalThis so state survives hot-reload in development.
// Cleared on process restart (not persisted).

type Counter = { total: number };
type LatencyTracker = { count: number; totalMs: number; avgMs: number };

type MetricsStore = {
  requests: Record<string, Counter>;
  errors: Record<string, Counter>;
  latency: Record<string, LatencyTracker>;
  counters: Record<string, number>;
  startedAt: string;
};

declare global {
  var tecpeyMetrics: MetricsStore | undefined;
}

function store(): MetricsStore {
  if (!globalThis.tecpeyMetrics) {
    globalThis.tecpeyMetrics = {
      requests: {},
      errors: {},
      latency: {},
      counters: {},
      startedAt: new Date().toISOString(),
    };
  }
  return globalThis.tecpeyMetrics;
}

export const metrics = {
  recordRequest(route: string, status: number, latencyMs: number) {
    const s = store();

    s.requests[route] = s.requests[route] ?? { total: 0 };
    s.requests[route].total += 1;

    const t = s.latency[route] ?? { count: 0, totalMs: 0, avgMs: 0 };
    t.count += 1;
    t.totalMs += latencyMs;
    t.avgMs = Math.round(t.totalMs / t.count);
    s.latency[route] = t;

    if (status >= 400) {
      const key = `${route}:${status}`;
      s.errors[key] = s.errors[key] ?? { total: 0 };
      s.errors[key].total += 1;
    }
  },

  recordError(route: string, code: string) {
    const s = store();
    const key = `${route}:${code}`;
    s.errors[key] = s.errors[key] ?? { total: 0 };
    s.errors[key].total += 1;
  },

  increment(name: string, by = 1) {
    const s = store();
    s.counters[name] = (s.counters[name] ?? 0) + by;
  },

  getSnapshot() {
    const s = store();
    const totalRequests = Object.values(s.requests).reduce((sum, c) => sum + c.total, 0);
    const totalErrors = Object.values(s.errors).reduce((sum, c) => sum + c.total, 0);
    return {
      startedAt: s.startedAt,
      collectedAt: new Date().toISOString(),
      totalRequests,
      totalErrors,
      errorRate: totalRequests > 0 ? Number(((totalErrors / totalRequests) * 100).toFixed(2)) : 0,
      routes: {
        requests: s.requests,
        latency: s.latency,
        errors: s.errors,
      },
      counters: s.counters,
    };
  },

  reset() {
    globalThis.tecpeyMetrics = undefined;
  },
};
