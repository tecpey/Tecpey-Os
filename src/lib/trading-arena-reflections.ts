import { createHash } from "crypto";
import Decimal from "decimal.js";
import { cleanText } from "@/lib/student-cartax";
import type {
  ArenaClosedTradeV2,
  ArenaExecutionMentorFlag,
} from "@/lib/trading-arena-execution-v2";

export const ARENA_REFLECTION_MISTAKE_TAGS = [
  "late-entry",
  "early-exit",
  "oversized-position",
  "missing-stop-loss",
  "moved-stop-loss",
  "fomo-entry",
  "revenge-trade",
  "ignored-plan",
  "poor-risk-reward",
  "overtrading",
  "none",
] as const;

export type ArenaReflectionMistakeTag = typeof ARENA_REFLECTION_MISTAKE_TAGS[number];

export type ArenaReflectionInput = {
  attemptId: string;
  closedTradeId: string;
  expectedRevision: number;
  decisionReview: string;
  learnedLesson: string;
  emotionalReview: string;
  mistakeTags: ArenaReflectionMistakeTag[];
  nextActionCommitment: string | null;
};

export type ArenaReflectionEvidence = {
  asset: ArenaClosedTradeV2["asset"];
  realizedPnl: string;
  realizedPnlRate: string;
  closureReason: ArenaClosedTradeV2["closureReason"];
  closedAt: string;
  mentorFlags: ArenaClosedTradeV2["mentorFlags"];
};

export type ArenaReflectionRecord = {
  id: string;
  studentId: string;
  attemptId: string;
  closedTradeId: string;
  revision: number;
  decisionReview: string;
  learnedLesson: string;
  emotionalReview: string;
  mistakeTags: ArenaReflectionMistakeTag[];
  nextActionCommitment: string | null;
  evidence: ArenaReflectionEvidence;
  createdAt: string;
  updatedAt: string;
};

