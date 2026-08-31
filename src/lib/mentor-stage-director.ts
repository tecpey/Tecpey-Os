import type { LivingMentorAct } from "@/lib/living-mentor-presentation";

export const MENTOR_STAGE_DIRECTOR_CONTRACT_VERSION = "2.0.0" as const;

export type MentorWorkspaceMode =
  | "conversation"
  | "research"
  | "challenge_invite"
  | "arena_coach"
  | "news_briefing";

export type MentorArenaPanelState =
  | "closed"
  | "minimized"
  | "docked"
  | "focus";

export type MentorSceneFraming =
  | "wide_office"
  | "conversation"
  | "arena_focus";

export type MentorSpatialPose =
  | "seated_work"
  | "seated_turn"
  | "standing_user"
  | "standing_arena";

export type MentorGazeTarget = "monitor" | "user" | "arena" | "news";
export type MentorStageIntensity = "calm" | "important" | "critical";
export type MentorNewsEvidence = "verified" | "mixed" | "unverified";
export type MentorNewsImpact = "low" | "medium" | "high";

export type MentorStageEvent =
  | { type: "workspace_idle" }
  | { type: "conversation_engaged" }
  | { type: "question_composing" }
  | { type: "mentor_thinking" }
  | { type: "research_started" }
  | { type: "response_ready" }
  | { type: "arena_invited" }
  | { type: "arena_accepted" }
  | { type: "arena_minimized" }
  | { type: "arena_focus_requested" }
  | { type: "arena_closed" }
  | { type: "risk_rule_breached" }
  | { type: "risk_review_requested" }
  | { type: "news_brief_requested" }
  | {
      type: "news_classified";
      evidence: MentorNewsEvidence;
      impact: MentorNewsImpact;
    }
  | { type: "privacy_notice" }
  | { type: "data_unavailable" };

export type MentorStageDirection = Readonly<{
  mode: MentorWorkspaceMode;
  arenaPanel: MentorArenaPanelState;
  framing: MentorSceneFraming;
  pose: MentorSpatialPose;
  gaze: MentorGazeTarget;
  act: LivingMentorAct;
  intensity: MentorStageIntensity;
  motion: "full" | "reduced";
}>;

export const DEFAULT_MENTOR_STAGE_DIRECTION: MentorStageDirection = Object.freeze({
  mode: "conversation",
  arenaPanel: "closed",
  framing: "wide_office",
  pose: "seated_turn",
  gaze: "user",
  act: "idle_attentive",
  intensity: "calm",
  motion: "full",
});

export function mentorStageEventForWorkspaceActivity(input: {
  arenaPanel: MentorArenaPanelState;
  composing: boolean;
  engaged: boolean;
  newsBriefRequested: boolean;
  researching: boolean;
  riskReviewRequested: boolean;
  speaking: boolean;
  thinking: boolean;
}): MentorStageEvent {
  if (input.riskReviewRequested && (input.thinking || input.speaking)) {
    return { type: "risk_review_requested" };
  }
  if (input.thinking) {
    return input.researching
      ? { type: "research_started" }
      : { type: "mentor_thinking" };
  }
  if (input.speaking) return { type: "response_ready" };
  if (input.newsBriefRequested) return { type: "news_brief_requested" };
  if (input.composing) return { type: "question_composing" };
  if (input.arenaPanel === "focus") return { type: "arena_focus_requested" };
  if (input.arenaPanel === "docked") return { type: "arena_accepted" };
  if (input.arenaPanel === "minimized") return { type: "arena_minimized" };
  if (input.engaged) return { type: "conversation_engaged" };
  return { type: "workspace_idle" };
}

function withMotion(
  direction: Omit<MentorStageDirection, "motion">,
  reducedMotion: boolean,
): MentorStageDirection {
  return {
    ...direction,
    motion: reducedMotion ? "reduced" : "full",
  };
}

/**
 * Deterministic stage policy. Language models may write an explanation, but
 * they never choose pose, severity, panel size or whether Arena opens.
 */
