import assert from "node:assert/strict";
import test from "node:test";
import { candidateEvidenceRecollectionFindings, REQUIRED_WORKFLOWS } from "./candidate-evidence-recollection-policy.mjs";

const oldSha = "9bd4ca5ec22e99e2d7deb192826ef8c018ee4913";
const newSha = "cbbdebe0b09801c314ed0b048c6ed19873d23300";
const open = ["NOG-01", "NOG-02", "NOG-05", "NOG-07", "NOG-08", "NOG-09"];
const boundaries = ["real-money Exchange", "custody/deposits/withdrawals", "enterprise", "white-label", "public rewards"];

function fixture() {
  return {
    request: {
      schemaVersion: 1,
      evidenceClass: "controlled-launch-candidate-evidence-recollection-request",
      issue: 515,
      decision: "NO_GO_PENDING_NOG_03_04_06_RECOLLECTION",
      selectedSha: newSha,
      sourceBranch: "main",
      sourcePullRequest: 522,
      protectedExecutionAllowed: false,
      requiredAcceptanceSchemaVersion: 2,
      requiredEvidence: {
        "NOG-04": {
          status: "pending_recollection",
          requireExactSelectedSha: true,
          requiredWorkflows: [...REQUIRED_WORKFLOWS],
          acceptance: [
            "each workflow run is bound to selectedSha",
            "each workflow run event is push or an explicitly governed exact-SHA dispatch",
            "each workflow completed successfully",
            "each workflow uses a distinct governed GitHub Actions run URL",
            "each workflow record includes headSha equal to selectedSha",
            "Scheduled Operational Recovery must use governed workflow_dispatch on main and resolve headSha equal to selectedSha",
          ],
        },
        "NOG-03": {
          status: "pending_recollection",
          requireExactSelectedSha: true,
          workflow: "Container Supply Chain",
          acceptance: [
            "container runtime image is built from selectedSha",
            "immutable image digest is recorded",
            "container evidence artifact and detached digest are recorded",
            "signature or governed verification disposition is recorded",
            "workflow record includes headSha equal to selectedSha",
            "artifact metadata is not copied or relabelled from historical evidence",
          ],
        },
        "NOG-06": {
          status: "pending_recollection",
          requireExactSelectedSha: true,
          workflow: "Container Supply Chain",
          job: "Ephemeral staging rollback and volume restore",
          acceptance: [
            "rollback job is bound to selectedSha",
            "candidate image is served before rollback",
            "previous release is served after rollback",
            "PostgreSQL and Redis restore evidence is attached",
            "artifact digest and verifier disposition are recorded",
            "workflow record includes headSha equal to selectedSha",
            "artifact metadata is not copied or relabelled from historical evidence",
          ],
        },
      },
      stillOpenBlockers: [...open],
      launchDisabledBoundaries: [...boundaries],
      privacyBoundary: [
        "do not record raw secrets, database URLs, host IPs, customer data, raw logs, private keys, provider payloads or prompt transcripts",
      ],
    },
    promotionState: {
      schemaVersion: 1,
      evidenceClass: "controlled-launch-candidate-promotion-state",
      issue: 515,
      status: "pending_evidence_recollection",
      currentAcceptedCandidateSha: oldSha,
      proposedCandidate: { sha: newSha, sourceBranch: "main", sourcePullRequest: 522 },
      protectedExecutionAllowed: false,
      requiredAcceptanceSchemaVersion: 2,
      staleAcceptedEvidence: [{ id: "NOG-03" }, { id: "NOG-04" }, { id: "NOG-06" }],
      stillOpenBlockers: [...open],
      launchDisabledBoundaries: [...boundaries],
    },
  };
}

test("accepts the exact fail-closed recollection contract", () => {
  assert.deepEqual(candidateEvidenceRecollectionFindings(fixture()), []);
});

test("rejects a request retargeted away from the proposed candidate", () => {
  const value = fixture();
  value.request.selectedSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  assert.match(candidateEvidenceRecollectionFindings(value).join("\n"), /request\.selectedSha/);
});

test("rejects removal of Scheduled Operational Recovery", () => {
  const value = fixture();
  value.request.requiredEvidence["NOG-04"].requiredWorkflows.pop();
  assert.match(candidateEvidenceRecollectionFindings(value).join("\n"), /requiredWorkflows/);
});

test("rejects weakening exact-SHA binding", () => {
  const value = fixture();
  value.request.requiredEvidence["NOG-06"].requireExactSelectedSha = false;
  assert.match(candidateEvidenceRecollectionFindings(value).join("\n"), /NOG-06\.requireExactSelectedSha/);
});

test("rejects reopening protected execution during recollection", () => {
  const value = fixture();
  value.request.protectedExecutionAllowed = true;
  assert.match(candidateEvidenceRecollectionFindings(value).join("\n"), /protectedExecutionAllowed/);
});

test("rejects silent removal of a launch-disabled boundary", () => {
  const value = fixture();
  value.promotionState.launchDisabledBoundaries.pop();
  assert.match(candidateEvidenceRecollectionFindings(value).join("\n"), /launchDisabledBoundaries/);
});

test("rejects legacy acceptance schema for the next candidate", () => {
  const value = fixture();
  value.request.requiredAcceptanceSchemaVersion = 1;
  assert.match(candidateEvidenceRecollectionFindings(value).join("\n"), /requiredAcceptanceSchemaVersion/);
});
