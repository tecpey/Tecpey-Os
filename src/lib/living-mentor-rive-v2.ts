import {
  LIVING_MENTOR_ACTS,
  type LivingMentorAct,
} from "@/lib/living-mentor-presentation";

export const LIVING_MENTOR_RIVE_V2_CONTRACT_VERSION = "2.0.0" as const;

/**
 * Product-semantic states owned by the host. They intentionally describe
 * meaning, not animation clips, so the renderer can evolve independently.
 */
export const LIVING_MENTOR_RIVE_V2_STATES = [
  "idle",
  "greeting",
  "listening",
  "thinking",
  "explaining",
  "next_step",
  "learning_focus",
  "quiz_ready",
  "review_due",
  "flashcards_due",
  "lesson_complete",
  "effort_acknowledged",
  "milestone_celebration",
  "retry_encouragement",
  "reflection_pause",
  "research_ready",
  "researching",
  "source_checking",
  "research_unavailable",
  "arena_ready",
  "arena_coaching",
  "arena_reflection",
  "arena_cooldown",
  "risk_caution",
  "privacy_notice",
  "consent_required",
  "data_stale",
  "data_unavailable",
  "runtime_error",
] as const;

export type LivingMentorRiveV2State =
  (typeof LIVING_MENTOR_RIVE_V2_STATES)[number];

export const LIVING_MENTOR_RIVE_V2_EVENTS = [
  "session_started",
  "user_composing",
  "request_started",
  "response_streaming",
  "response_completed",
  "learning_focus_requested",
  "quiz_ready",
  "review_due",
  "flashcards_due",
  "lesson_completed",
  "effort_milestone",
  "milestone_completed",
  "retry_needed",
  "reflection_due",
  "research_available",
  "research_started",
  "sources_checking",
  "research_failed",
  "arena_available",
  "arena_coaching_started",
  "arena_reflection_due",
  "arena_cooldown_started",
  "risk_review_required",
  "privacy_boundary_reached",
  "consent_required",
  "data_became_stale",
  "data_unavailable",
  "runtime_failed",
  "reset",
] as const;

export type LivingMentorRiveV2Event =
  (typeof LIVING_MENTOR_RIVE_V2_EVENTS)[number];

export type LivingMentorRiveV2SafetyOverride =
  | "none"
  | "risk_caution"
  | "privacy_notice"
  | "consent_required"
  | "data_stale"
  | "data_unavailable"
  | "runtime_error";

export const LIVING_MENTOR_RIVE_V2_MOODS = [
  "unknown",
  "ready",
  "curious",
  "frustrated",
  "anxious",
  "energized",
] as const;
export type LivingMentorRiveV2Mood =
  (typeof LIVING_MENTOR_RIVE_V2_MOODS)[number];

export const LIVING_MENTOR_RIVE_V2_RISK_LEVELS = [
  "unknown",
  "low",
  "moderate",
  "high",
] as const;
export type LivingMentorRiveV2RiskLevel =
  (typeof LIVING_MENTOR_RIVE_V2_RISK_LEVELS)[number];

export type LivingMentorRiveV2Direction = "rtl" | "ltr";

const SAFETY_OVERRIDES = [
  "none",
  "risk_caution",
  "privacy_notice",
  "consent_required",
  "data_stale",
  "data_unavailable",
  "runtime_error",
] as const satisfies readonly LivingMentorRiveV2SafetyOverride[];

const EVENT_STATE: Readonly<
  Record<LivingMentorRiveV2Event, LivingMentorRiveV2State>
> = Object.freeze({
  session_started: "greeting",
  user_composing: "listening",
  request_started: "thinking",
  response_streaming: "explaining",
  response_completed: "next_step",
  learning_focus_requested: "learning_focus",
  quiz_ready: "quiz_ready",
  review_due: "review_due",
  flashcards_due: "flashcards_due",
  lesson_completed: "lesson_complete",
  effort_milestone: "effort_acknowledged",
  milestone_completed: "milestone_celebration",
  retry_needed: "retry_encouragement",
  reflection_due: "reflection_pause",
  research_available: "research_ready",
  research_started: "researching",
  sources_checking: "source_checking",
  research_failed: "research_unavailable",
  arena_available: "arena_ready",
  arena_coaching_started: "arena_coaching",
  arena_reflection_due: "arena_reflection",
  arena_cooldown_started: "arena_cooldown",
  risk_review_required: "risk_caution",
  privacy_boundary_reached: "privacy_notice",
  consent_required: "consent_required",
  data_became_stale: "data_stale",
  data_unavailable: "data_unavailable",
  runtime_failed: "runtime_error",
  reset: "idle",
});