export function directMentorStage(input: {
  event: MentorStageEvent;
  currentArenaPanel?: MentorArenaPanelState;
  reducedMotion?: boolean;
}): MentorStageDirection {
  const panel = input.currentArenaPanel ?? "closed";
  const reducedMotion = input.reducedMotion ?? false;

  switch (input.event.type) {
    case "conversation_engaged":
      return withMotion({
        mode: "conversation",
        arenaPanel: panel,
        framing: "conversation",
        pose: "standing_user",
        gaze: "user",
        act: "idle_attentive",
        intensity: "calm",
      }, reducedMotion);
    case "question_composing":
      return withMotion({
        mode: "conversation",
        arenaPanel: panel,
        framing: panel === "focus" ? "arena_focus" : "conversation",
        pose: panel === "focus" ? "standing_arena" : "standing_user",
        gaze: panel === "focus" ? "arena" : "user",
        act: "listen",
        intensity: "calm",
      }, reducedMotion);
    case "mentor_thinking":
      return withMotion({
        mode: "conversation",
        arenaPanel: panel,
        framing: panel === "focus" ? "arena_focus" : "wide_office",
        pose: "seated_work",
        gaze: "monitor",
        act: "think",
        intensity: "calm",
      }, reducedMotion);
    case "research_started":
      return withMotion({
        mode: "research",
        arenaPanel: panel,
        framing: panel === "focus" ? "arena_focus" : "wide_office",
        pose: "seated_work",
        gaze: "monitor",
        act: "think",
        intensity: "important",
      }, reducedMotion);
    case "response_ready":
      return withMotion({
        mode: "conversation",
        arenaPanel: panel,
        framing: panel === "focus" ? "arena_focus" : "conversation",
        pose: panel === "focus" ? "standing_arena" : "standing_user",
        gaze: panel === "focus" ? "arena" : "user",
        act: "explain",
        intensity: "calm",
      }, reducedMotion);
    case "arena_invited":
      return withMotion({
        mode: "challenge_invite",
        arenaPanel: panel,
        framing: "conversation",
        pose: "standing_user",
        gaze: "user",
        act: "invite_next_step",
        intensity: "important",
      }, reducedMotion);
    case "arena_accepted":
      return withMotion({
        mode: "arena_coach",
        arenaPanel: "docked",
        framing: "wide_office",
        pose: "standing_arena",
        gaze: "arena",
        act: "invite_next_step",
        intensity: "important",
      }, reducedMotion);
    case "arena_minimized":
      return withMotion({
        mode: "arena_coach",
        arenaPanel: "minimized",
        framing: "conversation",
        pose: "seated_turn",
        gaze: "user",
        act: "idle_attentive",
        intensity: "calm",
      }, reducedMotion);
    case "arena_focus_requested":
      return withMotion({
        mode: "arena_coach",
        arenaPanel: "focus",
        framing: "arena_focus",
        pose: "standing_arena",
        gaze: "arena",
        act: "explain",
        intensity: "important",
      }, reducedMotion);
    case "arena_closed":
      return withMotion({
        mode: "conversation",
        arenaPanel: "closed",
        framing: "wide_office",
        pose: "seated_turn",
        gaze: "user",
        act: "idle_attentive",
        intensity: "calm",
      }, reducedMotion);
    case "risk_rule_breached":
      return withMotion({
        mode: "arena_coach",
        arenaPanel: panel === "closed" ? "docked" : panel,
        framing: panel === "focus" ? "arena_focus" : "conversation",
        pose: "standing_arena",
        gaze: "arena",
        act: "risk_caution",
        intensity: "critical",
      }, reducedMotion);
    case "risk_review_requested":
      return withMotion({
        mode: panel === "closed" ? "conversation" : "arena_coach",
        arenaPanel: panel,
        framing: panel === "focus" ? "arena_focus" : "conversation",
        pose: panel === "closed" ? "standing_user" : "standing_arena",
        gaze: panel === "closed" ? "user" : "arena",
        act: "risk_caution",
        intensity: "important",
      }, reducedMotion);
    case "news_brief_requested":
      return withMotion({
        mode: "news_briefing",
        arenaPanel: panel,
        framing: "conversation",
        pose: "standing_user",
        gaze: "news",
        act: "think",
        intensity: "calm",
      }, reducedMotion);
    case "news_classified": {
      const verified = input.event.evidence === "verified";
      const important = input.event.impact !== "low";
      return withMotion({
        mode: "news_briefing",
        arenaPanel: panel,
        framing: "conversation",
        pose: "standing_user",
        gaze: "news",
        act: verified ? "explain" : "pause_reflect",
        intensity: verified && input.event.impact === "high"
          ? "critical"
          : important
            ? "important"
            : "calm",
      }, reducedMotion);
    }
    case "privacy_notice":
      return withMotion({
        mode: "conversation",
        arenaPanel: panel,
        framing: "conversation",
        pose: "standing_user",
        gaze: "user",
        act: "privacy_notice",
        intensity: "important",
      }, reducedMotion);
    case "data_unavailable":
      return withMotion({
        mode: "conversation",
        arenaPanel: panel,
        framing: "conversation",
        pose: "seated_turn",
        gaze: "user",
        act: "data_unavailable",
        intensity: "important",
      }, reducedMotion);
    case "workspace_idle":
    default:
      return withMotion({
        ...DEFAULT_MENTOR_STAGE_DIRECTION,
        arenaPanel: panel,
        framing: panel === "focus" ? "arena_focus" : "wide_office",
      }, reducedMotion);
  }
}
