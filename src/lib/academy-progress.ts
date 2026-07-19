/**
 * Academy progress projection client.
 *
 * PostgreSQL and server-verified learning events are the only authority. The
 * browser keeps an ephemeral projection for rendering; it cannot issue XP,
 * badges, lesson completions, module scores or term passes.
 */

export type LessonCompletion = {
  lessonId: string;
  completedAt: number;
  score: number;
  xpEarned: number;
};

export type AcademyProgressState = {
  version: 2;
  xp: number;
  level: number;
  streak: number;
  lastStudyDate: string | null;
  completedLessons: Record<string, LessonCompletion>;
  moduleScores: Record<string, number>;
  termStatus: Record<number, "unlocked" | "in_progress" | "passed">;
  earnedBadges: string[];
  masteryScores: Record<string, number>;
};

export const PROGRESS_UPDATED_EVENT = "tecpey-academy-progress-updated";
export const PROGRESS_SYNC_ERROR_EVENT = "tecpey-academy-progress-sync-error";

const LEVEL_THRESHOLDS = [0, 200, 700, 1500, 2700, 4500, 7000, 10500, 15000, 21000, 29000, 39000];
const memoryByLocale = new Map<"fa" | "en", AcademyProgressState>();
const hydrationByLocale = new Map<"fa" | "en", Promise<AcademyProgressState>>();

function computeLevel(xp: number): number {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return Math.min(level, 12);
}

export function xpForNextLevel(currentXp: number): { current: number; needed: number; level: number } {
  const level = computeLevel(currentXp);
  const currentThreshold = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const nextThreshold = LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  return { current: currentXp - currentThreshold, needed: nextThreshold - currentThreshold, level };
}

export function createDefaultAcademyProgressState(): AcademyProgressState {
  return {
    version: 2,
    xp: 0,
    level: 1,
    streak: 0,
    lastStudyDate: null,
    completedLessons: {},
    moduleScores: {},
    termStatus: { 1: "unlocked" },
    earnedBadges: [],
    masteryScores: {},
  };
}

export function normalizeAcademyProgressState(value: unknown): AcademyProgressState {
  if (!value || typeof value !== "object") return createDefaultAcademyProgressState();
  const raw = value as Partial<AcademyProgressState>;
  const xp = Number.isFinite(raw.xp) ? Math.max(0, Math.round(raw.xp as number)) : 0;
  return {
    ...createDefaultAcademyProgressState(),
    ...raw,
    version: 2,
    xp,
    level: computeLevel(xp),
    streak: Number.isFinite(raw.streak) ? Math.max(0, Math.round(raw.streak as number)) : 0,
    lastStudyDate: typeof raw.lastStudyDate === "string" ? raw.lastStudyDate : null,
    completedLessons: raw.completedLessons && typeof raw.completedLessons === "object" ? raw.completedLessons : {},
    moduleScores: raw.moduleScores && typeof raw.moduleScores === "object" ? raw.moduleScores : {},
    termStatus: raw.termStatus && typeof raw.termStatus === "object" ? raw.termStatus : { 1: "unlocked" },
    earnedBadges: Array.isArray(raw.earnedBadges)
      ? [...new Set(raw.earnedBadges.filter((item): item is string => typeof item === "string" && item.length > 0))]
      : [],
    masteryScores: raw.masteryScores && typeof raw.masteryScores === "object" ? raw.masteryScores : {},
  };
}

export const XP_TABLE = {
  LESSON_COMPLETE: 30,
  LESSON_PERFECT_BONUS: 50,
  LESSON_SECTION_COMPLETE: 10,
  LESSON_ANSWERED: 5,
  MODULE_QUIZ_PASS: 50,
  MODULE_QUIZ_PERFECT_BONUS: 30,
  FLASHCARD_SESSION: 10,
  AI_MENTOR_SESSION: 15,
  STREAK_MAINTAIN: 15,
  STREAK_BONUS_30: 200,
  STREAK_BONUS_100: 500,
  TERM_PASS: 500,
} as const;

function localeFromBrowser(): "fa" | "en" {
  if (typeof window === "undefined") return "fa";
  return window.location.pathname.startsWith("/en/") ? "en" : "fa";
}

function dispatchUpdate(locale: "fa" | "en", source: "server"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROGRESS_UPDATED_EVENT, { detail: { locale, source } }));
}

function dispatchSyncError(locale: "fa" | "en", error: unknown): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROGRESS_SYNC_ERROR_EVENT, {
    detail: { locale, message: error instanceof Error ? error.message : String(error) },
  }));
}

export function loadProgress(locale = localeFromBrowser()): AcademyProgressState {
  return memoryByLocale.get(locale) ?? createDefaultAcademyProgressState();
}

export function acceptProgressProjection(
  value: unknown,
  locale = localeFromBrowser(),
): AcademyProgressState {
  const state = normalizeAcademyProgressState(value);
  memoryByLocale.set(locale, state);
  hydrationByLocale.delete(locale);
  dispatchUpdate(locale, "server");
  return state;
}

export async function hydrateProgress(
  locale = localeFromBrowser(),
  options: { force?: boolean } = {},
): Promise<AcademyProgressState> {
  if (options.force) hydrationByLocale.delete(locale);
  const existing = hydrationByLocale.get(locale);
  if (existing) return existing;

  const request = (async () => {
    const response = await fetch(`/api/academy-state?locale=${locale}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      if (response.status === 401) return loadProgress(locale);
      throw new Error(`academy_state_load_failed:${response.status}`);
    }
    const body = await response.json() as { state?: unknown };
    return acceptProgressProjection(body.state, locale);
  })().catch((error) => {
    hydrationByLocale.delete(locale);
    dispatchSyncError(locale, error);
    return loadProgress(locale);
  });

  hydrationByLocale.set(locale, request);
  return request;
}

export function refreshProgress(locale = localeFromBrowser()): Promise<AcademyProgressState> {
  return hydrateProgress(locale, { force: true });
}

export function isLessonUnlocked(lessonId: string, minScore = 0): boolean {
  const completion = loadProgress().completedLessons[lessonId];
  return completion !== undefined && completion.score >= minScore;
}

export function getLessonData(lessonId: string): LessonCompletion | null {
  return loadProgress().completedLessons[lessonId] ?? null;
}

export function onProgressChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(PROGRESS_UPDATED_EVENT, handler);
  return () => window.removeEventListener(PROGRESS_UPDATED_EVENT, handler);
}
