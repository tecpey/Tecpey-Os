import "server-only";

import { createHash } from "node:crypto";
import { academyV3ReferenceMissions } from "@/data/academyV3ReferenceMissions";

export const ACADEMY_V3_MISSION_ATTEMPT_POLICY_VERSION = "academy-v3-mission-attempt-v1";

function canonicalJson(value: unknown): string {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(Object.entries(input as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sort(nested)]));
  };
  return JSON.stringify(sort(value));
}

function getMission(missionId: string) {
  const value = academyV3ReferenceMissions.find((candidate) => candidate.id === missionId);
  if (!value) throw new Error("academy_v3_mission_unknown");
  return value;
}

export function issueAcademyV3MissionAttempt(input: {
  missionId: string;
  locale: "fa" | "en";
  issuedAt?: Date;
}) {
  const value = getMission(input.missionId);
  const issuedAt = input.issuedAt ?? new Date();
  if (!Number.isFinite(issuedAt.getTime())) throw new Error("academy_v3_mission_time_invalid");
  return {
    missionId: value.id,
    missionVersion: value.version,
    conceptId: value.conceptId,
    objectiveIds: [...value.objectiveIds],
    locale: input.locale,
    policyVersion: ACADEMY_V3_MISSION_ATTEMPT_POLICY_VERSION,
    issuedAt: issuedAt.toISOString(),
    missionSha256: createHash("sha256").update(canonicalJson(value)).digest("hex"),
  };
}


export function evaluateAcademyV3MissionDecision(input: {
  attempt: ReturnType<typeof issueAcademyV3MissionAttempt>;
  choiceId: string;
  submittedAt?: Date;
}) {
  const value = getMission(input.attempt.missionId);
  const missionSha256 = createHash("sha256").update(canonicalJson(value)).digest("hex");
  if (
    input.attempt.policyVersion !== ACADEMY_V3_MISSION_ATTEMPT_POLICY_VERSION ||
    input.attempt.missionVersion !== value.version ||
    input.attempt.conceptId !== value.conceptId ||
    (input.attempt.locale !== "fa" && input.attempt.locale !== "en") ||
    input.attempt.missionSha256 !== missionSha256 ||
    canonicalJson(input.attempt.objectiveIds) !== canonicalJson(value.objectiveIds)
  ) throw new Error("academy_v3_mission_attempt_stale");

  const choice = value.scenario.choices.find((candidate) => candidate.id === input.choiceId);
  if (!choice) throw new Error("academy_v3_mission_choice_unknown");
  const submittedAt = input.submittedAt ?? new Date();
  const issuedAt = new Date(input.attempt.issuedAt);
  if (!Number.isFinite(submittedAt.getTime()) || !Number.isFinite(issuedAt.getTime())) {
    throw new Error("academy_v3_mission_time_invalid");
  }
  if (submittedAt.getTime() < issuedAt.getTime()) throw new Error("academy_v3_mission_time_order_invalid");
  const dueAfter = new Date(submittedAt.getTime() + value.reassessment.minimumDelayHours * 3_600_000);
  return {
    missionId: value.id,
    missionVersion: value.version,
    conceptId: value.conceptId,
    objectiveIds: [...value.objectiveIds],
    locale: input.attempt.locale,
    policyVersion: ACADEMY_V3_MISSION_ATTEMPT_POLICY_VERSION,
    missionSha256,
    choiceId: choice.id,
    correct: choice.id === value.scenario.correctChoiceId,
    misconceptionId: choice.misconceptionId ?? null,
    feedback: {
      locale: input.attempt.locale,
      missionVersion: value.version,
      missionSha256,
      rationale: value.scenario.rationale[input.attempt.locale],
      choiceFeedback: choice.feedback?.[input.attempt.locale] ?? value.scenario.rationale[input.attempt.locale],
      evidenceThatCouldChangeDecision: value.scenario.evidenceThatCouldChangeDecision[input.attempt.locale],
    },
    evidenceKind: "scenario" as const,
    submittedAt: submittedAt.toISOString(),
    reassessment: {
      strategy: value.reassessment.strategy,
      minimumDelayHours: value.reassessment.minimumDelayHours,
      dueAfter: dueAfter.toISOString(),
    },
    authorityEffects: {
      grantsMastery: false as const,
      grantsLeagueScore: false as const,
      grantsCredential: false as const,
      grantsFinancialValue: false as const,
    },
  };
}
