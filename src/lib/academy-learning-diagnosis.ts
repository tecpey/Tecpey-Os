export const ACADEMY_LEARNING_DIAGNOSIS_POLICY_VERSION = "academy-learning-diagnosis-v1" as const;

export type AcademyLearningEvidenceSource =
  | "assessment"
  | "arena"
  | "mentor"
  | "market"
  | "manual"
  | "system";

export type AcademyLearningEvidence = {
  sourceType: AcademyLearningEvidenceSource;
  sourceId: string;
  conceptTag: string;
  strength: number;
  confidence: number;
  observedAt: string;
};

export type AcademyConceptDiagnosis = {
  conceptTag: string;
  priorityBps: number;
  reasonCodes: string[];
  evidenceCount: number;
  authoritativeEvidenceCount: number;
  newestObservedAt: string;
};

const DAY_MS = 86_400_000;
const MAX_AGE_DAYS = 120;
const AUTHORITY_BPS: Record<AcademyLearningEvidenceSource, number> = {
  assessment: 10_000,
  arena: 8_500,
  system: 8_000,
  mentor: 4_500,
  manual: 3_500,
  market: 2_500,
};

function recencyBps(days: number): number {
  if (days > MAX_AGE_DAYS) return 0;
  if (days <= 7) return 10_000;
  if (days <= 30) return 8_500;
  if (days <= 60) return 6_500;
  if (days <= 90) return 4_500;
  return 2_500;
}

function ageDays(observedAt: string, asOf: Date): number | null {
  const observed = new Date(observedAt);
  if (!Number.isFinite(observed.getTime()) || !Number.isFinite(asOf.getTime())) return null;
  return Math.max(0, (asOf.getTime() - observed.getTime()) / DAY_MS);
}

function score(item: AcademyLearningEvidence, asOf: Date): number {
  const days = ageDays(item.observedAt, asOf);
  if (days === null || item.strength >= 0) return 0;
  const severity = Math.min(100, Math.abs(Math.round(item.strength))) * 100;
  const confidence = Math.max(0, Math.min(100, Math.round(item.confidence))) * 100;
  return Math.round(
    (severity * confidence * AUTHORITY_BPS[item.sourceType] * recencyBps(days)) /
      1_000_000_000_000,
  );
}

export function diagnoseAcademyLearning(input: {
  evidence: readonly AcademyLearningEvidence[];
  asOf: Date;
}): { status: "insufficient_evidence"; concepts: [] } | {
  status: "ready";
  concepts: AcademyConceptDiagnosis[];
} {
  const grouped = new Map<string, AcademyLearningEvidence[]>();
  for (const item of input.evidence) {
    const conceptTag = item.conceptTag.trim().toLowerCase();
    const days = ageDays(item.observedAt, input.asOf);
    if (
      !/^[a-z0-9][a-z0-9._-]{1,79}$/.test(conceptTag) ||
      days === null ||
      days > MAX_AGE_DAYS ||
      score(item, input.asOf) <= 0
    ) continue;
    const normalized = { ...item, conceptTag };
    grouped.set(conceptTag, [...(grouped.get(conceptTag) ?? []), normalized]);
  }

  if (grouped.size === 0) return { status: "insufficient_evidence", concepts: [] };

  const concepts = [...grouped.entries()].map(([conceptTag, items]) => {
    const reasonCodes = new Set<string>();
    let priorityBps = 0;
    let authoritativeEvidenceCount = 0;
    for (const item of items) {
      priorityBps += score(item, input.asOf);
      reasonCodes.add(`source_${item.sourceType}`);
      if (["assessment", "arena", "system"].includes(item.sourceType)) authoritativeEvidenceCount += 1;
      if (item.confidence < 50) reasonCodes.add("confidence_limited");
      const days = ageDays(item.observedAt, input.asOf);
      if (days !== null && days > 60) reasonCodes.add("evidence_decayed");
    }
    return {
      conceptTag,
      priorityBps: Math.min(10_000, priorityBps),
      reasonCodes: [...reasonCodes].sort(),
      evidenceCount: items.length,
      authoritativeEvidenceCount,
      newestObservedAt: items.map((item) => new Date(item.observedAt).toISOString())
        .sort((a, b) => b.localeCompare(a))[0],
    };
  }).sort((a, b) =>
    b.priorityBps - a.priorityBps ||
    b.authoritativeEvidenceCount - a.authoritativeEvidenceCount ||
    a.conceptTag.localeCompare(b.conceptTag)
  );

  return { status: "ready", concepts };
}
