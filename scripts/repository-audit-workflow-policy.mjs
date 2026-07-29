const EXACT_SHA_EXPRESSION = "${{ github.event.pull_request.head.sha || github.sha }}";
const PINNED_ACTION = /^[a-z0-9_.-]+\/[a-z0-9_.-]+@[0-9a-f]{40}(?:\s+#\s+v?\S+)?$/i;

export function repositoryAuditWorkflowFindings(workflowSource) {
  const findings = [];
  if (typeof workflowSource !== "string" || workflowSource.length === 0) {
    return ["workflow source is empty"];
  }
  if (!workflowSource.includes(`ref: ${EXACT_SHA_EXPRESSION}`)) {
    findings.push("checkout must bind to the pull-request head SHA or push SHA");
  }
  if (!workflowSource.includes(`TECPEY_AUDIT_SOURCE_SHA: ${EXACT_SHA_EXPRESSION}`)) {
    findings.push("manifest generation must receive the exact expected source SHA");
  }
  if (!workflowSource.includes("persist-credentials: false")) {
    findings.push("checkout credentials must not persist");
  }
  if (/^\s*GITHUB_SHA\s*:/m.test(workflowSource)) {
    findings.push("reserved GITHUB_SHA must not be overridden");
  }
  if (!workflowSource.includes("npm run audit:manifest:check")) {
    findings.push("workflow authority guard is missing");
  }
  if (!workflowSource.includes("npm run audit:manifest:verify")) {
    findings.push("exact manifest verification is missing");
  }
  if (!workflowSource.includes(`repository-audit-manifest-${EXACT_SHA_EXPRESSION}`)) {
    findings.push("artifact name must include the exact source SHA");
  }

  for (const line of workflowSource.split(/\r?\n/)) {
    const uses = /^\s*uses:\s*(.+?)\s*$/.exec(line)?.[1];
    if (uses && !PINNED_ACTION.test(uses)) {
      findings.push(`action is not pinned to a full commit SHA: ${uses}`);
    }
  }
  return findings;
}

export function assertRepositoryAuditWorkflow(workflowSource) {
  const findings = repositoryAuditWorkflowFindings(workflowSource);
  if (findings.length > 0) {
    throw new Error(`Repository audit workflow authority failed:\n- ${findings.join("\n- ")}`);
  }
}
