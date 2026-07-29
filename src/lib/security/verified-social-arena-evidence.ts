import "server-only";

import { createHash } from "node:crypto";

const VERIFIED_SOCIAL_ARENA_EVIDENCE = Symbol("verified-social-arena-evidence");

export type VerifiedSocialArenaEvidenceKind =
  | "arena-decision"
  | "arena-execution"
  | "arena-reflection"
  | "challenge-completion"
  | "instructor-assessment"
  | "mentor-signal"
  | "reputation-score"
  | "reward-eligibility";

export type VerifiedSocialArenaEvidence = Readonly<{
  kind: VerifiedSocialArenaEvidenceKind;
  tenantId: string;
  principalId: string;
  sourceRecordId: string;
  sourceRevision: number;
  occurredAt: string;
  payloadHash: string;
  [VERIFIED_SOCIAL_ARENA_EVIDENCE]: true;
}>;

export type VerifiedSocialArenaEvidenceInput = {
  kind: VerifiedSocialArenaEvidenceKind;
  tenantId: string;
  principalId: string;
  sourceRecordId: string;
  sourceRevision: number;
  occurredAt: Date;
  canonicalPayload: unknown;
};

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
    .join(",")}}`;
}

function boundedToken(value: string, label: string, max = 300): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new Error(`invalid_verified_social_arena_${label}`);
  }
  return normalized;
}

/**
 * Construct official Social/Arena evidence from already-committed server state.
 * The unexported symbol brand prevents browser payloads or plain objects from
 * satisfying this type without passing through this server-only factory.
 */
export function createVerifiedSocialArenaEvidence(
  input: VerifiedSocialArenaEvidenceInput,
): VerifiedSocialArenaEvidence {
  if (!Number.isSafeInteger(input.sourceRevision) || input.sourceRevision < 0) {
    throw new Error("invalid_verified_social_arena_revision");
  }
  if (!(input.occurredAt instanceof Date) || !Number.isFinite(input.occurredAt.getTime())) {
    throw new Error("invalid_verified_social_arena_timestamp");
  }

  const tenantId = boundedToken(input.tenantId, "tenant", 80);
  const principalId = boundedToken(input.principalId, "principal");
  const sourceRecordId = boundedToken(input.sourceRecordId, "source_record");
  const occurredAt = input.occurredAt.toISOString();
  const payloadHash = createHash("sha256")
    .update("tecpey-social-arena-evidence-v1\u001f")
    .update(input.kind)
    .update("\u001f")
    .update(tenantId)
    .update("\u001f")
    .update(principalId)
    .update("\u001f")
    .update(sourceRecordId)
    .update("\u001f")
    .update(String(input.sourceRevision))
    .update("\u001f")
    .update(occurredAt)
    .update("\u001f")
    .update(canonical(input.canonicalPayload))
    .digest("hex");

  return Object.freeze({
    kind: input.kind,
    tenantId,
    principalId,
    sourceRecordId,
    sourceRevision: input.sourceRevision,
    occurredAt,
    payloadHash,
    [VERIFIED_SOCIAL_ARENA_EVIDENCE]: true as const,
  });
}

export function isVerifiedSocialArenaEvidence(
  value: unknown,
): value is VerifiedSocialArenaEvidence {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Record<PropertyKey, unknown>)[VERIFIED_SOCIAL_ARENA_EVIDENCE] === true,
  );
}
