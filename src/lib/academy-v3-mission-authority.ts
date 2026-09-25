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
