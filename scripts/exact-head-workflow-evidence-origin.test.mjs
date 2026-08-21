import assert from "node:assert/strict";
import test from "node:test";
import { exactHeadWorkflowEvidenceOriginFindings } from "./exact-head-workflow-evidence-origin.mjs";
import { governedRunId, WORKFLOW_CONTRACT } from "./exact-head-workflow-evidence-policy.mjs";

const selectedSha = "cbbdebe0b09801c314ed0b048c6ed19873d23300";

function fixture() {
  const workflowEvidence = {};
  const workflowRuns = [];
  let id = 41000000000;
  for (const [field, contract] of Object.entries(WORKFLOW_CONTRACT)) {
    const runUrl = `https://github.com/tecpey/Tecpey-Os/actions/runs/${id++}`;
    workflowEvidence[field] = runUrl;
    workflowRuns.push({
      name: contract.name,
      workflowPath: contract.path,
      event: contract.event,
      status: "completed",
      conclusion: "success",
      runUrl,
      headSha: selectedSha,
      headBranch: "main",
    });
  }
  return {
    schemaVersion: 2,
    workflowEvidence,
    workflowRuns,
  };
}

function contractByRunId(evidence) {
  const map = new Map();
  for (const [field, contract] of Object.entries(WORKFLOW_CONTRACT)) {
    map.set(governedRunId(evidence.workflowEvidence[field]), contract);
  }
  return map;
}

function mockFetchFor(evidence, overridesByRunId = new Map()) {
  const contracts = contractByRunId(evidence);
  return async (url, options) => {
    assert.equal(options?.headers?.Authorization, "Bearer test-token");
    assert.equal(options?.headers?.["X-GitHub-Api-Version"], "2022-11-28");
    const runId = String(url).split("/").at(-1);
    const contract = contracts.get(runId);
    assert.ok(contract, `unexpected run id ${runId}`);
    const override = overridesByRunId.get(runId) ?? {};
    return {
      ok: override.ok ?? true,
      status: override.status ?? 200,
      async json() {
        if (override.jsonError) throw new Error("invalid-json");
        return {
          id: Number(runId),
          name: contract.name,
          path: contract.path,
          event: contract.event,
          status: "completed",
          conclusion: "success",
          head_sha: selectedSha,
          head_branch: "main",
          repository: { full_name: "tecpey/Tecpey-Os" },
          html_url: `https://github.com/tecpey/Tecpey-Os/actions/runs/${runId}`,
          ...override.payload,
        };
      },
    };
  };
}

test("accepts schema v2 only when every run is attested by GitHub origin", async () => {
  const evidence = fixture();
  assert.deepEqual(
    await exactHeadWorkflowEvidenceOriginFindings({
      evidence,
      selectedSha,
      token: "test-token",
      fetchImpl: mockFetchFor(evidence),
    }),
    [],
  );
});

test("historical schema v1 does not introduce live GitHub dependency", async () => {
  assert.deepEqual(
    await exactHeadWorkflowEvidenceOriginFindings({
      evidence: { schemaVersion: 1 },
      selectedSha,
      token: "",
      fetchImpl: null,
    }),
    [],
  );
});

test("rejects schema v2 verification without GitHub token", async () => {
  const evidence = fixture();
  assert.match(
    (
      await exactHeadWorkflowEvidenceOriginFindings({
        evidence,
        selectedSha,
        token: "",
        fetchImpl: mockFetchFor(evidence),
      })
    ).join("\n"),
    /requires GITHUB_TOKEN/,
  );
});

test("rejects a stale GitHub run relabelled with the selected SHA", async () => {
  const evidence = fixture();
  const firstRunId = governedRunId(evidence.workflowEvidence.ciRunUrl);
  const overrides = new Map([
    [firstRunId, { payload: { head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } }],
  ]);
  assert.match(
    (
      await exactHeadWorkflowEvidenceOriginFindings({
        evidence,
        selectedSha,
        token: "test-token",
        fetchImpl: mockFetchFor(evidence, overrides),
      })
    ).join("\n"),
    /CI\.origin\.head_sha|CI\.local\.headSha/,
  );
});

test("rejects GitHub origin from the wrong workflow path", async () => {
  const evidence = fixture();
  const recoveryId = governedRunId(evidence.workflowEvidence.operationalRecoveryRunUrl);
  const overrides = new Map([
    [recoveryId, { payload: { path: ".github/workflows/untrusted.yml" } }],
  ]);
  assert.match(
    (
      await exactHeadWorkflowEvidenceOriginFindings({
        evidence,
        selectedSha,
        token: "test-token",
        fetchImpl: mockFetchFor(evidence, overrides),
      })
    ).join("\n"),
    /Scheduled Operational Recovery\.origin\.path/,
  );
});

test("rejects GitHub origin lookup HTTP failure", async () => {
  const evidence = fixture();
  const firstRunId = governedRunId(evidence.workflowEvidence.ciRunUrl);
  const overrides = new Map([[firstRunId, { ok: false, status: 404 }]]);
  assert.match(
    (
      await exactHeadWorkflowEvidenceOriginFindings({
        evidence,
        selectedSha,
        token: "test-token",
        fetchImpl: mockFetchFor(evidence, overrides),
      })
    ).join("\n"),
    /CI: GitHub Actions origin lookup returned HTTP 404/,
  );
});

test("normalizes the GitHub html_url trailing slash when proving origin", async () => {
  const evidence = fixture();
  const firstRunId = governedRunId(evidence.workflowEvidence.ciRunUrl);
  evidence.workflowEvidence.ciRunUrl += "/";
  evidence.workflowRuns.find((run) => run.name === "CI").runUrl += "/";
  const overrides = new Map([
    [firstRunId, { payload: { html_url: `https://github.com/tecpey/Tecpey-Os/actions/runs/${firstRunId}` } }],
  ]);
  assert.deepEqual(
    await exactHeadWorkflowEvidenceOriginFindings({
      evidence,
      selectedSha,
      token: "test-token",
      fetchImpl: mockFetchFor(evidence, overrides),
    }),
    [],
  );
});
