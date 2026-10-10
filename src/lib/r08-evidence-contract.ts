import { createHash, timingSafeEqual } from "node:crypto";

export const R08_EVIDENCE_SCHEMA_VERSION = "tecpey-r08-aggregate-evidence-v1";
export const R08_POLICY_VERSION = "r08-language-growth-policy-v1";

export type LanguageCounts = {
  total: number;
  fa: number;
  en: number;
};

export type R08EvidenceInput = {
  schemaVersion: string;
  policyVersion: string;
  candidateSha: string;
  scopeToken: string;
  windowStart: string;
  windowEnd: string;
  activitySourceAvailable: boolean;
  qualificationAuthorityAvailable: boolean;
  localeCoverageComplete: boolean;
  wau: LanguageCounts;
  qualifiedLeads: LanguageCounts;
  minimumSampleSize: number | null;
};

export type R08EvidenceResult =
  | {
      status: "INSUFFICIENT_EVIDENCE";
      reasons: string[];
      schemaVersion: typeof R08_EVIDENCE_SCHEMA_VERSION;
    }
  | {
      status: "EVALUABLE";
      schemaVersion: typeof R08_EVIDENCE_SCHEMA_VERSION;
      policyVersion: typeof R08_POLICY_VERSION;
      candidateSha: string;
      scopeToken: string;
      windowStart: string;
      windowEnd: string;
      wau: LanguageCounts & { nonPersianPercent: number };
      qualifiedLeads: LanguageCounts & { nonPersianPercent: number };
      detachedSha256: string;
    };

function isCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && value === new Date(value).toISOString();
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("r08_non_finite_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new Error("r08_unsupported_canonical_value");
}

function validCounts(counts: LanguageCounts): boolean {
  return isCount(counts.total) && isCount(counts.fa) && isCount(counts.en)
    && counts.total === counts.fa + counts.en;
}

function percentage(counts: LanguageCounts): number {
  return Math.round((counts.en / counts.total) * 10_000) / 100;
}

export function verifyR08DetachedDigest(
  evidence: Omit<Extract<R08EvidenceResult, { status: "EVALUABLE" }>, "detachedSha256">,
  digest: string,
): boolean {
  if (!/^[a-f0-9]{64}$/.test(digest)) return false;
  const expected = createHash("sha256").update(canonicalJson(evidence)).digest();
  const supplied = Buffer.from(digest, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/**
 * Pure governance contract only. It does not query or establish the authority
 * of database sources; callers must supply server-verified aggregates and
 * explicit source/coverage attestations. Missing inputs never become zero.
 */
export function evaluateR08Evidence(input: R08EvidenceInput): R08EvidenceResult {
  const reasons: string[] = [];
  if (input.schemaVersion !== R08_EVIDENCE_SCHEMA_VERSION) reasons.push("unknown_schema_version");
  if (input.policyVersion !== R08_POLICY_VERSION) reasons.push("unknown_policy_version");
  if (!/^[a-f0-9]{40}$/.test(input.candidateSha)) reasons.push("candidate_sha_invalid");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(input.scopeToken)) reasons.push("scope_token_invalid");
  if (!validTimestamp(input.windowStart) || !validTimestamp(input.windowEnd)
    || Date.parse(input.windowStart) >= Date.parse(input.windowEnd)) reasons.push("window_invalid");
  if (!input.activitySourceAvailable) reasons.push("canonical_activity_source_missing");
  if (!input.qualificationAuthorityAvailable) reasons.push("qualification_authority_missing");
  if (!input.localeCoverageComplete) reasons.push("locale_coverage_incomplete");
  if (!Number.isSafeInteger(input.minimumSampleSize) || (input.minimumSampleSize ?? 0) < 1) {
    reasons.push("minimum_sample_size_not_governed");
  }
  if (!validCounts(input.wau)) reasons.push("wau_counts_invalid");
  if (!validCounts(input.qualifiedLeads)) reasons.push("qualified_lead_counts_invalid");
  if (input.wau.total === 0 || (input.minimumSampleSize !== null && input.wau.total < input.minimumSampleSize)) {
    reasons.push("wau_denominator_insufficient");
  }
  if (input.qualifiedLeads.total === 0
    || (input.minimumSampleSize !== null && input.qualifiedLeads.total < input.minimumSampleSize)) {
    reasons.push("qualified_lead_denominator_insufficient");
  }
  if (reasons.length) {
    return { status: "INSUFFICIENT_EVIDENCE", schemaVersion: R08_EVIDENCE_SCHEMA_VERSION, reasons: [...new Set(reasons)] };
  }

  const evidenceWithoutDigest = {
    status: "EVALUABLE" as const,
    schemaVersion: R08_EVIDENCE_SCHEMA_VERSION,
    policyVersion: R08_POLICY_VERSION,
    candidateSha: input.candidateSha,
    scopeToken: input.scopeToken,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    wau: { ...input.wau, nonPersianPercent: percentage(input.wau) },
    qualifiedLeads: { ...input.qualifiedLeads, nonPersianPercent: percentage(input.qualifiedLeads) },
  };
  const detachedSha256 = createHash("sha256").update(canonicalJson(evidenceWithoutDigest)).digest("hex");
  return { ...evidenceWithoutDigest, detachedSha256 };
}
