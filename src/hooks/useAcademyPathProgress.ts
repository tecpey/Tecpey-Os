"use client";

import { useCallback, useEffect, useState } from "react";
import type { AcademyLocale, TermLearningSummary } from "@/lib/academy-lesson-progress";

export type OfficialTermProgress = {
  term_number?: number;
  score?: number;
  percent?: number;
  status?: string;
  passed_at?: string | null;
  updated_at?: string;
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
  learningTerms: TermLearningSummary[],
): AcademyPathProgress {
  const progress: AcademyPathProgress = {};

  for (let termNumber = 1; termNumber <= 7; termNumber += 1) {
    const termSlug = `term-${termNumber}`;
    const official = officialTerms.find((item) => Number(item.term_number) === termNumber);
    const learning = learningTerms.find((item) => item.termNumber === termNumber || item.termSlug === termSlug);
    const previousPassed = termNumber === 1 || officialTerms.some(
      (item) => Number(item.term_number) === termNumber - 1 && item.status === "passed",
    );
    const completed = official?.status === "passed";
    const officialPercent = clampPercent(official?.percent);
    const learningPercent = clampPercent(learning?.percent);
    const visibleProgress = previousPassed
      ? (completed ? 100 : Math.max(officialPercent, Math.min(99, learningPercent)))
      : 0;

    progress[termSlug] = {
      progress: visibleProgress,
      xp: previousPassed ? Math.max(0, Number(learning?.xp ?? 0)) + officialPercent : 0,
      completed,
      answered: Math.max(0, Number(official?.score ?? learning?.answeredSections ?? 0)),
      locked: !previousPassed,
    };
  }

  return progress;
}

export function useAcademyPathProgress(locale: AcademyLocale) {
  const [termProgress, setTermProgress] = useState<AcademyPathProgress>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [officialResponse, lessonResponse] = await Promise.all([
        fetch(`/api/academy-term-progress?locale=${locale}`, {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        fetch(`/api/academy-lesson-progress?locale=${locale}`, {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
      ]);

      const [officialBody, lessonBody] = await Promise.all([
        officialResponse.json().catch(() => ({})),
        lessonResponse.json().catch(() => ({})),
      ]) as [
        { terms?: OfficialTermProgress[]; error?: string },
        { terms?: TermLearningSummary[]; error?: string },
      ];

      if (!officialResponse.ok) {
        throw new Error(officialBody.error ?? `official_progress_load_failed:${officialResponse.status}`);
      }
      if (!lessonResponse.ok && lessonResponse.status !== 401) {
        throw new Error(lessonBody.error ?? `lesson_progress_load_failed:${lessonResponse.status}`);
      }

      setTermProgress(buildAcademyPathProgress(
        Array.isArray(officialBody.terms) ? officialBody.terms : [],
        Array.isArray(lessonBody.terms) ? lessonBody.terms : [],
      ));
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

  return { termProgress, loaded, error, refresh };
}