const V2_STATE_TO_V1_ACT: Readonly<
  Record<LivingMentorRiveV2State, LivingMentorAct>
> = Object.freeze({
  idle: "idle_attentive",
  greeting: "greet",
  listening: "listen",
  thinking: "think",
  explaining: "explain",
  next_step: "invite_next_step",
  learning_focus: "listen",
  quiz_ready: "invite_next_step",
  review_due: "pause_reflect",
  flashcards_due: "pause_reflect",
  lesson_complete: "celebrate_effort",
  effort_acknowledged: "celebrate_effort",
  milestone_celebration: "celebrate_effort",
  retry_encouragement: "encourage_retry",
  reflection_pause: "pause_reflect",
  research_ready: "invite_next_step",
  researching: "think",
  source_checking: "think",
  research_unavailable: "data_unavailable",
  arena_ready: "invite_next_step",
  arena_coaching: "explain",
  arena_reflection: "pause_reflect",
  arena_cooldown: "pause_reflect",
  risk_caution: "risk_caution",
  privacy_notice: "privacy_notice",
  consent_required: "privacy_notice",
  data_stale: "data_unavailable",
  data_unavailable: "data_unavailable",
  runtime_error: "error_recover",
});

export type LivingMentorRiveV2HostInput = Readonly<{
  state: LivingMentorRiveV2State;
  safetyOverride?: LivingMentorRiveV2SafetyOverride;
  userName?: string | null;
  allowsUserName?: boolean;
  streakDays?: number | null;
  mood?: LivingMentorRiveV2Mood | null;
  riskLevel?: LivingMentorRiveV2RiskLevel | null;
  roomLevel?: number | null;
  locale?: string | null;
  direction?: LivingMentorRiveV2Direction | null;
  reducedMotion?: boolean;
  highContrast?: boolean;
  motionIntensity?: number | null;
}>;

export type LivingMentorRiveV2ViewModel = Readonly<{
  contractVersion: typeof LIVING_MENTOR_RIVE_V2_CONTRACT_VERSION;
  state: LivingMentorRiveV2State;
  userName: string;
  userNameVisible: boolean;
  streakDays: number;
  streakKnown: boolean;
  mood: LivingMentorRiveV2Mood;
  riskLevel: LivingMentorRiveV2RiskLevel;
  roomLevel: number;
  roomKnown: boolean;
  locale: string;
  direction: LivingMentorRiveV2Direction;
  reducedMotion: boolean;
  highContrast: boolean;
  motionIntensity: number;
}>;

const SAFETY_STATES = new Set<LivingMentorRiveV2State>([
  "risk_caution",
  "privacy_notice",
  "consent_required",
  "data_stale",
  "data_unavailable",
  "runtime_error",
]);

const RTL_LANGUAGES = new Set([
  "ar",
  "ckb",
  "dv",
  "fa",
  "he",
  "ku",
  "ps",
  "sd",
  "ug",
  "ur",
  "yi",
]);

const BIDI_CONTROL_PATTERN = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const BASIC_CONTROL_PATTERN = /[\u0000-\u001F\u007F]/g;

