import assert from "node:assert/strict";
import test from "node:test";
import {
  exactHeadWorkflowEvidenceFindings,
  WORKFLOW_CONTRACT,
} from "./exact-head-workflow-evidence-policy.mjs";

const oldSha = "9bd4ca5ec22e99e2d7deb192826ef8c018ee4913";
const newSha = "cbbdebe0b09801c314ed0b048c6ed19873d23300";

function fixture(schemaVersion = 2) {
  const v2 = schemaVersion === 2;
  const workflowEvidence = {};
  const workflowRuns = [];
  let id = 40000000000;

  for (const [field, contract] of Object.entries(WORKFLOW_CONTRACT)) {
    if (contract.v2Only && !v2) {
      workflowEvidence[field] = null;
      continue;
    }
    const runUrl = `https://github.com/tecpey/Tecpey-Os/actions/runs/${id++}`;
    workflowEvidence[field] = runUrl;
    workflowRuns.push({
      name: contract.name,
      workflowPath: contract.path,
      event: contract.event,
      status: "completed",
      conclusion: "success",
      runUrl,
      ...(v2 ? { headSha: newSha, headBranch: "main" } : {}),
    });
  }

  return {
    schemaVersion,
    evidenceClass: "exact-head-workflow-evidence",
    decision: "NO_GO_NOG_04_ACCEPTED_EXACT_HEAD_WORKFLOW_URLS_ONLY",
    selectedSha: v2 ? newSha : oldSha,
    workflowEvidence,
    workflowRuns,
    remainingFinalManifestGaps: v2
      ? ["protected staging evidence URL and digest", "incident readiness evidence and digest"]
      : [
          "protected staging evidence URL and digest",
          "operational recovery/reconciliation evidence and digest",
          "incident readiness evidence and digest",
        ],
  };
}

function findings(evidence) {
  return exactHeadWorkflowEvidenceFindings({
    evidence,
    selectedSha: evidence.schemaVersion === 2 ? newSha : oldSha,
  });
}

test("preserves canonical historical schema v1 evidence", () => {
  assert.deepEqual(findings(fixture(1)), []);
});

test("accepts canonical schema v2 exact-SHA evidence", () => {
  assert.deepEqual(findings(fixture(2)), []);
});

test("rejects a duplicate workflow run record even when one copy is valid", () => {
  const value = fixture(2);
  value.workflowRuns.push({ ...value.workflowRuns[0] });
  assert.match(findings(value).join("\n"), /duplicate entries|exactly one workflow run record/);
});

test("rejects an extra workflow run record", () => {
  const value = fixture(2);
  value.workflowRuns.push({
    name: "Unrelated Workflow",
    event: "push",
    status: "completed",
    conclusion: "success",
    runUrl: "https://github.com/tecpey/Tecpey-Os/actions/runs/49999999999",
    headSha: newSha,
    headBranch: "main",
    workflowPath: ".github/workflows/unrelated.yml",
  });
  assert.match(findings(value).join("\n"), /workflowRuns names/);
});

test("rejects a v2 run bound to a different SHA", () => {
  const value = fixture(2);
  value.workflowRuns[0].headSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  assert.match(findings(value).join("\n"), /CI\.headSha/);
});

test("rejects a v2 run from a different workflow path", () => {
  const value = fixture(2);
  const recovery = value.workflowRuns.find((run) => run.name === "Scheduled Operational Recovery");
  recovery.workflowPath = ".github/workflows/other.yml";
  assert.match(findings(value).join("\n"), /Scheduled Operational Recovery\.workflowPath/);
});

test("rejects Scheduled Operational Recovery unless it is a governed dispatch", () => {
  const value = fixture(2);
  const recovery = value.workflowRuns.find((run) => run.name === "Scheduled Operational Recovery");
  recovery.event = "push";
  assert.match(findings(value).join("\n"), /Scheduled Operational Recovery\.event/);
});

test("rejects a duplicate run URL across different workflows", () => {
  const value = fixture(2);
  const firstField = Object.keys(WORKFLOW_CONTRACT)[0];
  const secondField = Object.keys(WORKFLOW_CONTRACT)[1];
  value.workflowEvidence[secondField] = value.workflowEvidence[firstField];
  value.workflowRuns.find((run) => run.name === WORKFLOW_CONTRACT[secondField].name).runUrl =
    value.workflowEvidence[firstField];
  assert.match(findings(value).join("\n"), /duplicate GitHub Actions run URL/);
});

test("rejects a missing v2 operational recovery record", () => {
  const value = fixture(2);
  value.workflowRuns = value.workflowRuns.filter((run) => run.name !== "Scheduled Operational Recovery");
  assert.match(findings(value).join("\n"), /workflowRuns names|Scheduled Operational Recovery/);
});

test("rejects stale operational-recovery gap after v2 evidence is accepted", () => {
  const value = fixture(2);
  value.remainingFinalManifestGaps.push("operational recovery/reconciliation evidence and digest");
  assert.match(findings(value).join("\n"), /must not retain operational recovery\/reconciliation/);
});
