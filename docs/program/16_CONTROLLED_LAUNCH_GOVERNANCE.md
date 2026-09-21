# Controlled Launch Governance — candidate packet, accepted risks + Go approval matrix

**Base:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** #697, #711, #708 and all scope-specific launch tracks required by the selected candidate. Closes NOG-08/NOG-09 for the controlled education-first scope.

## Objective
Create one independently verifiable release decision packet for one immutable candidate. No scattered screenshots, stale approvals or “mostly green” claims.

## Candidate packet
- exact main SHA, tree and immutable image digest;
- migration plan hash;
- exact-head workflow/run URLs and artifact digests;
- protected staging promotion/env/recovery/incident evidence;
- browser/accessibility/performance/product-truth evidence;
- disabled-capability attestations for all out-of-scope real-money/enterprise/rewards paths;
- open blocker inventory and residual-risk register;
- rollback/forward-fix policy and current previous-known-good release identity.

## Accepted-risk governance
Each accepted risk includes:
- stable risk ID, owner role + externally attributable identity;
- exact candidate SHA/scope;
- reason acceptance is safer than immediate change;
- measurable threshold / review date / expiry;
- user communication if material;
- rollback/halt trigger;
- linked evidence URLs + SHA-256 digests.
Expired or candidate-mismatched risk acceptance fails closed.

## Go approval matrix
Independent approvals from the configured governance roles (CEO/release owner, architecture/CTO, Security, Product, Compliance, SRE, QA). Approval is candidate-specific and cannot be copied forward after code/evidence changes.

## Product-truth gate
The packet verifies public copy/UI do not imply:
- live real-money Exchange;
- production custody/deposits/withdrawals;
- public financial rewards;
- enterprise/white-label activation;
- autonomous financial AI authority,
unless their dedicated activation tracks are separately certified.

## Decision semantics
Machine-readable result is one of:
- `GO_CONTROLLED_SCOPE`
- `NO_GO_BLOCKERS`
- `NO_GO_EVIDENCE_STALE`
- `NO_GO_SCOPE_MISMATCH`
No percentage may override a missing MUST gate.

## Acceptance
Existing accepted-risk and approval verifiers pass against the exact candidate and all prerequisite evidence digests. Production remains a separate explicit decision.
