# Operations: protected recovery + incident readiness closure

**Base:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** #697 protected staging promotion/environment authority. Closes operational evidence for NOG-05 and NOG-07; feeds #712 final launch decision.

## Objective
Convert the already-strong repository recovery/incident contracts into accepted **protected-host execution evidence** for the exact release candidate, without leaking raw customer/secret material.

## Existing authority to reuse
- `docs/operations/RECOVERY_RECONCILIATION_CONTRACT.md`
- `docs/operations/INCIDENT_READINESS_CONTRACT.md`
- protected staging recovery/incident workflows and verifiers
- exact tenant/principal registry and financial-conservation queries

## Deliverables
- exact active staging SHA + migration plan hash bound into every recovery artifact;
- protected PostgreSQL snapshot/isolated restore + Redis restore; never restore into active authorities;
- domain reconciliation for Academy, Arena, Mentor AI, Exchange ledger, notifications/jobs, tenant/principal isolation;
- deterministic counts/hashes only; raw rows, URLs, secrets, prompts and private keys prohibited;
- RPO/RTO measured and compared to policy;
- two synthetic critical alert probes with delivery latency evidence, zero pending/quarantine afterward;
- P0 acknowledgement drill with incident commander + SRE owner and independent reviewer;
- explicit first responder/escalation/halt/user-communication owner for DB, Redis, migrations, providers, workers, alerts and reconciliation;
- artifact digest verification + machine-readable acceptance summary;
- candidate-specific closure record for NOG-05/NOG-07; historical evidence cannot close a newer SHA.

## Failure tests
- source/restore count or digest drift;
- tenant registry drift;
- financial invariant mismatch;
- missing reviewer/role separation;
- RTO breach;
- alert delivery timeout/pending/quarantine;
- evidence containing forbidden raw material;
- cleanup failure of isolated restore targets;
- active database/Redis mutation attempt.

## Acceptance
Protected staging evidence passes existing verifiers for one exact active candidate. Repository simulations remain necessary but cannot substitute for protected-host proof.

## Boundary
This track proves operational readiness for controlled Academy/Mentor/virtual-Arena launch only. It does not certify production real-money Exchange/custody.
