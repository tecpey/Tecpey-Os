import {
  LIVING_MENTOR_ACTS,
  type LivingMentorAct,
} from "@/lib/living-mentor-presentation";

export const LIVING_MENTOR_RIVE_CONTRACT_MAJOR = 1;

export const LIVING_MENTOR_RIVE_BINDING_PATHS = [
  "mentor.act",
  "mentor.affect",
  "mentor.intensity",
  "mentor.priority",
  "playAct",
  "speech.state",
  "speech.viseme",
  "speech.blend",
  "speech.jawOpen",
  "speech.lipClose",
  "speech.lipPress",
  "speech.lipWide",
  "speech.lipRound",
  "speech.lipFunnel",
  "speech.lowerLipBite",
  "speech.tongueTipUp",
  "speech.tongueForward",
  "world.roomState",
  "world.roomLevel",
  "world.theme",
  "world.celebrationTier",
  "accessibility.reducedMotion",
  "accessibility.highContrast",
] as const;

export const LIVING_MENTOR_RIVE_VALUE_PATHS =
  LIVING_MENTOR_RIVE_BINDING_PATHS.filter(
    (path) => path !== "playAct",
  ) as LivingMentorRiveValuePath[];

export type LivingMentorRiveBindingPath =
  (typeof LIVING_MENTOR_RIVE_BINDING_PATHS)[number];
export type LivingMentorRiveValuePath = Exclude<
  LivingMentorRiveBindingPath,
  "playAct"
>;

const MENTOR_AFFECTS = [
  "calm",
  "attentive",
  "curious",
  "warm",
  "concerned",
  "steady",
] as const;
const SPEECH_STATES = [
  "idle",
  "queued",
  "speaking",
  "paused",
  "ended",
  "error",
] as const;
const SPEECH_VISEMES = [
  "sil",
  "bilabial",
  "labiodental",
  "interdental",
  "alveolar",
  "velar",
  "postalveolar",
  "sibilant",
  "nasal_lateral",
  "rhotic",
  "vowel_open",
  "vowel_mid_front",
  "vowel_close_front",
  "vowel_mid_back_round",
  "vowel_close_back_round",
] as const;
const ROOM_STATES = [
  "ready",
  "partial",
  "unavailable",
  "consent_required",
  "stale",
] as const;
const WORLD_THEMES = ["neutral", "academy", "arena", "profile"] as const;
const CELEBRATION_TIERS = ["none", "small", "milestone"] as const;

type MentorAffect = (typeof MENTOR_AFFECTS)[number];
type SpeechState = (typeof SPEECH_STATES)[number];
type SpeechViseme = (typeof SPEECH_VISEMES)[number];
type RoomState = (typeof ROOM_STATES)[number];
type WorldTheme = (typeof WORLD_THEMES)[number];
type CelebrationTier = (typeof CELEBRATION_TIERS)[number];
type UnknownRecord = Record<string, unknown>;

export type LivingMentorRiveBindings = Readonly<{
  "mentor.act": LivingMentorAct;
  "mentor.affect": MentorAffect;
  "mentor.intensity": number;
  "mentor.priority": number;
  "speech.state": SpeechState;
  "speech.viseme": SpeechViseme;
  "speech.blend": number;
  "speech.jawOpen": number;
  "speech.lipClose": number;
  "speech.lipPress": number;
  "speech.lipWide": number;
  "speech.lipRound": number;
  "speech.lipFunnel": number;
  "speech.lowerLipBite": number;
  "speech.tongueTipUp": number;
  "speech.tongueForward": number;
  "world.roomState": RoomState;
  "world.roomLevel": number;
  "world.theme": WorldTheme;
  "world.celebrationTier": CelebrationTier;
  "accessibility.reducedMotion": boolean;
  "accessibility.highContrast": boolean;
}>;

type SpeechBindings = Pick<
  LivingMentorRiveBindings,
  | "speech.state"
  | "speech.viseme"
  | "speech.blend"
  | "speech.jawOpen"
  | "speech.lipClose"
  | "speech.lipPress"
  | "speech.lipWide"
  | "speech.lipRound"
  | "speech.lipFunnel"
  | "speech.lowerLipBite"
  | "speech.tongueTipUp"
  | "speech.tongueForward"
>;

export type LivingMentorRiveAdapterState = Readonly<{
  activeUtteranceId: string | null;
  acceptedSpeech: SpeechBindings;
  lastEventId: string | null;
}>;

export type LivingMentorRiveFallbackReason =
  | "none"
  | "invalid_snapshot"
  | "contract_mismatch"
  | "snapshot_expired";

