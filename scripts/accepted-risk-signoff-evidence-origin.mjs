import { createHash } from "node:crypto";

const REPOSITORY = "tecpey/Tecpey-Os";
const ISSUE_NUMBER = 409;
const API_VERSION = "2022-11-28";
const RELEASE_SCOPE_ID = "controlled-public-fa-en-academy-mentor-arena";
const COMMENT_URL =
  /^https:\/\/github\.com\/tecpey\/Tecpey-Os\/issues\/409#issuecomment-([1-9][0-9]*)$/;

const REQUIRED_RISK_CONDITIONS = [
  "exact candidate SHA accepted",
  "controlled public FA/EN, Academy, Mentor and virtual Arena only",
  "risk thresholds and rollback triggers from docs/LAUNCH_ACCEPTED_RISKS.md accepted",
  "real-money Exchange remains disabled",
  "custody deposits withdrawals remain disabled",
  "enterprise white-label public rewards remain disabled",
];

function requireEqual(findings, label, actual, expected) {
  if (actual !== expected) {
    findings.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function requireBodyText(findings, label, body, expected) {
  if (!String(body).includes(expected)) findings.push(`${label}: approval body is missing ${expected}`);
}

function exactSorted(values) {
  return JSON.stringify([...values].sort());
}

export function governedAcceptedRiskCommentId(url) {
  const match = typeof url === "string" ? COMMENT_URL.exec(url) : null;
  return match?.[1] ?? null;
}

function groupedApprovalEvidence(evidence, findings) {
  const groups = new Map();
  for (const [risk, signoff] of Object.entries(evidence?.riskOwnerSignoffs ?? {})) {
    const commentId = governedAcceptedRiskCommentId(signoff?.acceptanceEvidenceUrl);
    if (!commentId) {
      findings.push(`${risk}: acceptance evidence must be an immutable issue #${ISSUE_NUMBER} comment permalink`);
      continue;
    }
    requireEqual(findings, `${risk}.acceptanceEvidenceCommentId`, String(signoff.acceptanceEvidenceCommentId), commentId);
    const current = groups.get(commentId) ?? {
      commentId,
      url: signoff.acceptanceEvidenceUrl,
      owner: signoff.approvalOwnerExternalIdentity,
      digest: signoff.evidenceDigest,
      risks: [],
      signoffs: [],
    };
    requireEqual(findings, `${risk}.comment.url`, signoff.acceptanceEvidenceUrl, current.url);
    requireEqual(findings, `${risk}.comment.owner`, signoff.approvalOwnerExternalIdentity, current.owner);
    requireEqual(findings, `${risk}.comment.digest`, signoff.evidenceDigest, current.digest);
    current.risks.push(risk);
    current.signoffs.push(signoff);
    groups.set(commentId, current);
  }
  return groups;
}

export async function acceptedRiskSignoffEvidenceOriginFindings({
  evidence,
  selectedSha,
  token,
  fetchImpl = globalThis.fetch,
}) {
  const findings = [];
  if (typeof token !== "string" || token.length === 0) {
    findings.push("accepted-risk approval origin verification requires GITHUB_TOKEN");
    return findings;
  }
  if (typeof fetchImpl !== "function") {
    findings.push("accepted-risk approval origin verification requires fetch");
    return findings;
  }

  const groups = groupedApprovalEvidence(evidence, findings);
  for (const group of groups.values()) {
    let response;
    try {
      response = await fetchImpl(
        `https://api.github.com/repos/${REPOSITORY}/issues/comments/${group.commentId}`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": API_VERSION,
          },
        },
      );
    } catch (error) {
      findings.push(
        `${group.commentId}: GitHub approval origin lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    if (!response?.ok) {
      findings.push(`${group.commentId}: GitHub approval origin lookup returned HTTP ${response?.status ?? "unknown"}`);
      continue;
    }

    let remote;
    try {
      remote = await response.json();
    } catch (error) {
      findings.push(
        `${group.commentId}: GitHub approval origin response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    const login = group.owner?.startsWith("github:") ? group.owner.slice("github:".length) : "";
    const body = remote?.body;
    requireEqual(findings, `${group.commentId}.origin.id`, String(remote?.id ?? ""), group.commentId);
    requireEqual(findings, `${group.commentId}.origin.html_url`, remote?.html_url, group.url);
    requireEqual(
      findings,
      `${group.commentId}.origin.issue_url`,
      remote?.issue_url,
      `https://api.github.com/repos/${REPOSITORY}/issues/${ISSUE_NUMBER}`,
    );
    requireEqual(findings, `${group.commentId}.origin.author`, remote?.user?.login, login);
    requireEqual(
      findings,
      `${group.commentId}.origin.bodyDigest`,
      `sha256:${createHash("sha256").update(String(body ?? ""), "utf8").digest("hex")}`,
      group.digest,
    );

    requireBodyText(findings, `${group.commentId}.origin`, body, "NOG-08 OWNER SIGN-OFF");
    requireBodyText(findings, `${group.commentId}.origin`, body, `GitHub identity: @${login}`);
    requireBodyText(findings, `${group.commentId}.origin`, body, `Candidate SHA: ${selectedSha}`);
    requireBodyText(findings, `${group.commentId}.origin`, body, `Launch scope: ${RELEASE_SCOPE_ID}`);
    requireBodyText(
      findings,
      `${group.commentId}.origin`,
      body,
      `Risk-register digest: ${evidence?.riskRegister?.digest}`,
    );
    requireBodyText(findings, `${group.commentId}.origin`, body, "Decision: accepted");
    requireBodyText(
      findings,
      `${group.commentId}.origin`,
      body,
      "Attestation: accepted-risk-register-approved-for-controlled-soft-launch-only",
    );
    for (const condition of REQUIRED_RISK_CONDITIONS) {
      requireBodyText(findings, `${group.commentId}.origin`, body, condition);
    }

    const coveredLine = /^Covered risks:\s*(.+)$/m.exec(String(body ?? ""));
    const remoteRisks = coveredLine?.[1].match(/R-\d{2}/g) ?? [];
    if (exactSorted(remoteRisks) !== exactSorted(group.risks)) {
      findings.push(
        `${group.commentId}.origin.coveredRisks: expected exactly ${group.risks.sort().join(", ")}, got ${remoteRisks.sort().join(", ")}`,
      );
    }
    for (const signoff of group.signoffs) {
      requireBodyText(findings, `${group.commentId}.origin`, body, signoff.risk);
      requireBodyText(findings, `${group.commentId}.origin`, body, signoff.reviewDate);
      for (const role of signoff.accountableOwners ?? []) {
        requireBodyText(findings, `${group.commentId}.origin`, body, role);
      }
    }
  }

  return findings;
}
