import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVE_RECOLLECTION_FILES,
  candidateEvidenceRecollectionFileSelectionFindings,
  candidateEvidenceRecollectionFindings,
  REQUIRED_WORKFLOWS,
} from "./candidate-evidence-recollection-policy.mjs";

const oldSha = "9bd4ca5ec22e99e2d7deb192826ef8c018ee4913";
const newSha = "cbbdebe0b09801c314ed0b048c6ed19873d23300";
const open = ["NOG-01", "NOG-02", "NOG-05", "NOG-07", "NOG-08", "NOG-09"];
const recollected = ["NOG-03", "NOG-04", "NOG-06"];
const boundaries = [
  "real-money Exchange",
  "custody/deposits/withdrawals",
  "enterprise",
  "white-label",
  "public rewards",
];
const evidencePaths = {
  "NOG-03": "docs/launch/generated/runtime-image-digest-evidence-20260812.json",
  "NOG-04": "docs/launch/generated/exact-head-workflow-evidence-20260812.json",
  "NOG-06": "docs/launch/generated/rollback-volume-restore-evidence-20260812.json",
};
const requestPrivacy = [
  "record run URLs, artifact identifiers, digests, release identifiers and dispositions only",
  "do not record raw secrets, database URLs, host IPs, customer data, raw logs, private keys, provider payloads or prompt transcripts",
];
const promotionPrivacy = [
  "state contains release identifiers, blocker IDs, status and policy text only",
  "no secrets, database URLs, host IPs, customer data, raw logs, private keys, provider payloads or prompt transcripts",
];
const promotionAfterAcceptance = [
  "re-read main and active PRs immediately before promotion",
  "verify selectedSha is still the newest stable runtime/security/bundle/launch-control target",
  "atomically align CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md and generated current candidate ledger",
  "atomically align protected-staging runbook, request and No-Go register",
  "replace pending NOG-03/NOG-04/NOG-06 state only with genuine exact-selectedSha evidence using acceptance schema v2",
  "run launch candidate, evidence authority, staging evidence, launch decision and full CI gates",
];
const requiredBeforePromotion = [
  "re-read main immediately before final promotion commit",
  "recollect genuine exact-head workflow evidence for the proposed exact SHA",
  "recollect genuine runtime image digest evidence for the proposed exact SHA",
  "recollect genuine rollback/volume-restore evidence for the proposed exact SHA",
  "record all newly accepted evidence using acceptance schema v2 with explicit exact-SHA workflow binding",
  "atomically align human and JSON candidate ledgers, protected-staging request/runbook/register and evidence-authority checks",
  "keep protected execution blocked until the aligned promotion state is CI-valid",
];
const promotionCompletedChecks = [
  "exact-head workflow evidence schema v2 accepted for the selected SHA",
  "runtime image digest evidence accepted for the selected SHA",
  "rollback and volume-restore evidence accepted for the selected SHA",
  "candidate and protected-staging lineage aligned to the selected SHA",
  "remaining operational blockers remain open",
  "real-money and expanded-scope launch boundaries remain disabled",
];

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
            "each workflow record includes headSha equal to selectedSha and its governed workflow path",
            "Scheduled Operational Recovery must use governed workflow_dispatch on main and resolve headSha equal to selectedSha",
            "PR-head run URLs from 6c2bcbbc7c7e32fa00cbff2c3583507f4eda5b5c, 6145c03bdee9da4d06b781175a60b63d38cba568, 60691da0e1c45d7e6c5ea9aed4558e391f38db71 or 32799a79ea9bdee4c7f99f1cba385149723f14d6 are not accepted as exact-candidate evidence for selectedSha",
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
            "workflow record includes headSha equal to selectedSha and refs/heads/main",
            "artifact metadata is not copied or relabelled from the historical 9bd4ca5 candidate",
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
            "workflow record includes headSha equal to selectedSha and refs/heads/main",
            "artifact metadata is not copied or relabelled from the historical 9bd4ca5 candidate",
          ],
        },
      },
      stillOpenBlockers: [...open],
      launchDisabledBoundaries: [...boundaries],
      promotionAfterAcceptance: [...promotionAfterAcceptance],
      privacyBoundary: [...requestPrivacy],
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
      requiredBeforePromotion: [...requiredBeforePromotion],
      privacyBoundary: [...promotionPrivacy],
    },
  };
}

function promotedFixture() {
  const value = fixture();
  value.request.decision = "NO_GO_NOG_03_04_06_RECOLLECTED_AND_ACCEPTED";
  value.request.protectedExecutionAllowed = true;
  for (const blocker of recollected) {
    value.request.requiredEvidence[blocker].status = "accepted_exact_selected_sha_evidence";
  }
  value.request.acceptedEvidence = recollected.map((id) => ({ id, evidence: evidencePaths[id] }));

  value.promotionState.status = "promoted_exact_candidate_evidence";
  value.promotionState.currentAcceptedCandidateSha = newSha;
  value.promotionState.protectedExecutionAllowed = true;
  value.promotionState.staleAcceptedEvidence = [];
  value.promotionState.acceptedRecollectedEvidence = recollected.map((id) => ({
    id,
    evidence: evidencePaths[id],
  }));
  value.promotionState.promotionCompletedChecks = [...promotionCompletedChecks];
  return value;
}

