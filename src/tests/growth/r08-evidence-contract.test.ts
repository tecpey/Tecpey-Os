import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateR08Evidence,
  R08_EVIDENCE_SCHEMA_VERSION,
  R08_POLICY_VERSION,
  verifyR08DetachedDigest,
} from "../../lib/crm/r08-evidence-contract";

const validInput = () => ({
  schemaVersion: R08_EVIDENCE_SCHEMA_VERSION,
  policyVersion: R08_POLICY_VERSION,
  candidateSha: "a".repeat(40),
  scopeToken: "tenant-scope-v1",
  windowStart: "2026-10-03T00:00:00.000Z",
  windowEnd: "2026-10-10T00:00:00.000Z",
  activitySourceAvailable: true,
  qualificationAuthorityAvailable: true,
  localeCoverageComplete: true,
  wau: { total: 100, fa: 88, en: 12 },
  qualifiedLeads: { total: 40, fa: 37, en: 3 },
  minimumSampleSize: 20,
});

test("evaluates bounded aggregate counts and emits a verifiable detached digest", () => {
  const result = evaluateR08Evidence(validInput());
  assert.equal(result.status, "EVALUABLE");
  if (result.status !== "EVALUABLE") return;
  assert.equal(result.wau.nonPersianPercent, 12);
  assert.equal(result.qualifiedLeads.nonPersianPercent, 7.5);
  const { detachedSha256, ...evidence } = result;
  assert.equal(verifyR08DetachedDigest(evidence, detachedSha256), true);
  assert.equal(verifyR08DetachedDigest(evidence, "0".repeat(64)), false);
});

test("missing canonical sources and locale coverage fail closed instead of becoming zero", () => {
  const result = evaluateR08Evidence({
    ...validInput(),
    activitySourceAvailable: false,
    qualificationAuthorityAvailable: false,
    localeCoverageComplete: false,
  });
  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  if (result.status === "INSUFFICIENT_EVIDENCE") {
    assert.ok(result.reasons.includes("canonical_activity_source_missing"));
    assert.ok(result.reasons.includes("qualification_authority_missing"));
    assert.ok(result.reasons.includes("locale_coverage_incomplete"));
  }
});

test("zero and undersized denominators are insufficient evidence", () => {
  const result = evaluateR08Evidence({
    ...validInput(),
    wau: { total: 0, fa: 0, en: 0 },
    qualifiedLeads: { total: 19, fa: 18, en: 1 },
  });
  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  if (result.status === "INSUFFICIENT_EVIDENCE") {
    assert.ok(result.reasons.includes("wau_denominator_insufficient"));
    assert.ok(result.reasons.includes("qualified_lead_denominator_insufficient"));
  }
});

test("unknown versions, malformed counts, and invalid time windows fail closed", () => {
  const result = evaluateR08Evidence({
    ...validInput(),
    schemaVersion: "unknown",
    wau: { total: 10, fa: 7, en: 2 },
    windowStart: "2026-10-10T00:00:00.000Z",
    windowEnd: "2026-10-03T00:00:00.000Z",
  });
  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  if (result.status === "INSUFFICIENT_EVIDENCE") {
    assert.ok(result.reasons.includes("unknown_schema_version"));
    assert.ok(result.reasons.includes("wau_counts_invalid"));
    assert.ok(result.reasons.includes("window_invalid"));
  }
});

test("missing governed minimum sample size fails closed", () => {
  const result = evaluateR08Evidence({ ...validInput(), minimumSampleSize: null });
  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  if (result.status === "INSUFFICIENT_EVIDENCE") {
    assert.ok(result.reasons.includes("minimum_sample_size_not_governed"));
  }
});
