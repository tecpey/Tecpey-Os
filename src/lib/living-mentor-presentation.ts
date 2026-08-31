export const LIVING_MENTOR_ACTS = [
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
] as const;

export type LivingMentorAct = (typeof LIVING_MENTOR_ACTS)[number];

export type LivingMentorPresentationSignals = Readonly<{
  isComposing: boolean;
  isSpeaking: boolean;
  isThinking: boolean;
  riskCaution: boolean;
}>;

/**
 * Projects host-owned UI signals into the small, non-sensitive act vocabulary
 * allowed to cross the character-renderer boundary.
 *
 * Safety always wins. Speaking then wins over request loading because a reply
 * may begin streaming before the request lifecycle has fully settled.
 */
export function selectLivingMentorAct({
  isComposing,
  isSpeaking,
  isThinking,
  riskCaution,
}: LivingMentorPresentationSignals): LivingMentorAct {
  if (riskCaution) return "risk_caution";
  if (isSpeaking) return "explain";
  if (isThinking) return "think";
  if (isComposing) return "listen";
  return "idle_attentive";
}
