# PR #700 — Deep Research staging and rollback checklist

This checklist is release evidence only. It does **not** authorize merge, Staging deployment, or Production mutation.

## Candidate identity

- PR: #700
- Branch: `codex/deep-research-workspace-v1`
- Release candidate: the exact PR HEAD after this checklist commit and after all required checks are green.
- Base: `main`; require `behind_by = 0` immediately before Ready/Merge.
- Deployment artifact must be immutable and identify the exact merged release SHA through `/api/health`.

## Pre-merge gate

- [ ] Exact-head CI, Full Suite Diagnostics, API Security Manifest, Sensitive Mutation Audit, AI Tenant RLS Runtime Evidence, Public Browser Golden Path, Scheduled Operational Recovery, Repository Audit Manifest and Full History Secret Scanning are green on the same SHA.
- [ ] PR is mergeable, has no unresolved review thread, and required reviewer approval is current for the exact head.
- [ ] FA/EN routes and RTL/LTR behavior have no known parity blocker.
- [ ] Deep Research POST/DELETE remain CSRF-protected, bounded, rate-limited, replay-safe and tenant/workspace-bound.
- [ ] Provenance relations retain FORCE RLS, scoped foreign keys, finalization truth gates and finalized-artifact immutability.
- [ ] No secrets, provider credentials, Production configuration, or Production data are included in the candidate.

## Staging preflight — separate explicit authorization required

Before any Staging mutation:

1. Record exact merged release SHA and current Staging release SHA.
2. Confirm database/Redis health and current migration ledger.
3. Take the normal recoverable backup required by the TecPey release process and record its identifier/time.
4. Confirm rollback target and service configuration before running migrations.
5. Verify migration `0115_deep_research_provenance_authority.sql` is present exactly once in the governed migration registry and can be applied idempotently.
6. Keep Production untouched.

## Staging smoke evidence

After an explicitly authorized Staging deployment, record evidence for:

- `/api/health` reports the exact release SHA and healthy dependencies.
- FA and EN Deep Research pages load with correct RTL/LTR semantics.
- Unauthenticated/revoked requests fail closed.
- Missing/invalid Pro entitlement fails visibly; entitlement-authority degradation returns a degraded error rather than granting access.
- Create uses a unique idempotency key; same-key/same-payload replay is stable; same-key/different-payload conflicts.
- Cancel is tenant/account-bound, retry-safe and rejects terminal/non-owned runs.
- History and artifact reads cannot cross tenant/workspace/account boundaries.
- Factual artifact finalization fails without citations, fails for stale evidence where freshness is required, and fails for social-only evidence.
- Finalized artifacts reject update/delete mutation.
- Source links allow only HTTP(S); provenance, retrieval/published timestamps, conflicts and unknowns render without fabricated progress or claims.
- Reduced-motion, keyboard focus, touch targets and basic screen-reader states remain usable.

## Rollback decision

Rollback Staging immediately if any of these occur:

- health SHA/dependency mismatch;
- migration or RLS authority failure;
- cross-tenant/cross-run evidence leakage;
- entitlement fail-open;
- replay/idempotency corruption;
- provenance/finalization truth-gate failure;
- material FA/EN or accessibility regression that blocks the workflow.

## Rollback procedure

1. Stop promotion; do not touch Production.
2. Restore the previous Staging application release SHA using the established immutable release/symlink procedure.
3. Do **not** blindly down-migrate or drop the new provenance tables. The migration is additive; retain schema/data unless a separately reviewed database recovery plan explicitly requires restoration.
4. If database state is suspected to be unsafe, isolate Staging traffic and restore from the recorded preflight backup according to the governed recovery procedure.
5. Restart `tecpey-staging.service`, verify `/api/health` reports the rollback SHA, then run the existing Staging health/golden-path smoke.
6. Record incident evidence, failed exact SHA, rollback SHA, migration ledger state and follow-up owner before another promotion attempt.

## Production boundary

Production deployment remains a separate decision after successful Staging evidence. This checklist grants no Production authorization.
