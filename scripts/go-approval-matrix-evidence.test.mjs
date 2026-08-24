import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { goApprovalMatrixEvidenceOriginFindings } from "./go-approval-matrix-evidence-origin.mjs";
import { verifyGoApprovalMatrixEvidence } from "./verify-go-approval-matrix-evidence.mjs";

const SHA = "a".repeat(40);
const HASH = "b".repeat(64);
const RELEASE_SCOPE_ID = "controlled-public-fa-en-academy-mentor-arena";
const EVIDENCE_URL = "https://github.com/tecpey/Tecpey-Os/actions/runs/623456789";
const OPERATOR = "release-operator:protected-staging";
const CONDITIONS = [
  "exact candidate SHA approved",
  "controlled public FA/EN, Academy, Mentor and virtual Arena only",
  "real-money Exchange remains disabled",
  "custody deposits withdrawals remain disabled",
  "enterprise white-label public rewards remain disabled",
];

const comments = {
  tecpey: { id: "101", roles: ["CEO", "Product", "Compliance"], approvedAt: "2026-08-24T06:38:10Z" },
  mvexhiiii: { id: "102", roles: ["CTO or Chief Architect", "Security", "SRE"], approvedAt: "2026-08-24T06:39:56Z" },
  tecpeysup: { id: "103", roles: ["QA"], approvedAt: "2026-08-24T06:40:50Z" },
};

function participant(role, externalIdentity) {
  return { role, externalIdentity };
}

function prerequisite(id) {
  return { id, status: "accepted", evidenceUrl: EVIDENCE_URL, evidenceDigest: `sha256:${HASH}` };
}

function commentBody(login) {
  const comment = comments[login];
  const roleField = comment.roles.length === 1 ? "approvalRole" : "approvalRoles";
  return [
    `NOG-09 ${login === "tecpeysup" ? "independent " : "role "}approval — ${comment.roles.join(" / ")}`,
    "",
    `- candidateSha: ${SHA}`,
    `- launchScopeId: ${RELEASE_SCOPE_ID}`,
    `- approverExternalIdentity: github:${login}`,
    `- ${roleField}: ${comment.roles.join(", ")}`,
    "- decision: approved",
    "- attestation: approved-for-controlled-soft-launch-only",
    "",
    "I approve the exact candidate under these conditions:",
    ...CONDITIONS.map((condition) => `- ${condition}`),
  ].join("\n");
}

function approval(role, login) {
  const comment = comments[login];
  const body = commentBody(login);
  return {
    role,
    approverExternalIdentity: `github:${login}`,
    approvedAt: comment.approvedAt,
    candidateSha: SHA,
    launchScopeId: RELEASE_SCOPE_ID,
    decision: "approved",
    approvalEvidenceType: "github-issue-comment",
    approvalEvidenceCommentId: Number(comment.id),
    approvalEvidenceUrl: `https://github.com/tecpey/Tecpey-Os/issues/410#issuecomment-${comment.id}`,
    evidenceDigest: `sha256:${createHash("sha256").update(body, "utf8").digest("hex")}`,
    attestation: "approved-for-controlled-soft-launch-only",
    conditions: [...CONDITIONS],
  };
}

const valid = {
  schemaVersion: 2,
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
    ceo: approval("CEO", "tecpey"),
    ctoOrChiefArchitect: approval("CTO or Chief Architect", "mvexhiiii"),
    security: approval("Security", "mvexhiiii"),
    product: approval("Product", "tecpey"),
    compliance: approval("Compliance", "tecpey"),
    sre: approval("SRE", "mvexhiiii"),
    qa: approval("QA", "tecpeysup"),
  },
  releaseOwner: participant("Release Owner", "github:tecpey"),
  operator: participant("Release Operator", OPERATOR),
  reviewer: participant("Independent Approval Reviewer", "github:tecpeysup"),
  privacyBoundary: [
    "redacted-evidence-only",
    "no-secrets-or-connection-urls",
    "no-host-ips",
    "no-raw-logs",
    "no-customer-data",
  ],
  finalDisposition: "approved_for_controlled_soft_launch",
};

function githubPayload(login) {
  const comment = comments[login];
  return {
    id: Number(comment.id),
    html_url: `https://github.com/tecpey/Tecpey-Os/issues/410#issuecomment-${comment.id}`,
    issue_url: "https://api.github.com/repos/tecpey/Tecpey-Os/issues/410",
    user: { login },
    created_at: comment.approvedAt,
    updated_at: comment.approvedAt,
    body: commentBody(login),
  };
}

