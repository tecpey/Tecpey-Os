"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export type MentorInsightsProfile = {
  level: "beginner" | "intermediate" | "advanced";
  riskProfile: "low" | "medium" | "high";
  primaryGoal: string;
  weakAreas: string[];
  strongAreas: string[];
  confidenceScore: number;
  disciplineScore: number;
  learningStyle: string;
  updatedAt: string;
};

export type MentorInsightItem = {
  id: string;
  insightType: string;
  content: string;
  generatedAt: string;
};

export type MentorInsightsData = {
  profile: MentorInsightsProfile | null;
  insights: MentorInsightItem[];
};

export type UseMentorInsightsReturn = {
  data: MentorInsightsData | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
};

// ── Module-level stale-while-revalidate cache ──────────────────────────────────
// Shared across all mounted instances of useMentorInsights in the page.

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _cachedData: MentorInsightsData | null = null;
let _cachedAt = 0;

function isCacheStale(): boolean {
  return Date.now() - _cachedAt >= CACHE_TTL_MS;
}

// ── Fetch ──────────────────────────────────────────────────────────────────────

async function doFetch(signal: AbortSignal): Promise<MentorInsightsData | null> {
  const res = await fetch("/api/mentor-insights", { signal, cache: "no-store" });
  if (!res.ok) return null; // 401 unauthenticated, 429 rate-limited, etc.
  const json = (await res.json()) as {
    ok?: boolean;
    profile?: MentorInsightsProfile | null;
    insights?: MentorInsightItem[];
  };
  if (!json.ok) return null;
  return {
    profile: json.profile ?? null,
    insights: Array.isArray(json.insights) ? json.insights : [],
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Fetch the authenticated student's mentor profile and insight snapshots.
 *
 * Behaviour:
 * - Returns cached data immediately (stale-while-revalidate, 5-min TTL).
 * - `loading` is true only on the very first fetch (no stale data available).
 * - Cleans up the in-flight request on unmount via AbortController.
 * - `retry()` bypasses the cache and triggers a fresh fetch.
 * - Returns null data (not an error) for 401/429 — widget handles gracefully.
 */
export function useMentorInsights(): UseMentorInsightsReturn {
  const [data, setData] = useState<MentorInsightsData | null>(() => _cachedData);
  const [loading, setLoading] = useState(_cachedData === null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const forced = retryKey > 0;

    // Fresh cache and not a forced retry — serve immediately, nothing to do.
    if (!forced && _cachedData && !isCacheStale()) {
      setData(_cachedData);
      setLoading(false);
      return;
    }

    // Stale or empty: serve whatever stale data exists while revalidating.
    if (_cachedData) setData(_cachedData);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Show spinner only when there is no stale data to display.
    if (!_cachedData) setLoading(true);
    setError(null);

    doFetch(ctrl.signal)
      .then((result) => {
        if (ctrl.signal.aborted) return;
        if (result) {
          _cachedData = result;
          _cachedAt = Date.now();
          setData(result);
          setError(null);
        } else {
          // Not authenticated or API error — do not crash, just note unavailable.
          setError("unavailable");
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setError("unavailable");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [retryKey]);

  const retry = useCallback(() => setRetryKey((k) => k + 1), []);

  return { data, loading, error, retry };
}
