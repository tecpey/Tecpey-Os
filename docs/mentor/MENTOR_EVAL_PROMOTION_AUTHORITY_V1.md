# Mentor Eval Promotion Authority v1

## Purpose

Mentor model, prompt, retrieval-policy and provider-route changes are not promotion-ready because they look fluent. Promotion is evidence-bound.

Every finalized evaluation run is persisted as immutable, tenant/workspace-scoped evidence bound to the exact candidate Git commit and tree, provider, requested/actual model, prompt hash, trust/evidence/eval policy versions, dataset hash/version, evaluator version and measured gate results.

## Non-negotiable rules

- No raw production conversation, prompt, KYC, portfolio or secret is stored as eval evidence.
- Safety, privacy and citation hard gates cannot be averaged away by helpfulness.
- Missing metrics fail closed.
- Metrics that require a measured baseline fail closed without one.
- Evidence is append-only. A rerun creates a new run; it never edits history.
- The database enforces tenant/workspace isolation with FORCE RLS and the signed AI tenant context.
- A promotion verdict is meaningful only for the exact candidate SHA/tree and evidence versions recorded by the run.

## Evaluation layers

1. Deterministic bilingual adversarial corpus for secrets, injection, acute safety and public-research privacy.
2. Frozen offline provider/model evaluation for curriculum grounding, citation quality, pedagogy and locale parity.
3. Staging learning-transfer evidence such as next unaided item correctness plus end-to-end latency against a measured baseline.
4. Continuous post-change evaluation whenever model, prompt, retrieval, tool, trust-policy or routing behavior changes.

## Stored evidence

The ai_mentor_eval_runs row stores only bounded identifiers and hashes. ai_mentor_eval_metric_results stores normalized metric outcomes, thresholds, sample counts and baseline/candidate measurements. Both tables reject UPDATE and DELETE.

A pass is not an authorization for real trading or any external financial effect. Mentor remains educational; external-effect capabilities stay separately governed.

## Promotion check

Consumers should query the latest evidence for the exact candidate SHA and require release_decision = pass. A missing, stale or differently-bound run is not promotion evidence.

The Command Center should expose this evidence read-only in a later UI slice; the database contract is the authority.
