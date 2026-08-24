import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { acceptedRiskSignoffEvidenceOriginFindings } from "./accepted-risk-signoff-evidence-origin.mjs";
import { verifyAcceptedRiskSignoffEvidence } from "./verify-accepted-risk-signoff-evidence.mjs";

const SHA = "a".repeat(40);
const HASH = "b".repeat(64);
const RELEASE_SCOPE_ID = "controlled-public-fa-en-academy-mentor-arena";
const OPERATOR = "release-operator:accepted-risk-evidence";
const REVIEWER = "qa-reviewer:accepted-risk-signoff";

const risks = ["R-01", "R-02", "R-04", "R-05", "R-06", "R-07", "R-08", "R-09", "R-10"];

const riskOwners = {
  "R-01": ["CPO", "Academy Director"],
  "R-02": ["CTO", "Chief Architect"],
  "R-04": ["SRE Lead", "DevSecOps Lead"],
  "R-05": ["SRE Lead", "Wallet Engineer"],
  "R-06": ["Academy Director", "Chief Security Officer"],
  "R-07": ["Chief Financial Systems Architect", "CTO"],
  "R-08": ["CPO", "Growth Lead"],
  "R-09": ["CTO", "SRE Lead"],
  "R-10": ["Wallet Engineer", "Chief Financial Systems Architect"],
};

function participant(role, externalIdentity) {
  return { role, externalIdentity };
}

function approvalOwner(risk) {
  if (["R-01", "R-08"].includes(risk)) return "github:product-risk-owner";
  if (["R-04", "R-05", "R-09"].includes(risk)) return "github:sre-risk-owner";
  if (["R-07", "R-10"].includes(risk)) return "github:financial-risk-owner";
  if (risk === "R-06") return "github:security-risk-owner";
  return "github:architecture-risk-owner";
}

function approvalCommentId(risk) {
  const owner = approvalOwner(risk);
  return {
    "github:product-risk-owner": 51000000001,
    "github:sre-risk-owner": 51000000002,
    "github:financial-risk-owner": 51000000003,
    "github:security-risk-owner": 51000000004,
    "github:architecture-risk-owner": 51000000005,
  }[owner];
}

function signoff(risk) {
  const commentId = approvalCommentId(risk);
  return {
    risk,
    accountableOwners: riskOwners[risk],
    approvalOwnerExternalIdentity: approvalOwner(risk),
    approvedAt: "2026-08-12T12:10:00Z",
    candidateSha: SHA,
    launchScopeId: RELEASE_SCOPE_ID,
    decision: "accepted",
    reviewDate: risk === "R-08" ? "2026-08-23" : "2026-08-16",
    acceptanceEvidenceUrl: `https://github.com/tecpey/Tecpey-Os/issues/409#issuecomment-${commentId}`,
    acceptanceEvidenceType: "github-issue-comment",
    acceptanceEvidenceCommentId: commentId,
    evidenceDigest: `sha256:${HASH}`,
    attestation: "accepted-risk-register-approved-for-controlled-soft-launch-only",
    conditions: [
      "exact candidate SHA accepted",
      "controlled public FA/EN, Academy, Mentor and virtual Arena only",
      "risk thresholds and rollback triggers from docs/LAUNCH_ACCEPTED_RISKS.md accepted",
      "real-money Exchange remains disabled",
      "custody deposits withdrawals remain disabled",
      "enterprise white-label public rewards remain disabled",
    ],
  };
}

const valid = {
  schemaVersion: 2,
  authority: "tecpey-accepted-risk-owner-signoff-v1",
  evidenceClass: "controlled-soft-launch-accepted-risk-owner-signoff",
  decision: "ACCEPTED_RISKS_SIGNED_OFF_FOR_CONTROLLED_SCOPE",
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
  riskRegister: {
    path: "docs/LAUNCH_ACCEPTED_RISKS.md",
    digest: `sha256:${HASH}`,
    candidateSha: SHA,
    referenceDate: "2026-08-12",
    minimumReviewDate: "2026-08-16",
    coveredRisks: risks,
    supersededRisks: ["R-03"],
    freshnessPolicy: "fail-closed-if-any-review-date-is-stale-before-go",
  },
  riskOwnerSignoffs: Object.fromEntries(risks.map((risk) => [risk, signoff(risk)])),
  releaseOwner: participant("Release Owner", "github:mannan-vajihi"),
  operator: participant("Release Operator", OPERATOR),
  reviewer: participant("Independent Accepted-Risk Reviewer", REVIEWER),
  privacyBoundary: [
    "redacted-evidence-only",
    "no-secrets-or-connection-urls",
    "no-host-ips",
    "no-raw-logs",
    "no-customer-data",
  ],
  finalDisposition: "accepted",
};

test("accepts complete accepted-risk owner signoff evidence", () => {
  assert.equal(verifyAcceptedRiskSignoffEvidence(structuredClone(valid), SHA).finalDisposition, "accepted");
});

test("rejects stale candidate SHA and missing risk owner signoff", () => {
  assert.throws(
    () => verifyAcceptedRiskSignoffEvidence(structuredClone(valid), "f".repeat(40)),
    /evidence_source_sha_invalid/,
  );

  const missingRisk = structuredClone(valid);
  delete missingRisk.riskOwnerSignoffs["R-07"];
  assert.throws(() => verifyAcceptedRiskSignoffEvidence(missingRisk, SHA), /riskOwnerSignoffs_keys_invalid/);
});