export type LivingMentorRiveFrame = Readonly<{
  bindings: LivingMentorRiveBindings;
  droppedStaleSpeechFrame: boolean;
  fallbackReason: LivingMentorRiveFallbackReason;
  nextState: LivingMentorRiveAdapterState;
  triggerPlayAct: boolean;
}>;

export type LivingMentorRiveProjectionOptions = Readonly<{
  deviceHighContrast?: boolean;
  deviceReducedMotion?: boolean;
  nowMs?: number;
}>;

const SAFE_SPEECH: SpeechBindings = Object.freeze({
  "speech.state": "idle",
  "speech.viseme": "sil",
  "speech.blend": 0,
  "speech.jawOpen": 0,
  "speech.lipClose": 0,
  "speech.lipPress": 0,
  "speech.lipWide": 0,
  "speech.lipRound": 0,
  "speech.lipFunnel": 0,
  "speech.lowerLipBite": 0,
  "speech.tongueTipUp": 0,
  "speech.tongueForward": 0,
});

export const INITIAL_LIVING_MENTOR_RIVE_ADAPTER_STATE: LivingMentorRiveAdapterState =
  Object.freeze({
    activeUtteranceId: null,
    acceptedSpeech: SAFE_SPEECH,
    lastEventId: null,
  });

const SAFE_BINDINGS: LivingMentorRiveBindings = Object.freeze({
  "mentor.act": "idle_attentive",
  "mentor.affect": "calm",
  "mentor.intensity": 0,
  "mentor.priority": 0,
  ...SAFE_SPEECH,
  "world.roomState": "unavailable",
  "world.roomLevel": 0,
  "world.theme": "neutral",
  "world.celebrationTier": "none",
  "accessibility.reducedMotion": true,
  "accessibility.highContrast": false,
});

const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const UTTERANCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && allowed.includes(value as T[number])
    ? (value as T[number])
    : fallback;
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback = minimum,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function safeSpeech(state: SpeechState = "idle"): SpeechBindings {
  return { ...SAFE_SPEECH, "speech.state": state };
}

function speakingBindings(speech: UnknownRecord): SpeechBindings {
  return {
    "speech.state": "speaking",
    "speech.viseme": enumValue(speech.viseme, SPEECH_VISEMES, "sil"),
    "speech.blend": boundedNumber(speech.blend, 0, 1),
    "speech.jawOpen": boundedNumber(speech.jawOpen, 0, 1),
    "speech.lipClose": boundedNumber(speech.lipClose, 0, 1),
    "speech.lipPress": boundedNumber(speech.lipPress, 0, 1),
    "speech.lipWide": boundedNumber(speech.lipWide, 0, 1),
    "speech.lipRound": boundedNumber(speech.lipRound, 0, 1),
    "speech.lipFunnel": boundedNumber(speech.lipFunnel, 0, 1),
    "speech.lowerLipBite": boundedNumber(speech.lowerLipBite, 0, 1),
    "speech.tongueTipUp": boundedNumber(speech.tongueTipUp, 0, 1),
    "speech.tongueForward": boundedNumber(speech.tongueForward, 0, 1),
  };
}

function projectSpeech(
  speech: UnknownRecord,
  previous: LivingMentorRiveAdapterState,
): Readonly<{
  activeUtteranceId: string | null;
  bindings: SpeechBindings;
  droppedStaleSpeechFrame: boolean;
}> {
  const state = enumValue(speech.state, SPEECH_STATES, "idle");
  const utteranceId =
    typeof speech.utteranceId === "string" &&
    UTTERANCE_ID_PATTERN.test(speech.utteranceId)
      ? speech.utteranceId
      : null;

  if (state === "queued") {
    return {
      activeUtteranceId: utteranceId,
      bindings: safeSpeech("queued"),
      droppedStaleSpeechFrame: false,
    };
  }

  if (state === "speaking") {
    if (!utteranceId) {
      return {
        activeUtteranceId: previous.activeUtteranceId,
        bindings: previous.acceptedSpeech,
        droppedStaleSpeechFrame: true,
      };
    }

    if (
      previous.activeUtteranceId &&
      previous.activeUtteranceId !== utteranceId
    ) {
      return {
        activeUtteranceId: previous.activeUtteranceId,
        bindings: previous.acceptedSpeech,
        droppedStaleSpeechFrame: true,
      };
    }

    return {
      activeUtteranceId: utteranceId,
      bindings: speakingBindings(speech),
      droppedStaleSpeechFrame: false,
    };
  }

  const matchesActive =
    !previous.activeUtteranceId ||
    !utteranceId ||
    previous.activeUtteranceId === utteranceId;

  if (!matchesActive) {
    return {
      activeUtteranceId: previous.activeUtteranceId,
      bindings: previous.acceptedSpeech,
      droppedStaleSpeechFrame: true,
    };
  }

  return {
    activeUtteranceId:
      state === "paused" ? previous.activeUtteranceId : null,
    bindings: safeSpeech(state),
    droppedStaleSpeechFrame: false,
  };
}

