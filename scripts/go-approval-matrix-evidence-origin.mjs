import { createHash } from "node:crypto";

const REPOSITORY = "tecpey/Tecpey-Os";
const ISSUE_NUMBER = 410;
const API_VERSION = "2022-11-28";
const RELEASE_SCOPE_ID = "controlled-public-fa-en-academy-mentor-arena";
const COMMENT_URL =
  /^https:\/\/github\.com\/tecpey\/Tecpey-Os\/issues\/410#issuecomment-([1-9][0-9]*)$/;

const REQUIRED_CONDITIONS = [
  "exact candidate SHA approved",
  "controlled public FA/EN, Academy, Mentor and virtual Arena only",
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

function approvalRolesFromBody(body) {
  const roleValues = String(body ?? "")
    .split(/\r?\n/)
    .flatMap((line) => {
      const normalized = line
        .trim()
        .replace(/^[-*+]\s+/, "")
        .replaceAll("**", "")
        .replaceAll("__", "")
        .replaceAll("`", "");
      const match = /^approvalRoles?:\s*(.+)$/.exec(normalized);
      return match ? [match[1]] : [];
    });

  // Multiple declarations are ambiguous and must fail closed.
  if (roleValues.length !== 1) return [];
  return roleValues[0]
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
}

export function governedGoApprovalCommentId(url) {
  const match = typeof url === "string" ? COMMENT_URL.exec(url) : null;
  return match?.[1] ?? null;
}

function groupedApprovalEvidence(evidence, findings) {
  const groups = new Map();
  for (const [matrixKey, approval] of Object.entries(evidence?.approvalMatrix ?? {})) {
    const commentId = governedGoApprovalCommentId(approval?.approvalEvidenceUrl);
    if (!commentId) {
      findings.push(`${matrixKey}: approval evidence must be an immutable issue #${ISSUE_NUMBER} comment permalink`);
      continue;
    }
    requireEqual(
      findings,
      `${matrixKey}.approvalEvidenceCommentId`,
      String(approval.approvalEvidenceCommentId),
      commentId,
    );
    const current = groups.get(commentId) ?? {
      commentId,
      url: approval.approvalEvidenceUrl,
      approver: approval.approverExternalIdentity,
      approvedAt: approval.approvedAt,
      digest: approval.evidenceDigest,
      roles: [],
    };
    requireEqual(findings, `${matrixKey}.comment.url`, approval.approvalEvidenceUrl, current.url);
    requireEqual(findings, `${matrixKey}.comment.approver`, approval.approverExternalIdentity, current.approver);
    requireEqual(findings, `${matrixKey}.comment.approvedAt`, approval.approvedAt, current.approvedAt);
    requireEqual(findings, `${matrixKey}.comment.digest`, approval.evidenceDigest, current.digest);
    current.roles.push(approval.role);
    groups.set(commentId, current);
  }
  return groups;
}

export async function goApprovalMatrixEvidenceOriginFindings({
  evidence,
  selectedSha,
  token,
  fetchImpl = globalThis.fetch,
}) {
  const findings = [];
  if (typeof token !== "string" || token.length === 0) {
    findings.push("Go approval matrix origin verification requires GITHUB_TOKEN");
    return findings;
  }
  if (typeof fetchImpl !== "function") {
    findings.push("Go approval matrix origin verification requires fetch");
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

    const login = group.approver?.startsWith("github:")
      ? group.approver.slice("github:".length)
      : "";
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
    requireEqual(findings, `${group.commentId}.origin.created_at`, remote?.created_at, group.approvedAt);
    requireEqual(findings, `${group.commentId}.origin.updated_at`, remote?.updated_at, group.approvedAt);
    requireEqual(
      findings,
      `${group.commentId}.origin.bodyDigest`,
      `sha256:${createHash("sha256").update(String(body ?? ""), "utf8").digest("hex")}`,
      group.digest,
    );

    requireBodyText(findings, `${group.commentId}.origin`, body, "NOG-09");
    requireBodyText(findings, `${group.commentId}.origin`, body, `candidateSha: ${selectedSha}`);
    requireBodyText(findings, `${group.commentId}.origin`, body, `launchScopeId: ${RELEASE_SCOPE_ID}`);
    requireBodyText(findings, `${group.commentId}.origin`, body, `approverExternalIdentity: github:${login}`);
    requireBodyText(findings, `${group.commentId}.origin`, body, "decision: approved");
    requireBodyText(
      findings,
      `${group.commentId}.origin`,
      body,
      "attestation: approved-for-controlled-soft-launch-only",
    );
    for (const role of group.roles) requireBodyText(findings, `${group.commentId}.origin`, body, role);
    for (const condition of REQUIRED_CONDITIONS) {
      requireBodyText(findings, `${group.commentId}.origin`, body, condition);
    }

    const remoteRoles = approvalRolesFromBody(body);
    if (exactSorted(remoteRoles) !== exactSorted(group.roles)) {
      findings.push(
        `${group.commentId}.origin.roles: expected exactly ${group.roles.sort().join(", ")}, got ${remoteRoles.sort().join(", ")}`,
      );
    }
  }

  return findings;
}