test("rejects stale review date and wrong launch scope", () => {
  const staleReview = structuredClone(valid);
  staleReview.riskOwnerSignoffs["R-04"].reviewDate = "2026-08-15";
  assert.throws(() => verifyAcceptedRiskSignoffEvidence(staleReview, SHA), /riskOwnerSignoffs_R-04_review_date_stale/);

  const scopeDrift = structuredClone(valid);
  scopeDrift.releaseScope.allowedSurfaces.push("real-money-exchange");
  assert.throws(() => verifyAcceptedRiskSignoffEvidence(scopeDrift, SHA), /releaseScope_allowedSurfaces_invalid/);
});

test("rejects rejected owner signoff and evidence outside the governed repository", () => {
  const rejected = structuredClone(valid);
  rejected.riskOwnerSignoffs["R-06"].decision = "rejected";
  assert.throws(() => verifyAcceptedRiskSignoffEvidence(rejected, SHA), /riskOwnerSignoffs_R-06_decision_invalid/);

  const externalUrl = structuredClone(valid);
  externalUrl.riskOwnerSignoffs["R-10"].acceptanceEvidenceUrl = "https://example.invalid/signoff";
  assert.throws(
    () => verifyAcceptedRiskSignoffEvidence(externalUrl, SHA),
    /riskOwnerSignoffs_R-10_acceptanceEvidenceUrl_github_issue_comment_url_invalid/,
  );
});

test("rejects operator self-approval and raw operational material", () => {
  const selfApproval = structuredClone(valid);
  selfApproval.riskOwnerSignoffs["R-01"].approvalOwnerExternalIdentity = OPERATOR;
  assert.throws(
    () => verifyAcceptedRiskSignoffEvidence(selfApproval, SHA),
    /accepted_risk_signoff_independence_invalid/,
  );

  const leakedSecret = structuredClone(valid);
  leakedSecret.riskOwnerSignoffs["R-02"].conditions.push("DATABASE_URL=postgres://ci:ci@localhost/db");
  assert.throws(() => verifyAcceptedRiskSignoffEvidence(leakedSecret, SHA), /contains_forbidden_material/);
});

function originFixture() {
  const evidence = structuredClone(valid);
  const comments = new Map();
  const groups = new Map();
  for (const [risk, signoffEntry] of Object.entries(evidence.riskOwnerSignoffs)) {
    const group = groups.get(signoffEntry.acceptanceEvidenceCommentId) ?? [];
    group.push({ risk, signoff: signoffEntry });
    groups.set(signoffEntry.acceptanceEvidenceCommentId, group);
  }
  for (const [commentId, group] of groups) {
    const login = group[0].signoff.approvalOwnerExternalIdentity.slice("github:".length);
    const roles = [...new Set(group.flatMap(({ signoff: entry }) => entry.accountableOwners))];
    const body = [
      "NOG-08 OWNER SIGN-OFF",
      "",
      `GitHub identity: @${login}`,
      `Covered risks: ${group.map(({ risk }) => risk).join(", ")}`,
      `Accountable roles accepted: ${roles.join(" + ")}`,
      `Candidate SHA: ${SHA}`,
      `Launch scope: ${RELEASE_SCOPE_ID}`,
      `Risk-register digest: ${evidence.riskRegister.digest}`,
      `Review dates: ${group.map(({ risk, signoff: entry }) => `${risk} — ${entry.reviewDate}`).join("; ")}`,
      "Decision: accepted",
      "Attestation: accepted-risk-register-approved-for-controlled-soft-launch-only",
      "",
      "Conditions accepted:",
      ...group[0].signoff.conditions.map((condition) => `* ${condition}`),
    ].join("\n");
    const digest = `sha256:${createHash("sha256").update(body, "utf8").digest("hex")}`;
    for (const { signoff: entry } of group) entry.evidenceDigest = digest;
    comments.set(String(commentId), {
      id: commentId,
      html_url: group[0].signoff.acceptanceEvidenceUrl,
      issue_url: "https://api.github.com/repos/tecpey/Tecpey-Os/issues/409",
      user: { login },
      body,
    });
  }
  return { evidence, comments };
}

function originFetch(comments, mutate = (comment) => comment) {
  return async (url, options) => {
    assert.equal(options?.headers?.Authorization, "Bearer test-token");
    assert.equal(options?.headers?.["X-GitHub-Api-Version"], "2022-11-28");
    const commentId = String(url).split("/").at(-1);
    const comment = comments.get(commentId);
    assert.ok(comment, `unexpected comment id ${commentId}`);
    return { ok: true, status: 200, async json() { return mutate(structuredClone(comment), commentId); } };
  };
}

test("attests immutable accepted-risk issue comments by author and body digest", async () => {
  const { evidence, comments } = originFixture();
  assert.deepEqual(
    await acceptedRiskSignoffEvidenceOriginFindings({
      evidence,
      selectedSha: SHA,
      token: "test-token",
      fetchImpl: originFetch(comments),
    }),
    [],
  );
});

test("rejects accepted-risk origin verification without GitHub token", async () => {
  const { evidence, comments } = originFixture();
  assert.match(
    (await acceptedRiskSignoffEvidenceOriginFindings({
      evidence,
      selectedSha: SHA,
      token: "",
      fetchImpl: originFetch(comments),
    })).join("\n"),
    /requires GITHUB_TOKEN/,
  );
});

test("rejects edited or wrongly attributed accepted-risk approval comments", async () => {
  const { evidence, comments } = originFixture();
  const findings = await acceptedRiskSignoffEvidenceOriginFindings({
    evidence,
    selectedSha: SHA,
    token: "test-token",
    fetchImpl: originFetch(comments, (comment, commentId) => {
      if (commentId === "51000000001") comment.body += "\nedited after approval";
      if (commentId === "51000000002") comment.user.login = "unexpected-author";
      return comment;
    }),
  });
  assert.match(findings.join("\n"), /origin\.bodyDigest/);
  assert.match(findings.join("\n"), /origin\.author/);
});
