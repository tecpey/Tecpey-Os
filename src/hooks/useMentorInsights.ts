"use client";

import { useCallback, useEffect, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export type MentorEvidenceState = "unknown" | "provisional" | "observed";

export type MentorInsightsProfile = {
  level: "beginner" | "intermediate" | "advanced" | null;
  levelEvidenceState: MentorEvidenceState;
  riskProfile: "low" | "medium" | "high" | null;
  riskEvidenceState: MentorEvidenceState;
  primaryGoal: string;
  weakAreas: string[];
  strongAreas: string[];
  confidenceScore: number | null;
  confidenceEvidenceState: MentorEvidenceState;
  disciplineScore: number | null;
  disciplineEvidenceState: MentorEvidenceState;
  learningStyle: string | null;
  learningStyleEvidenceState: MentorEvidenceState;
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

type UseMentorInsightsOptions = {
  enabled?: boolean;
};
// ── Fetch ──────────────────────────────────────────────────────────────────────

async function doFetch(signal: AbortSignal): Promise<MentorInsightsData | null> {
  const res = await fetch("/api/mentor-insights", { signal, cache: "no-store" });
  if (!res.ok) return null; // 401 unauthenticated, 429 rate-limited, etc.
  const json = (await res.json()) as {
    ok?: boolean;
    profile?: MentorInsightsProfile | null;
    insights?: MentorInsightItem[];
    storage?: string;
  };
  if (!json.ok || json.storage === "unavailable") return null;
  return {
    profile: json.profile ?? null,
    insights: Array.isArray(json.insights) ? json.insights : [],
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Private snapshots belong to this mounted consumer only. Every mount and retry
 * rechecks the server; unavailable responses never retain a previous profile.
 */
export function useMentorInsights(
  options: UseMentorInsightsOptions = {},
): UseMentorInsightsReturn {
  const enabled = options.enabled ?? true;
  const [retryKey, setRetryKey] = useState(0);
  const [previousEnabled, setPreviousEnabled] = useState(enabled);
  const [snapshot, setSnapshot] = useState<{
    key: number;
    data: MentorInsightsData | null;
    error: string | null;
  } | null>(null);

  // Reset before rendering a newly enabled consumer, rather than serving its
  // previous authorization snapshot while the fresh request is pending.
  if (previousEnabled !== enabled) {
    setPreviousEnabled(enabled);
    setSnapshot(null);
  }

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    doFetch(ctrl.signal)
      .then((data) => {
        if (!ctrl.signal.aborted) {
          setSnapshot({ key: retryKey, data, error: data ? null : "unavailable" });
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          setSnapshot({ key: retryKey, data: null, error: "unavailable" });
        }
      });
    return () => ctrl.abort();
  }, [retryKey, enabled]);

  const retry = useCallback(() => setRetryKey((key) => key + 1), []);
  const current = enabled && snapshot?.key === retryKey ? snapshot : null;
  return {
    data: current?.data ?? null,
    loading: enabled && current === null,
    error: current?.error ?? null,
    retry,
  };
}
