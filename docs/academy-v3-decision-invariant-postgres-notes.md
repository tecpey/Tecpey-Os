# PostgreSQL invariant notes

The invariant is enforced by a unique B-tree index over `(tenant_id, workspace_id, attempt_id)`. The migration remains transactional and therefore deliberately does not use `CREATE INDEX CONCURRENTLY`, which PostgreSQL does not allow inside a transaction block. Existing-index metadata is validated before accepting `IF NOT EXISTS`, and the postcondition revalidates uniqueness, validity, readiness, predicate/expression absence, and exact key order.