function isAllowedString<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return typeof value === "string" && allowed.includes(value as T[number]);
}

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function boundedNumber(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeLocale(locale: unknown): string {
  if (typeof locale !== "string") return "fa";
  const normalized = locale.trim();
  return normalized.length <= 35 &&
    /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(normalized)
    ? normalized
    : "fa";
}

function normalizeDirection(
  direction: unknown,
  locale: string,
): LivingMentorRiveV2Direction {
  if (direction === "rtl" || direction === "ltr") return direction;
  const language = locale.split("-")[0]?.toLowerCase() ?? "fa";
  return RTL_LANGUAGES.has(language) ? "rtl" : "ltr";
}

function safeUserName(userName: unknown): string {
  if (typeof userName !== "string") return "";
  const sanitized = userName
    .replace(BASIC_CONTROL_PATTERN, "")
    .replace(BIDI_CONTROL_PATTERN, "")
    .trim();
  return [...sanitized].slice(0, 48).join("");
}

function normalizeState(value: unknown): LivingMentorRiveV2State {
  return isAllowedString(value, LIVING_MENTOR_RIVE_V2_STATES)
    ? value
    : "runtime_error";
}

function normalizeSafetyOverride(value: unknown): LivingMentorRiveV2SafetyOverride {
  return isAllowedString(value, SAFETY_OVERRIDES) ? value : "runtime_error";
}

export function reduceLivingMentorRiveV2State(
  _previous: LivingMentorRiveV2State,
  event: LivingMentorRiveV2Event,
): LivingMentorRiveV2State {
  return EVENT_STATE[event] ?? "runtime_error";
}

export function livingMentorV2StateToV1Act(
  state: LivingMentorRiveV2State,
): LivingMentorAct {
  return V2_STATE_TO_V1_ACT[state] ?? "error_recover";
}

export function applyLivingMentorV2SafetyOverride(
  requestedState: LivingMentorRiveV2State,
  override: LivingMentorRiveV2SafetyOverride = "none",
): LivingMentorRiveV2State {
  const safeRequestedState = normalizeState(requestedState);
  const safeOverride = normalizeSafetyOverride(override);
  return safeOverride === "none" ? safeRequestedState : safeOverride;
}

/**
 * Produces the deliberately small data-binding model allowed to cross into a
 * future Rive v2 asset. Authority/provenance, identifiers, raw learning data,
 * financial values, prompts, credentials and consent records remain host-side.
 */
export function projectLivingMentorRiveV2ViewModel(
  input: LivingMentorRiveV2HostInput,
): LivingMentorRiveV2ViewModel {
  const state = applyLivingMentorV2SafetyOverride(
    normalizeState(input.state),
    normalizeSafetyOverride(input.safetyOverride ?? "none"),
  );
  const reducedMotion = Boolean(input.reducedMotion);
  const streak = boundedInteger(input.streakDays, 0, 3650);
  const room = boundedInteger(input.roomLevel, 0, 5);
  const userName = input.allowsUserName ? safeUserName(input.userName) : "";
  const locale = normalizeLocale(input.locale);

  return Object.freeze({
    contractVersion: LIVING_MENTOR_RIVE_V2_CONTRACT_VERSION,
    state,
    userName,
    userNameVisible: Boolean(input.allowsUserName && userName),
    streakDays: streak ?? 0,
    streakKnown: streak !== null,
    mood: isAllowedString(input.mood, LIVING_MENTOR_RIVE_V2_MOODS)
      ? input.mood
      : "unknown",
    riskLevel: isAllowedString(input.riskLevel, LIVING_MENTOR_RIVE_V2_RISK_LEVELS)
      ? input.riskLevel
      : "unknown",
    roomLevel: room ?? 0,
    roomKnown: room !== null,
    locale,
    direction: normalizeDirection(input.direction, locale),
    reducedMotion,
    highContrast: Boolean(input.highContrast),
    motionIntensity: reducedMotion
      ? 0
      : boundedNumber(input.motionIntensity, 0, 1),
  });
}

export function isLivingMentorRiveV2SafetyState(
  state: LivingMentorRiveV2State,
): boolean {
  return SAFETY_STATES.has(state);
}

/** Exact migration proof: every v2 state must downgrade to an existing v1 act. */
export function hasCompleteLivingMentorV1Compatibility(): boolean {
  return (
    LIVING_MENTOR_RIVE_V2_STATES.every((state) =>
      LIVING_MENTOR_ACTS.includes(V2_STATE_TO_V1_ACT[state]),
    ) &&
    Object.keys(V2_STATE_TO_V1_ACT).length === LIVING_MENTOR_RIVE_V2_STATES.length
  );
}
