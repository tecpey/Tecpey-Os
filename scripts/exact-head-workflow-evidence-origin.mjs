import {
  canonicalGovernedRunUrl,
  governedRunId,
  WORKFLOW_CONTRACT,
} from "./exact-head-workflow-evidence-policy.mjs";

const REPOSITORY = "tecpey/Tecpey-Os";
const API_VERSION = "2022-11-28";

function requireEqual(findings, label, actual, expected) {
  if (actual !== expected) {
    findings.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export async function exactHeadWorkflowEvidenceOriginFindings({
  evidence,
  selectedSha,
  token,
  fetchImpl = globalThis.fetch,
}) {
  const findings = [];
  if (evidence?.schemaVersion !== 2) return findings;

  if (typeof fetchImpl !== "function") {
    findings.push("schema v2 exact-head evidence origin verification requires fetch");
    return findings;
  }

  for (const [field, contract] of Object.entries(WORKFLOW_CONTRACT)) {
    const evidenceUrl = evidence?.workflowEvidence?.[field];
    const runId = governedRunId(evidenceUrl);
    if (!runId) {
      findings.push(`${contract.name}: cannot attest malformed governed run URL`);
      continue;
    }

    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
    };
    if (typeof token === "string" && token.length > 0) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response;
    try {
      response = await fetchImpl(
        `https://api.github.com/repos/${REPOSITORY}/actions/runs/${runId}`,
        { headers },
      );
    } catch (error) {
      findings.push(
        `${contract.name}: GitHub Actions origin lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    if (!response?.ok) {
      findings.push(
        `${contract.name}: GitHub Actions origin lookup returned HTTP ${response?.status ?? "unknown"}`,
      );
      continue;
    }

    let remote;
    try {
      remote = await response.json();
    } catch (error) {
      findings.push(
        `${contract.name}: GitHub Actions origin response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    requireEqual(findings, `${contract.name}.origin.id`, String(remote?.id ?? ""), runId);
    requireEqual(findings, `${contract.name}.origin.name`, remote?.name, contract.name);
    requireEqual(findings, `${contract.name}.origin.path`, remote?.path, contract.path);
    requireEqual(findings, `${contract.name}.origin.event`, remote?.event, contract.event);
    requireEqual(findings, `${contract.name}.origin.status`, remote?.status, "completed");
    requireEqual(findings, `${contract.name}.origin.conclusion`, remote?.conclusion, "success");
    requireEqual(findings, `${contract.name}.origin.head_sha`, remote?.head_sha, selectedSha);
    requireEqual(findings, `${contract.name}.origin.head_branch`, remote?.head_branch, "main");
    requireEqual(findings, `${contract.name}.origin.repository`, remote?.repository?.full_name, REPOSITORY);
    requireEqual(
      findings,
      `${contract.name}.origin.html_url`,
      canonicalGovernedRunUrl(remote?.html_url),
      canonicalGovernedRunUrl(evidenceUrl),
    );

    const localRun = Array.isArray(evidence?.workflowRuns)
      ? evidence.workflowRuns.find((candidate) => candidate?.name === contract.name)
      : null;
    requireEqual(findings, `${contract.name}.local.headSha`, localRun?.headSha, remote?.head_sha);
    requireEqual(findings, `${contract.name}.local.headBranch`, localRun?.headBranch, remote?.head_branch);
    requireEqual(findings, `${contract.name}.local.workflowPath`, localRun?.workflowPath, remote?.path);
    requireEqual(findings, `${contract.name}.local.event`, localRun?.event, remote?.event);
    requireEqual(findings, `${contract.name}.local.status`, localRun?.status, remote?.status);
    requireEqual(findings, `${contract.name}.local.conclusion`, localRun?.conclusion, remote?.conclusion);
  }

  return findings;
}