function canonicalGeneratedFiles() {
  return [
    "current-controlled-launch-candidate.json",
    ACTIVE_RECOLLECTION_FILES.request,
    ACTIVE_RECOLLECTION_FILES.promotionState,
    "exact-head-workflow-evidence-20260812.json",
  ];
}

test("accepts the exact fail-closed recollection contract", () => {
  assert.deepEqual(candidateEvidenceRecollectionFindings(fixture()), []);
});

test("accepts a terminal promoted state only with exact recollected evidence", () => {
  assert.deepEqual(candidateEvidenceRecollectionFindings(promotedFixture()), []);
});

test("accepts exactly the canonical dated recollection files", () => {
  assert.deepEqual(
    candidateEvidenceRecollectionFileSelectionFindings(canonicalGeneratedFiles()),
    [],
  );
});

test("rejects an additional dated recollection request", () => {
  const files = canonicalGeneratedFiles();
  files.push("candidate-evidence-recollection-request-20260822.json");
  assert.match(
    candidateEvidenceRecollectionFileSelectionFindings(files).join("\n"),
    /active recollection request files/,
  );
});

test("rejects replacement of the active promotion-state filename", () => {
  const files = canonicalGeneratedFiles().filter(
    (name) => name !== ACTIVE_RECOLLECTION_FILES.promotionState,
  );
  files.push("candidate-promotion-state-20260822.json");
  assert.match(
    candidateEvidenceRecollectionFileSelectionFindings(files).join("\n"),
    /active promotion state files/,
  );
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
  assert.match(
    candidateEvidenceRecollectionFindings(value).join("\n"),
    /NOG-06\.requireExactSelectedSha/,
  );
});

test("rejects reopening protected execution during recollection", () => {
  const value = fixture();
  value.request.protectedExecutionAllowed = true;
  assert.match(
    candidateEvidenceRecollectionFindings(value).join("\n"),
    /protectedExecutionAllowed/,
  );
});

test("rejects a promoted state that leaves protected execution blocked", () => {
  const value = promotedFixture();
  value.promotionState.protectedExecutionAllowed = false;
  assert.match(candidateEvidenceRecollectionFindings(value).join("\n"), /protectedExecutionAllowed/);
});

test("rejects promoted evidence that is missing an accepted blocker", () => {
  const value = promotedFixture();
  value.request.acceptedEvidence.pop();
  assert.match(candidateEvidenceRecollectionFindings(value).join("\n"), /request\.acceptedEvidence/);
});

test("rejects promoted evidence path substitution", () => {
  const value = promotedFixture();
  value.promotionState.acceptedRecollectedEvidence[0].evidence = "docs/launch/generated/fake.json";
  assert.match(
    candidateEvidenceRecollectionFindings(value).join("\n"),
    /acceptedRecollectedEvidence\.NOG-03\.evidence/,
  );
});

test("rejects promoted state without the full completion checklist", () => {
  const value = promotedFixture();
  value.promotionState.promotionCompletedChecks.pop();
  assert.match(candidateEvidenceRecollectionFindings(value).join("\n"), /promotionCompletedChecks/);
});

test("rejects silent removal of a launch-disabled boundary", () => {
  const value = fixture();
  value.promotionState.launchDisabledBoundaries.pop();
  assert.match(
    candidateEvidenceRecollectionFindings(value).join("\n"),
    /launchDisabledBoundaries/,
  );
});

test("rejects legacy acceptance schema for the next candidate", () => {
  const value = fixture();
  value.request.requiredAcceptanceSchemaVersion = 1;
  assert.match(
    candidateEvidenceRecollectionFindings(value).join("\n"),
    /requiredAcceptanceSchemaVersion/,
  );
});

test("rejects privacy text that reverses a prohibition while retaining sensitive tokens", () => {
  const value = fixture();
  value.request.privacyBoundary = [
    requestPrivacy[0],
    "record raw secrets, database URLs, host IPs, customer data, raw logs, private keys, provider payloads or prompt transcripts",
  ];
  assert.match(
    candidateEvidenceRecollectionFindings(value).join("\n"),
    /request\.privacyBoundary/,
  );
});

test("rejects promotion-state privacy drift", () => {
  const value = fixture();
  value.promotionState.privacyBoundary = [
    promotionPrivacy[0],
    "sensitive evidence may include raw logs when convenient",
  ];
  assert.match(
    candidateEvidenceRecollectionFindings(value).join("\n"),
    /promotionState\.privacyBoundary/,
  );
});

test("rejects acceptance prose with reversed semantics even when old tokens remain", () => {
  const value = fixture();
  value.request.requiredEvidence["NOG-03"].acceptance[0] =
    "container runtime image is not built from selectedSha";
  assert.match(candidateEvidenceRecollectionFindings(value).join("\n"), /NOG-03\.acceptance/);
});

test("rejects removal of a required post-acceptance promotion gate", () => {
  const value = fixture();
  value.request.promotionAfterAcceptance.pop();
  assert.match(
    candidateEvidenceRecollectionFindings(value).join("\n"),
    /request\.promotionAfterAcceptance/,
  );
});

test("rejects removal of a required pre-promotion evidence gate", () => {
  const value = fixture();
  value.promotionState.requiredBeforePromotion.pop();
  assert.match(
    candidateEvidenceRecollectionFindings(value).join("\n"),
    /promotionState\.requiredBeforePromotion/,
  );
});
