# Execution order

1. Canonicalize migration 0120 from the hardened SQL constant.
2. Register step 104 after step 103 using the same runner.
3. Validate registry/checksum/dependency invariants.
4. Run PostgreSQL concurrency proof and migration idempotency.
5. Require all exact-head CI/security/operational gates before changing Draft status.
6. Do not merge or deploy as part of this reconstruction phase.
