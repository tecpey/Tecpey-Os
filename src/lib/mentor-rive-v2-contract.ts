export const MENTOR_RIVE_CONTRACT_VERSION = "tecpey-mentor-rive-viewmodel.v2" as const;

export const MENTOR_RIVE_SEMANTIC_STATES = [
  "idle_attentive",
  "greet",
  "listen",
  "think",
  "explain",
  "invite_next_step",
  "celebrate_effort",
  "encourage_retry",
  "pause_reflect",
  "risk_caution",
  "privacy_notice",
  "data_unavailable",
  "error_recover",
  "research_prepare",
  "research_active",
  "research_source_check",
  "arena_invite",
  "arena_observe",
  "arena_coach",
  "arena_reflect",
  "lesson_focus",
  "quiz_think",
  "quiz_feedback",
  "achievement_acknowledge",
  "session_complete",
] as const;

export type MentorRiveSemanticState =
  (typeof MENTOR_RIVE_SEMANTIC_STATES)[number];

export const MENTOR_RIVE_MOODS = [
  "neutral",
  "warm",
  "focused",
  "encouraging",
  "cautious",
] as const;
export type MentorRiveMood = (typeof MENTOR_RIVE_MOODS)[number];

export const MENTOR_RIVE_RISK_LEVELS = [
  "unknown",
  "low",
  "guarded",
  "high",
] as const;
export type MentorRiveRiskLevel = (typeof MENTOR_RIVE_RISK_LEVELS)[number];

export const MENTOR_RIVE_LOCALES = ["fa", "en"] as const;
export type MentorRiveLocale = (typeof MENTOR_RIVE_LOCALES)[number];

export type MentorRiveViewModelV2 = Readonly<{
  contractVersion: typeof MENTOR_RIVE_CONTRACT_VERSION;
  userName: string;
  streakDays: number;
  mood: MentorRiveMood;
  riskLevel: MentorRiveRiskLevel;
  roomLevel: number;
  locale: MentorRiveLocale;
  reducedMotion: boolean;
  state: MentorRiveSemanticState;
}>;

export type MentorRiveHostEvidence = Readonly<{
  state: MentorRiveSemanticState;
  locale: MentorRiveLocale;
  reducedMotion: boolean;
  userName?: string | null;
  streakDays?: number | null;
  roomLevel?: number | null;
  riskLevel?: MentorRiveRiskLevel | null;
  mood?: MentorRiveMood | null;
}>;

const MAX_USER_NAME_CODE_POINTS = 64;
const MAX_STREAK_DAYS = 3650;
const MAX_ROOM_LEVEL = 100;

function clampInteger(value: number | null | undefined, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value as number)));
}

function sanitizeUserName(value: string | null | undefined) {
  if (!value) return "";
  return Array.from(value.trim()).slice(0, MAX_USER_NAME_CODE_POINTS).join("");
}

/**
 * The host is the only authority allowed to construct the Rive view model.
 * The asset receives presentation-safe values only; it never receives mastery,
 * entitlement, balances, identity documents, raw prompts, private history or
 * other product authority that it could accidentally reinterpret.
 */
export function toMentorRiveViewModelV2(
  evidence: MentorRiveHostEvidence,
): MentorRiveViewModelV2 {
  return {
    contractVersion: MENTOR_RIVE_CONTRACT_VERSION,
    userName: sanitizeUserName(evidence.userName),
    streakDays: clampInteger(evidence.streakDays, 0, MAX_STREAK_DAYS),
    mood: evidence.mood ?? "neutral",
    riskLevel: evidence.riskLevel ?? "unknown",
    roomLevel: clampInteger(evidence.roomLevel, 0, MAX_ROOM_LEVEL),
    locale: evidence.locale,
    reducedMotion: evidence.reducedMotion,
    state: evidence.state,
  };
}

export const MENTOR_RIVE_REDUCED_MOTION_STATIC_STATES: Readonly<
  Record<MentorRiveSemanticState, MentorRiveSemanticState>
> = Object.freeze(
  Object.fromEntries(
    MENTOR_RIVE_SEMANTIC_STATES.map((state) => [state, state]),
  ) as Record<MentorRiveSemanticState, MentorRiveSemanticState>,
);

export function mentorRiveStateForMotionPreference(
  state: MentorRiveSemanticState,
  reducedMotion: boolean,
) {
  return reducedMotion ? MENTOR_RIVE_REDUCED_MOTION_STATIC_STATES[state] : state;
}
