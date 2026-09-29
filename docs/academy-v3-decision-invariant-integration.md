# Academy V3 decision invariant — integration gate

Target canonical migration: `0120_academy_v3_decision_invariant.sql`.
Target registry step: `migration-step-104`, dependent on step 103 by the registry's sequential dependency contract.

## Required evidence before Ready/Merge

- Canonical migration checksum is derived from the hardened decision-invariant SQL.
- Registry validation accepts sequence 104, identity, filename, checksum, and dependency chain.
- PostgreSQL proof demonstrates one committed decision row for concurrent inserts targeting the same `(tenant_id, workspace_id, attempt_id)`.
- Duplicate preflight fails closed before index creation.
- Existing index drift fails closed.
- Postcondition proves a unique, valid, ready, non-partial, non-expression three-key index in the current schema.
- Migration idempotency and governed migration-lock evidence pass.
- TypeScript, lint, unit/integration tests, production build, security manifests, browser golden path, and operational recovery checks pass on the exact final head SHA.

No merge or deployment is authorized by this document.
