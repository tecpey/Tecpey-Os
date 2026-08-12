import assert from "node:assert/strict";
import test from "node:test";
import { verifyGoApprovalMatrixEvidence } from "./verify-go-approval-matrix-evidence.mjs";

const SHA = "a".repeat(40);
const HASH = "b".repeat(64);
const RELEASE_SCOPE_ID = "controlled-public-fa-en-academy-mentor-arena";
const APPROVAL_URL = "https://github.com/tecpey/Tecpey-Os/pull/400";
const EVIDENCE_URL = "https://github.com/tecpey/Tecpey-Os/actions/runs/623456789";
const OPERATOR = "release-operator:protected-staging";
const REVIEWER = "qa-reviewer:final-approval-matrix";

function participant(role, externalIdentity) {
  return { role, externalIdentity };
}

function prerequisite(id) {
  return {
    id,
    status: "accepted",
    evidenceUrl: EVIDENCE_URL,
    evidenceDigest: `sha256:${HASH}`,
  };
}

function approval(role, approverExternalIdentity) {
  return {
    role,
    approverExternalIdentity,
    approvedAt: "2026-08-12T11:20:00Z",
    candidateSha: SHA,
    launchScopeId: RELEASE_SCOPE_ID,
    decision: "approved",
    approvalEvidenceUrl: APPROVAL_URL,
    evidenceDigest: `sha256:${HASH}`,
    attestation: "approved-for-controlled-soft-launch-only",
    conditions: [
      "exact candidate SHA approved",
      "controlled public FA/EN, Academy, Mentor and virtual Arena only",
      "real-money Exchange remains disabled",
      "custody deposits withdrawals remain disabled",
      "enterprise white-label public rewards remain disabled",
    ],
  };
}

const valid = {
  schemaVersion: 1,
  authority: "tecpey-go-approval-matrix-v1",
  evidenceClass: "controlled-soft-launch-go-approval-matrix",
  decision: "APPROVED_FOR_CONTROLLED_SOFT_LAUNCH",
  environment: "release-control",
  sourceSha: SHA,
  releaseScope: {
    candidateSha: SHA,
    launchScopeId: RELEASE_SCOPE_ID,
    allowedSurfaces: ["public-fa-en", "academy", "mentor", "virtual-trading-arena"],
    disabledSurfaces: [
      "real-money-exchange",
      "custody-deposits-withdrawals",
      "public-financial-rewards",
      "enterprise-white-label",
    ],
    status: "controlled-soft-launch-only",
  },
  prerequisiteEvidence: Object.fromEntries(
    ["NOG-01", "NOG-02", "NOG-03", "NOG-04", "NOG-05", "NOG-06", "NOG-07", "NOG-08", "NOG-10", "NOG-11", "NOG-12"].map(
      (id) => [id, prerequisite(id)],
    ),
  ),
  approvalMatrix: {
    ceo: approval("CEO", "github:mannan-vajihi"),
    ctoOrChiefArchitect: approval("CTO or Chief Architect", "github:chief-architect"),
    security: approval("Security", "github:security-owner"),
    product: approval("Product", "github:product-owner"),
    compliance: approval("Compliance", "github:compliance-owner"),
    sre: approval("SRE", "github:sre-owner"),
    qa: approval("QA", "github:qa-owner"),
  },
  releaseOwner: participant("Release Owner", "github:mannan-vajihi"),
  operator: participant("Release Operator", OPERATOR),
  reviewer: participant("Independent Approval Reviewer", REVIEWER),
  privacyBoundary: [
    "redacted-evidence-only",
    "no-secrets-or-connection-urls",
    "no-host-ips",
    "no-raw-logs",
    "no-customer-data",
  ],
  finalDisposition: "approved_for_controlled_soft_launch",
};

test("accepts complete Go approval matrix evidence", () => {
  assert.equal(verifyGoApprovalMatrixEvidence(structuredClone(valid), SHA).finalDisposition, "approved_for_controlled_soft_launch");
});

test("rejects stale candidate SHA and missing prerequisite evidence", () => {
  assert.throws(
    () => verifyGoApprovalMatrixEvidence(structuredClone(valid), "f".repeat(40)),
    /evidence_source_sha_invalid/,
  );

  const missingPrerequisite = structuredClone(valid);
  delete missingPrerequisite.prerequisiteEvidence["NOG-05"];
  assert.throws(() => verifyGoApprovalMatrixEvidence(missingPrerequisite, SHA), /prerequisiteEvidence_keys_invalid/);
});

test("rejects pending prerequisites, missing roles and wrong launch scope", () => {
  const pending = structuredClone(valid);
  pending.prerequisiteEvidence["NOG-08"].status = "open";
  assert.throws(() => verifyGoApprovalMatrixEvidence(pending, SHA), /prerequisiteEvidence_NOG-08_status_invalid/);

  const missingRole = structuredClone(valid);
  delete missingRole.approvalMatrix.compliance;
  assert.throws(() => verifyGoApprovalMatrixEvidence(missingRole, SHA), /approvalMatrix_keys_invalid/);

  const scopeDrift = structuredClone(valid);
  scopeDrift.releaseScope.allowedSurfaces.push("real-money-exchange");
  assert.throws(() => verifyGoApprovalMatrixEvidence(scopeDrift, SHA), /releaseScope_allowedSurfaces_invalid/);
});

test("rejects rejected approvals and approval evidence outside the governed repository", () => {
  const rejected = structuredClone(valid);
  rejected.approvalMatrix.security.decision = "rejected";
  assert.throws(() => verifyGoApprovalMatrixEvidence(rejected, SHA), /approvalMatrix_security_decision_invalid/);

  const externalUrl = structuredClone(valid);
  externalUrl.approvalMatrix.qa.approvalEvidenceUrl = "https://example.invalid/approval";
  assert.throws(() => verifyGoApprovalMatrixEvidence(externalUrl, SHA), /approvalMatrix_qa_approvalEvidenceUrl_github_repo_url_invalid/);
});

test("rejects operator self-review and raw operational material", () => {
  const selfReview = structuredClone(valid);
  selfReview.reviewer.externalIdentity = OPERATOR;
  assert.throws(() => verifyGoApprovalMatrixEvidence(selfReview, SHA), /approval_matrix_independence_invalid/);

  const leakedSecret = structuredClone(valid);
  leakedSecret.approvalMatrix.ceo.conditions.push("DATABASE_URL=postgres://ci:ci@localhost/db");
  assert.throws(() => verifyGoApprovalMatrixEvidence(leakedSecret, SHA), /contains_forbidden_material/);
});