function githubFetch(overrides = {}) {
  return async (url) => {
    const id = String(url).split("/").pop();
    const login = Object.entries(comments).find(([, comment]) => comment.id === id)?.[0];
    const payload = { ...githubPayload(login), ...(overrides[id] ?? {}) };
    return { ok: true, status: 200, async json() { return payload; } };
  };
}

test("accepts complete Go approval matrix evidence", () => {
  assert.equal(
    verifyGoApprovalMatrixEvidence(structuredClone(valid), SHA).finalDisposition,
    "approved_for_controlled_soft_launch",
  );
});

test("attests immutable Go approval issue comments by author and body digest", async () => {
  assert.deepEqual(
    await goApprovalMatrixEvidenceOriginFindings({
      evidence: structuredClone(valid), selectedSha: SHA, token: "test-token", fetchImpl: githubFetch(),
    }),
    [],
  );
});

test("accepts GitHub list-marker and emphasis formatting for the exact role declaration", async () => {
  const evidence = structuredClone(valid);
  const body = commentBody("tecpey").replace(
    "- approvalRoles: CEO, Product, Compliance",
    "* **approvalRoles:** CEO, Product, Compliance",
  );
  const digest = `sha256:${createHash("sha256").update(body, "utf8").digest("hex")}`;
  for (const approval of Object.values(evidence.approvalMatrix)) {
    if (approval.approverExternalIdentity === "github:tecpey") approval.evidenceDigest = digest;
  }

  assert.deepEqual(
    await goApprovalMatrixEvidenceOriginFindings({
      evidence, selectedSha: SHA, token: "test-token", fetchImpl: githubFetch({ "101": { body } }),
    }),
    [],
  );
});

test("rejects ambiguous duplicate role declarations", async () => {
  const evidence = structuredClone(valid);
  const body = `${commentBody("tecpey")}\n- approvalRoles: CEO, Product, Compliance`;
  const digest = `sha256:${createHash("sha256").update(body, "utf8").digest("hex")}`;
  for (const approval of Object.values(evidence.approvalMatrix)) {
    if (approval.approverExternalIdentity === "github:tecpey") approval.evidenceDigest = digest;
  }

  const findings = await goApprovalMatrixEvidenceOriginFindings({
    evidence, selectedSha: SHA, token: "test-token", fetchImpl: githubFetch({ "101": { body } }),
  });
  assert.ok(findings.some((finding) => finding.includes("5391626720.origin.roles") || finding.includes("101.origin.roles")));
});

test("rejects Go approval origin verification without GitHub token", async () => {
  assert.match(
    (await goApprovalMatrixEvidenceOriginFindings({ evidence: valid, selectedSha: SHA, token: "" }))[0],
    /requires GITHUB_TOKEN/,
  );
});

test("rejects edited or wrongly attributed Go approval comments", async () => {
  const findings = await goApprovalMatrixEvidenceOriginFindings({
    evidence: structuredClone(valid),
    selectedSha: SHA,
    token: "test-token",
    fetchImpl: githubFetch({
      "102": {
        user: { login: "someone-else" },
        body: `${commentBody("mvexhiiii")}\nedited`,
        updated_at: "2026-08-24T07:00:00Z",
      },
    }),
  });
  assert.ok(findings.some((finding) => finding.includes("origin.author")));
  assert.ok(findings.some((finding) => finding.includes("origin.updated_at")));
  assert.ok(findings.some((finding) => finding.includes("origin.bodyDigest")));
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

test("rejects rejected approvals and mutable approval evidence URLs", () => {
  const rejected = structuredClone(valid);
  rejected.approvalMatrix.security.decision = "rejected";
  assert.throws(() => verifyGoApprovalMatrixEvidence(rejected, SHA), /approvalMatrix_security_decision_invalid/);
  const mutableUrl = structuredClone(valid);
  mutableUrl.approvalMatrix.qa.approvalEvidenceUrl = "https://github.com/tecpey/Tecpey-Os/issues/410";
  assert.throws(() => verifyGoApprovalMatrixEvidence(mutableUrl, SHA), /approvalMatrix_qa_approvalEvidenceUrl_invalid/);
});

test("rejects operator self-review and raw operational material", () => {
  const selfReview = structuredClone(valid);
  selfReview.reviewer.externalIdentity = OPERATOR;
  assert.throws(() => verifyGoApprovalMatrixEvidence(selfReview, SHA), /approval_matrix_independence_invalid/);
  const leakedSecret = structuredClone(valid);
  leakedSecret.approvalMatrix.ceo.conditions.push("DATABASE_URL=postgres://ci:ci@localhost/db");
  assert.throws(() => verifyGoApprovalMatrixEvidence(leakedSecret, SHA), /contains_forbidden_material/);
});
