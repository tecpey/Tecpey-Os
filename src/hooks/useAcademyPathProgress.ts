"use client";

import { useCallback, useEffect, useState } from "react";
import type { AcademyLocale } from "@/lib/academy-lesson-progress";

export type OfficialTermProgress = {
  term_number?: number;
  score?: number;
  percent?: number;
  status?: string;
  passed_at?: string | null;
  updated_at?: string;
};

export type OfficialAcademyProjection = {
  xp?: number;
  streak?: number;
  termStatus?: Record<number | string, "unlocked" | "in_progress" | "passed">;
  moduleScores?: Record<string, number>;
  earnedBadges?: string[];
};

export type AcademyPathProgressItem = {
  progress: number;
  xp: number;
  completed: boolean;
  answered: number;
  locked: boolean;
};

export type AcademyPathProgress = Record<string, AcademyPathProgressItem>;

function clampPercent(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function buildAcademyPathProgress(
  officialTerms: OfficialTermProgress[],
  projection: OfficialAcademyProjection = {},
): AcademyPathProgress {
  const progress: AcademyPathProgress = {};
  const termStatus = projection.termStatus ?? {};
  const moduleScores = projection.moduleScores ?? {};

  for (let termNumber = 1; termNumber <= 7; termNumber += 1) {
    const termSlug = `term-${termNumber}`;
    const official = officialTerms.find((item) => Number(item.term_number) === termNumber);
    const projectionStatus = termStatus[termNumber] ?? termStatus[String(termNumber)];
    const previousPassed = termNumber === 1
      || termStatus[termNumber - 1] === "passed"
      || termStatus[String(termNumber - 1)] === "passed"
      || officialTerms.some(
        (item) => Number(item.term_number) === termNumber - 1 && item.status === "passed",
      );
    const completed = projectionStatus === "passed" || official?.status === "passed";
    const officialPercent = clampPercent(
      moduleScores[termSlug] ?? official?.percent,
    );

    progress[termSlug] = {
      progress: previousPassed ? (completed ? 100 : Math.min(99, officialPercent)) : 0,
      // Per-term XP is intentionally not reconstructed in the browser. Total XP
      // is returned separately from the server projection.
      xp: 0,
      completed,
      answered: previousPassed ? Math.max(0, Number(official?.score ?? 0)) : 0,
      locked: !previousPassed,
    };
  }

  return progress;
}

export function useAcademyPathProgress(locale: AcademyLocale) {
  const [termProgress, setTermProgress] = useState<AcademyPathProgress>({});
  const [totalXp, setTotalXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [earnedBadges, setEarnedBadges] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoaded(false);
    try {
      const [officialResponse, stateResponse] = await Promise.all([
        fetch(`/api/academy-term-progress?locale=${locale}`, {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        fetch(`/api/academy-state?locale=${locale}`, {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
      ]);

      if (officialResponse.status === 401 || stateResponse.status === 401) {
        setTermProgress(buildAcademyPathProgress([], {}));
        setTotalXp(0);
        setStreak(0);
        setEarnedBadges([]);
        setError(null);
        return;
      }

      const [officialBody, stateBody] = await Promise.all([
        officialResponse.json().catch(() => ({})),
        stateResponse.json().catch(() => ({})),
      ]) as [
        { terms?: OfficialTermProgress[]; error?: string },
        { state?: OfficialAcademyProjection; error?: string },
      ];

      if (!officialResponse.ok) {
        throw new Error(
          officialBody.error ?? `official_progress_load_failed:${officialResponse.status}`,
        );
      }
      if (!stateResponse.ok) {
        throw new Error(
          stateBody.error ?? `academy_projection_load_failed:${stateResponse.status}`,
        );
      }

      const projection = stateBody.state ?? {};
      setTermProgress(
        buildAcademyPathProgress(
          Array.isArray(officialBody.terms) ? officialBody.terms : [],
          projection,
        ),
      );
      setTotalXp(Math.max(0, Math.round(Number(projection.xp) || 0)));
      setStreak(Math.max(0, Math.round(Number(projection.streak) || 0)));
      setEarnedBadges(
        Array.isArray(projection.earnedBadges)
          ? projection.earnedBadges.filter((item): item is string => typeof item === "string")
          : [],
      );
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoaded(true);
    }
  }, [locale]);

  useEffect(() => {
    let active = true;
    const safeRefresh = async () => {
      if (!active) return;
      await refresh();
    };

    void safeRefresh();
    const onProgress = () => void safeRefresh();
    window.addEventListener("tecpey-academy-progress-updated", onProgress);
    window.addEventListener("focus", onProgress);
    return () => {
      active = false;
      window.removeEventListener("tecpey-academy-progress-updated", onProgress);
      window.removeEventListener("focus", onProgress);
    };
  }, [refresh]);

  return {
    termProgress,
    totalXp,
    streak,
    earnedBadges,
    loaded,
    error,
    refresh,
  };
}