function contractMajor(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(0|[1-9][0-9]*)\./.exec(value);
  return match ? Number(match[1]) : null;
}

function fallbackFrame(
  reason: Exclude<LivingMentorRiveFallbackReason, "none">,
  previous: LivingMentorRiveAdapterState,
  options: LivingMentorRiveProjectionOptions,
): LivingMentorRiveFrame {
  const act = reason === "snapshot_expired" ? "data_unavailable" : "error_recover";
  const bindings: LivingMentorRiveBindings = {
    ...SAFE_BINDINGS,
    "mentor.act": act,
    "mentor.priority": 100,
    "accessibility.highContrast": Boolean(options.deviceHighContrast),
  };

  return {
    bindings,
    droppedStaleSpeechFrame: false,
    fallbackReason: reason,
    nextState: {
      activeUtteranceId: null,
      acceptedSpeech: SAFE_SPEECH,
      lastEventId: previous.lastEventId,
    },
    triggerPlayAct: false,
  };
}

/**
 * Produces the complete allowlisted value frame for Rive without importing a
 * Rive runtime. Host-only copy, identity, learning, market, consent and
 * entitlement fields cannot cross this boundary by construction.
 */
export function projectLivingMentorRiveFrame(
  snapshot: unknown,
  previous: LivingMentorRiveAdapterState =
    INITIAL_LIVING_MENTOR_RIVE_ADAPTER_STATE,
  options: LivingMentorRiveProjectionOptions = {},
): LivingMentorRiveFrame {
  const root = record(snapshot);
  if (!root) return fallbackFrame("invalid_snapshot", previous, options);

  if (contractMajor(root.contractVersion) !== LIVING_MENTOR_RIVE_CONTRACT_MAJOR) {
    return fallbackFrame("contract_mismatch", previous, options);
  }

  const expiresAtMs =
    typeof root.expiresAt === "string" ? Date.parse(root.expiresAt) : Number.NaN;
  const nowMs = options.nowMs ?? Date.now();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    return fallbackFrame("snapshot_expired", previous, options);
  }

  const viewModel = record(root.viewModel);
  const mentor = record(viewModel?.mentor);
  const speech = record(viewModel?.speech);
  const world = record(viewModel?.world);
  const accessibility = record(viewModel?.accessibility);
  if (!viewModel || !mentor || !speech || !world || !accessibility) {
    return fallbackFrame("invalid_snapshot", previous, options);
  }

  const effectiveReducedMotion =
    Boolean(accessibility.reducedMotion) || Boolean(options.deviceReducedMotion);
  const speechProjection = projectSpeech(speech, previous);
  const eventId =
    typeof mentor.eventId === "string" && EVENT_ID_PATTERN.test(mentor.eventId)
      ? mentor.eventId
      : null;
  const triggerPlayAct = Boolean(eventId && eventId !== previous.lastEventId);
  const roomState = enumValue(world.roomState, ROOM_STATES, "unavailable");

  const bindings: LivingMentorRiveBindings = {
    "mentor.act": enumValue(mentor.act, LIVING_MENTOR_ACTS, "idle_attentive"),
    "mentor.affect": enumValue(mentor.affect, MENTOR_AFFECTS, "calm"),
    "mentor.intensity": effectiveReducedMotion
      ? 0
      : boundedNumber(mentor.intensity, 0, 1),
    "mentor.priority": boundedNumber(mentor.priority, 0, 100),
    ...speechProjection.bindings,
    "world.roomState": roomState,
    "world.roomLevel":
      roomState === "ready" ? boundedNumber(world.roomLevel, 0, 5) : 0,
    "world.theme": enumValue(world.theme, WORLD_THEMES, "neutral"),
    "world.celebrationTier": effectiveReducedMotion
      ? "none"
      : enumValue(world.celebrationTier, CELEBRATION_TIERS, "none"),
    "accessibility.reducedMotion": effectiveReducedMotion,
    "accessibility.highContrast":
      Boolean(accessibility.highContrast) || Boolean(options.deviceHighContrast),
  };

  return {
    bindings,
    droppedStaleSpeechFrame: speechProjection.droppedStaleSpeechFrame,
    fallbackReason: "none",
    nextState: {
      activeUtteranceId: speechProjection.activeUtteranceId,
      acceptedSpeech: speechProjection.bindings,
      lastEventId: eventId ?? previous.lastEventId,
    },
    triggerPlayAct,
  };
}