export type ArenaReflectionRow = {
  id: string;
  student_id: string;
  attempt_id: string;
  closed_trade_id: string;
  revision: string | number;
  decision_review: string;
  learned_lesson: string;
  emotional_review: string;
  mistake_tags: unknown;
  next_action_commitment: string | null;
  evidence_asset: ArenaClosedTradeV2["asset"];
  evidence_realized_pnl: string;
  evidence_realized_pnl_rate: string;
  evidence_closure_reason: ArenaClosedTradeV2["closureReason"];
  evidence_closed_at: Date | string;
  evidence_mentor_flags: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_RE = /^[A-Za-z0-9._:-]{8,120}$/;
const TAG_SET = new Set<string>(ARENA_REFLECTION_MISTAKE_TAGS);
const MENTOR_FLAGS = new Set<ArenaExecutionMentorFlag>([
  "no-stop-loss",
  "over-risk",
  "impulse-entry",
  "revenge-trade",
  "fomo-entry",
  "good-discipline",
  "proper-sizing",
  "target-hit",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requiredText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = cleanText(value, max);
  return normalized.length > 0 ? normalized : null;
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = cleanText(value, max);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeArenaReflectionMistakeTags(
  value: unknown,
): ArenaReflectionMistakeTag[] | null {
  if (
    !Array.isArray(value) || value.length < 1 || value.length > 5 ||
    value.some((item) => typeof item !== "string")
  ) return null;
  const normalized = [...new Set(value.map((item) => cleanText(item, 40).toLowerCase()))]
    .sort();
  if (normalized.length < 1 || normalized.length > 5) return null;
  if (normalized.some((tag) => !TAG_SET.has(tag))) return null;
  if (normalized.includes("none") && normalized.length !== 1) return null;
  return normalized as ArenaReflectionMistakeTag[];
}

export function parseArenaReflectionInput(value: unknown): ArenaReflectionInput | null {
  const raw = record(value);
  if (!raw) return null;

  const attemptId = typeof raw.attemptId === "string" && UUID_RE.test(raw.attemptId)
    ? raw.attemptId.toLowerCase()
    : null;
  const closedTradeId = requiredText(raw.closedTradeId, 160);
  const expectedRevision = typeof raw.expectedRevision === "number"
    ? raw.expectedRevision
    : Number.NaN;
  const decisionReview = requiredText(raw.decisionReview, 4_000);
  const learnedLesson = requiredText(raw.learnedLesson, 4_000);
  const emotionalReview = requiredText(raw.emotionalReview, 2_000);
  const mistakeTags = normalizeArenaReflectionMistakeTags(raw.mistakeTags);
  const nextActionCommitment = optionalText(raw.nextActionCommitment, 2_000);

  if (
    !attemptId || !closedTradeId || !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 || !decisionReview || !learnedLesson ||
    !emotionalReview || !mistakeTags || nextActionCommitment === undefined
  ) return null;

  return {
    attemptId,
    closedTradeId,
    expectedRevision,
    decisionReview,
    learnedLesson,
    emotionalReview,
    mistakeTags,
    nextActionCommitment,
  };
}

export function parseArenaReflectionIdempotencyKey(value: unknown): string | null {
  return typeof value === "string" && IDEMPOTENCY_RE.test(value) ? value : null;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
    .join(",")}}`;
}

export function createArenaReflectionRequestHash(input: ArenaReflectionInput): string {
  return createHash("sha256").update(canonical(input)).digest("hex");
}

export function arenaReflectionEvidenceFromTrade(
  trade: ArenaClosedTradeV2,
): ArenaReflectionEvidence {
  return {
    asset: trade.asset,
    realizedPnl: trade.realizedPnl,
    realizedPnlRate: trade.realizedPnlRate,
    closureReason: trade.closureReason,
    closedAt: trade.closedAt,
    mentorFlags: [...trade.mentorFlags],
  };
}

function iso(value: Date | string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("arena_reflection_timestamp_invalid");
  return parsed.toISOString();
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("arena_reflection_array_invalid");
  }
  return value;
}

function canonicalEvidenceAmount(value: string, places: number): string {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new Error("arena_reflection_evidence_invalid");
  }
  const parsed = new Decimal(value);
  if (!parsed.isFinite()) throw new Error("arena_reflection_evidence_invalid");
  const canonicalValue = parsed.toDecimalPlaces(places, Decimal.ROUND_DOWN);
  if (!parsed.eq(canonicalValue)) {
    throw new Error("arena_reflection_evidence_invalid");
  }
  return canonicalValue.toFixed(places);
}

function validatedMentorFlags(value: unknown): ArenaExecutionMentorFlag[] {
  const flags = stringArray(value);
  if (
    flags.length > MENTOR_FLAGS.size ||
    new Set(flags).size !== flags.length ||
    flags.some((flag) => !MENTOR_FLAGS.has(flag as ArenaExecutionMentorFlag))
  ) {
    throw new Error("arena_reflection_evidence_invalid");
  }
  return flags as ArenaExecutionMentorFlag[];
}

export function mapArenaReflectionRow(row: ArenaReflectionRow): ArenaReflectionRecord {
  const revision = Number(row.revision);
  const rawTags = stringArray(row.mistake_tags);
  const tags = normalizeArenaReflectionMistakeTags(rawTags);
  const mentorFlags = validatedMentorFlags(row.evidence_mentor_flags);
  if (
    !Number.isSafeInteger(revision) || revision < 1 || !tags ||
    rawTags.length !== tags.length || rawTags.some((tag, index) => tag !== tags[index])
  ) {
    throw new Error("arena_reflection_row_invalid");
  }
  if (row.evidence_asset !== "BTC" && row.evidence_asset !== "ETH") {
    throw new Error("arena_reflection_evidence_invalid");
  }
  if (![
    "manual",
    "stop-loss",
    "take-profit",
  ].includes(row.evidence_closure_reason)) {
    throw new Error("arena_reflection_evidence_invalid");
  }

  return {
    id: row.id,
    studentId: row.student_id,
    attemptId: row.attempt_id,
    closedTradeId: row.closed_trade_id,
    revision,
    decisionReview: row.decision_review,
    learnedLesson: row.learned_lesson,
    emotionalReview: row.emotional_review,
    mistakeTags: tags,
    nextActionCommitment: row.next_action_commitment,
    evidence: {
      asset: row.evidence_asset,
      realizedPnl: canonicalEvidenceAmount(row.evidence_realized_pnl, 10),
      realizedPnlRate: canonicalEvidenceAmount(row.evidence_realized_pnl_rate, 8),
      closureReason: row.evidence_closure_reason,
      closedAt: iso(row.evidence_closed_at),
      mentorFlags,
    },
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
