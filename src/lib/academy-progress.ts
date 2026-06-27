/**
 * Academy Progress Engine
 *
 * Single source of truth for client-side academy state:
 * XP, streak, lesson completion, mastery scores, achievements.
 *
 * Persists to localStorage. Dispatches custom DOM events so any
 * mounted component can reactively observe progress changes.
 */

export type LessonCompletion = {
  lessonId: string;
  completedAt: number;
  score: number;       // 0–100 quiz score for this lesson
  xpEarned: number;
};

export type AcademyProgressState = {
  version: 2;
  xp: number;
  level: number;
  streak: number;
  lastStudyDate: string | null;  // ISO date string "YYYY-MM-DD"
  completedLessons: Record<string, LessonCompletion>;
  moduleScores: Record<string, number>;   // moduleId → best score
  termStatus: Record<number, "unlocked" | "in_progress" | "passed">;
  earnedBadges: string[];
  masteryScores: Record<string, number>;  // conceptId → 0–100
};

const STORAGE_KEY = "tecpey-academy-progress-v2";
const PROGRESS_UPDATED_EVENT = "tecpey-academy-progress-updated";

// XP thresholds per level (cumulative)
const LEVEL_THRESHOLDS = [0, 200, 700, 1500, 2700, 4500, 7000, 10500, 15000, 21000, 29000, 39000];

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

function defaultState(): AcademyProgressState {
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dispatchUpdate(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROGRESS_UPDATED_EVENT));
  }
}

export function loadProgress(): AcademyProgressState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<AcademyProgressState>;
    // Migrate old versions
    if (parsed.version !== 2) return defaultState();
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

function saveProgress(state: AcademyProgressState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded
  }
  dispatchUpdate();
}

/** Update streak based on last study date and today. */
function updateStreak(state: AcademyProgressState): AcademyProgressState {
  const today = todayIso();
  if (state.lastStudyDate === today) return state;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);

  const newStreak = state.lastStudyDate === yesterdayIso ? state.streak + 1 : 1;
  return { ...state, streak: newStreak, lastStudyDate: today };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const XP_TABLE = {
  LESSON_COMPLETE: 30,
  LESSON_PERFECT: 80,       // 100% on lesson quiz
  MODULE_QUIZ_PASS: 50,
  MODULE_QUIZ_PERFECT: 80,
  FLASHCARD_SESSION: 10,    // per day
  AI_MENTOR_SESSION: 15,    // per day
  STREAK_MAINTAIN: 15,      // per day
  STREAK_BONUS_30: 200,     // milestone
  STREAK_BONUS_100: 500,
} as const;

/** Award XP and update streak. Returns new state. */
export function awardXp(amount: number): AcademyProgressState {
  let state = loadProgress();
  state = updateStreak(state);
  state = { ...state, xp: state.xp + amount, level: computeLevel(state.xp + amount) };
  saveProgress(state);
  return state;
}

/** Record a completed lesson with quiz score. */
export function recordLessonComplete(
  lessonId: string,
  score: number,
  termNumber: number,
): AcademyProgressState {
  let state = loadProgress();
  state = updateStreak(state);

  const existing = state.completedLessons[lessonId];
  const xpEarned = score === 100 ? XP_TABLE.LESSON_PERFECT : XP_TABLE.LESSON_COMPLETE;
  const bestScore = Math.max(existing?.score ?? 0, score);

  state = {
    ...state,
    completedLessons: {
      ...state.completedLessons,
      [lessonId]: {
        lessonId,
        completedAt: Date.now(),
        score: bestScore,
        xpEarned,
      },
    },
  };

  // Only award XP if this is the first completion or score improved
  if (!existing || score > existing.score) {
    state = { ...state, xp: state.xp + xpEarned, level: computeLevel(state.xp + xpEarned) };
  }

  // Update term status
  const currentTermStatus = state.termStatus[termNumber];
  if (!currentTermStatus || currentTermStatus === "unlocked") {
    state = {
      ...state,
      termStatus: { ...state.termStatus, [termNumber]: "in_progress" },
    };
  }

  saveProgress(state);
  return state;
}

/** Record module quiz score. Unlocks next term if all modules in current term pass. */
export function recordModuleScore(
  moduleId: string,
  score: number,
): AcademyProgressState {
  let state = loadProgress();
  const best = Math.max(state.moduleScores[moduleId] ?? 0, score);
  const xp = score >= 90 ? XP_TABLE.MODULE_QUIZ_PERFECT : XP_TABLE.MODULE_QUIZ_PASS;
  const prevBest = state.moduleScores[moduleId] ?? 0;

  state = {
    ...state,
    moduleScores: { ...state.moduleScores, [moduleId]: best },
  };

  if (score > prevBest) {
    state = { ...state, xp: state.xp + xp, level: computeLevel(state.xp + xp) };
  }

  saveProgress(state);
  return state;
}

/** Mark a term as passed and unlock the next one. */
export function passTerm(termNumber: number): AcademyProgressState {
  let state = loadProgress();
  state = {
    ...state,
    termStatus: {
      ...state.termStatus,
      [termNumber]: "passed",
      [termNumber + 1]: state.termStatus[termNumber + 1] ?? "unlocked",
    },
    xp: state.xp + 500,
    level: computeLevel(state.xp + 500),
  };
  saveProgress(state);
  return state;
}

/** Award a badge (idempotent). */
export function awardBadge(badgeCode: string): AcademyProgressState {
  const state = loadProgress();
  if (state.earnedBadges.includes(badgeCode)) return state;
  const next = { ...state, earnedBadges: [...state.earnedBadges, badgeCode] };
  saveProgress(next);
  return next;
}

/** Check if a lesson has been completed at the given score threshold. */
export function isLessonUnlocked(lessonId: string, minScore = 0): boolean {
  const state = loadProgress();
  const c = state.completedLessons[lessonId];
  return c !== undefined && c.score >= minScore;
}

/** Get lesson completion data. */
export function getLessonData(lessonId: string): LessonCompletion | null {
  const state = loadProgress();
  return state.completedLessons[lessonId] ?? null;
}

/** Subscribe to progress changes. Returns unsubscribe function. */
export function onProgressChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(PROGRESS_UPDATED_EVENT, handler);
  return () => window.removeEventListener(PROGRESS_UPDATED_EVENT, handler);
}
