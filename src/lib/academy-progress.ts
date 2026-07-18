/**
 * Academy Progress Engine
 *
 * PostgreSQL is the authoritative source of truth. The browser keeps only an
 * ephemeral in-memory projection so existing synchronous UI components remain
 * responsive. Every mutation is sent to /api/academy-state and reconciled with
 * the state returned by the server. No Academy progress is stored in Web Storage.
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

export type AcademyProgressAction =
  | { type: "award_xp"; amount: number }
  | { type: "lesson_complete"; lessonId: string; score: number; termNumber: number; completedAt?: number }
  | { type: "module_score"; moduleId: string; score: number }
  | { type: "pass_term"; termNumber: number }
  | { type: "award_badge"; badgeCode: string };

export const PROGRESS_UPDATED_EVENT = "tecpey-academy-progress-updated";
export const PROGRESS_SYNC_ERROR_EVENT = "tecpey-academy-progress-sync-error";

const LEVEL_THRESHOLDS = [0, 200, 700, 1500, 2700, 4500, 7000, 10500, 15000, 21000, 29000, 39000];
const memoryByLocale = new Map<"fa" | "en", AcademyProgressState>();
const hydrationByLocale = new Map<"fa" | "en", Promise<AcademyProgressState>>();
const writeQueueByLocale = new Map<"fa" | "en", Promise<void>>();

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
    completedLessons: raw.completedLessons && typeof raw.completedLessons === "object" ? raw.completedLessons : {},
    moduleScores: raw.moduleScores && typeof raw.moduleScores === "object" ? raw.moduleScores : {},
    termStatus: raw.termStatus && typeof raw.termStatus === "object" ? raw.termStatus : { 1: "unlocked" },
    earnedBadges: Array.isArray(raw.earnedBadges) ? [...new Set(raw.earnedBadges.filter((item): item is string => typeof item === "string"))] : [],
    masteryScores: raw.masteryScores && typeof raw.masteryScores === "object" ? raw.masteryScores : {},
  };
}

function todayIso(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function updateStreak(state: AcademyProgressState, now = Date.now()): AcademyProgressState {
  const today = todayIso(now);
  if (state.lastStudyDate === today) return state;

  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);
  return {
    ...state,
    streak: state.lastStudyDate === yesterdayIso ? state.streak + 1 : 1,
    lastStudyDate: today,
  };
}

export const XP_TABLE = {
  LESSON_COMPLETE: 30,
  LESSON_PERFECT: 80,
  MODULE_QUIZ_PASS: 50,
  MODULE_QUIZ_PERFECT: 80,
  FLASHCARD_SESSION: 10,
  AI_MENTOR_SESSION: 15,
  STREAK_MAINTAIN: 15,
  STREAK_BONUS_30: 200,
  STREAK_BONUS_100: 500,
} as const;

export function applyAcademyProgressAction(
  current: AcademyProgressState,
  action: AcademyProgressAction,
): AcademyProgressState {
  let state = normalizeAcademyProgressState(current);

  if (action.type === "award_xp") {
    state = updateStreak(state);
    const xp = state.xp + Math.max(0, Math.round(action.amount));
    return { ...state, xp, level: computeLevel(xp) };
  }

  if (action.type === "lesson_complete") {
    const completedAt = Number.isFinite(action.completedAt) ? Number(action.completedAt) : Date.now();
    state = updateStreak(state, completedAt);
    const existing = state.completedLessons[action.lessonId];
    const xpEarned = action.score === 100 ? XP_TABLE.LESSON_PERFECT : XP_TABLE.LESSON_COMPLETE;
    const bestScore = Math.max(existing?.score ?? 0, action.score);
    let xp = state.xp;
    if (!existing || action.score > existing.score) xp += xpEarned;

    return {
      ...state,
      xp,
      level: computeLevel(xp),
      completedLessons: {
        ...state.completedLessons,
        [action.lessonId]: {
          lessonId: action.lessonId,
          completedAt,
          score: bestScore,
          xpEarned,
        },
      },
      termStatus: {
        ...state.termStatus,
        [action.termNumber]: state.termStatus[action.termNumber] === "passed" ? "passed" : "in_progress",
      },
    };
  }

  if (action.type === "module_score") {
    const previous = state.moduleScores[action.moduleId] ?? 0;
    const best = Math.max(previous, action.score);
    const reward = action.score >= 90 ? XP_TABLE.MODULE_QUIZ_PERFECT : XP_TABLE.MODULE_QUIZ_PASS;
    const xp = action.score > previous ? state.xp + reward : state.xp;
    return {
      ...state,
      xp,
      level: computeLevel(xp),
      moduleScores: { ...state.moduleScores, [action.moduleId]: best },
    };
  }

  if (action.type === "pass_term") {
    if (state.termStatus[action.termNumber] === "passed") return state;
    const xp = state.xp + 500;
    return {
      ...state,
      xp,
      level: computeLevel(xp),
      termStatus: {
        ...state.termStatus,
        [action.termNumber]: "passed",
        [action.termNumber + 1]: state.termStatus[action.termNumber + 1] ?? "unlocked",
      },
    };
  }

  if (state.earnedBadges.includes(action.badgeCode)) return state;
  return { ...state, earnedBadges: [...state.earnedBadges, action.badgeCode] };
}

function localeFromBrowser(): "fa" | "en" {
  if (typeof window === "undefined") return "fa";
  return window.location.pathname.startsWith("/en/") ? "en" : "fa";
}

function dispatchUpdate(locale: "fa" | "en", source: "server" | "optimistic"): void {
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

export async function hydrateProgress(locale = localeFromBrowser()): Promise<AcademyProgressState> {
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
    const state = normalizeAcademyProgressState(body.state);
    memoryByLocale.set(locale, state);
    dispatchUpdate(locale, "server");
    return state;
  })().catch((error) => {
    hydrationByLocale.delete(locale);
    dispatchSyncError(locale, error);
    return loadProgress(locale);
  });

  hydrationByLocale.set(locale, request);
  return request;
}

function enqueueServerAction(action: AcademyProgressAction, locale: "fa" | "en"): void {
  const previous = writeQueueByLocale.get(locale) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const response = await fetch("/api/academy-state", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ locale, action }),
      });
      if (!response.ok) throw new Error(`academy_state_write_failed:${response.status}`);
      const body = await response.json() as { state?: unknown };
      const authoritative = normalizeAcademyProgressState(body.state);
      memoryByLocale.set(locale, authoritative);
      dispatchUpdate(locale, "server");
    })
    .catch((error) => {
      dispatchSyncError(locale, error);
      hydrationByLocale.delete(locale);
    });

  writeQueueByLocale.set(locale, next);
}

function applyAndPersist(action: AcademyProgressAction, locale = localeFromBrowser()): AcademyProgressState {
  const next = applyAcademyProgressAction(loadProgress(locale), action);
  memoryByLocale.set(locale, next);
  dispatchUpdate(locale, "optimistic");
  enqueueServerAction(action, locale);
  return next;
}

export function awardXp(amount: number): AcademyProgressState {
  return applyAndPersist({ type: "award_xp", amount });
}

export function recordLessonComplete(lessonId: string, score: number, termNumber: number): AcademyProgressState {
  return applyAndPersist({ type: "lesson_complete", lessonId, score, termNumber, completedAt: Date.now() });
}

export function recordModuleScore(moduleId: string, score: number): AcademyProgressState {
  return applyAndPersist({ type: "module_score", moduleId, score });
}

export function passTerm(termNumber: number): AcademyProgressState {
  return applyAndPersist({ type: "pass_term", termNumber });
}

export function awardBadge(badgeCode: string): AcademyProgressState {
  return applyAndPersist({ type: "award_badge", badgeCode });
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
