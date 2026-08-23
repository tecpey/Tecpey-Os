# Operational recovery drills

Issue #110 is a program, not a single CI test. This contract separates evidence
that the repository can produce from evidence that requires protected staging,
real providers, and an independent human operator. Do not close #110 until every
protected-staging and independent-operator row has a reviewed evidence link.

## Evidence classes

- **Automated repository evidence:** exact-head, synthetic-data drills that are
  safe on GitHub-hosted runners. They prove repeatable mechanics, not production
  operations.
- **Protected staging evidence:** drills against approved staging dependencies
  and encrypted backups. A protected environment and named operator are required.
- **Independent operator:** the operator executing the runbook must not be the
  change author. Their identity, timestamps, commands, results, and incident
  references are retained in the approved evidence system.

The weekly `Scheduled Operational Recovery` workflow builds the exact `main`
image, applies the canonical migration artifact, backs up PostgreSQL and Redis,
restores into isolated volumes, and validates:

- the source and restored migration plan hashes are identical;
- a write committed before backup is present after restore;
- a write committed after the backup boundary is absent;
- both backup digests are recorded;
- measured restore time is within the five-minute CI RTO;
- no credentials or user data are included in JSON evidence.

The same recovery gate executes the real wallet `RpcClient` against bounded
fixtures. It proves a failed primary endpoint rotates to a healthy peer within
the same logical call, and that a three-failure single-endpoint circuit rejects
subsequent calls without additional network I/O.

This CI objective is not the production RPO or RTO. Production objectives require
business approval and protected-staging measurement.

## Drill matrix

| Drill | Evidence class | Owner | Expected transition and invariant | Alert / dashboard | Recovery command | Reconciliation query | Halt condition |
|---|---|---|---|---|---|---|---|
| PostgreSQL + Redis backup/restore | Automated repository evidence; weekly | SRE | `current → backup → isolated restore → current`; plan hash equal, pre-backup probe present, post-backup probe absent | Actions `Scheduled Operational Recovery` | `bash scripts/test-container-volume-recovery.sh <exact-image>` | `SELECT status, plan_hash, ledger_digest FROM _migration_runtime_state WHERE singleton = TRUE;` | Any digest, plan hash, boundary, or RTO mismatch |
| Encrypted production-like restore | Protected staging evidence | Release Operator | Ready staging → isolated restore → reconciled ready; no destructive restore into the active volume | Staging health, backup dashboard, incident timeline | Approved backup-system restore command from the protected secret store | Migration state query above plus domain reconciliation queries owned by Academy, Arena, Mentor, and Exchange | Missing backup provenance, unknown RPO boundary, or any domain mismatch |
| Migration interruption and retry | Automated migration suite + Protected staging evidence | Database Owner | `running → interrupted/failed → retry → current`; one canonical ledger, no partial unregistered step | `MIGRATION_FAILED`, readiness dashboard | `npm run db:migrate` after root cause is recorded | `SELECT filename, checksum FROM _migrations ORDER BY filename;` | Unknown applied step, checksum drift, stale lock holder, or irreversible DDL |
| PostgreSQL outage, pool exhaustion, lag, accidental deletion | Protected staging evidence | Database Owner | Ready → not-ready → repaired/restored → reconciled; writes never accepted against ambiguous authority | Database saturation/replica-lag alerts and `/api/health` | Provider-specific failover or isolated restore command | Domain count/checksum queries plus financial conservation checks | Replica position unknown, lost acknowledged writes, or conservation mismatch |
| Redis outage, split brain, stale lock, backlog, DLQ | Protected staging evidence | Queue Owner | Worker ready → halted/degraded → replay/reconcile → ready; no duplicate external effect | Redis, BullMQ backlog, DLQ, worker heartbeat dashboards | Governed worker stop, lock inspection, replay/reconcile command | Query durable PostgreSQL command/effect evidence before replay | Command outcome ambiguous, two active owners, or missing idempotency evidence |
| Worker crash before/after commit or external effect | Protected staging evidence | Domain Owner | Claimed → crash → deterministic recovery; at-most-one external effect and one final result | Worker attempts, outbox/effect and provider dashboards | Domain-specific recovery command after evidence classification | Compare command, attempt, audit, ledger, and provider reference IDs | Provider result unknown or durable state cannot distinguish pre/post effect |
| Provider timeout, 4xx/5xx, malformed response, webhook disorder | Protected staging evidence | Provider Owner | Request → bounded retry/circuit open → reconcile or halt; never guess success | Provider latency/error/circuit dashboards | Provider-specific reconcile command | Query provider idempotency/reference against local command/effect evidence | Missing provider reference, malformed signed evidence, or conflicting outcomes |
| Canary, stale client, secret rotation, kill switch | Protected staging evidence | Release Operator / Security | Previous + candidate compatibility → canary → promote or rollback; old and new schema overlap is explicit | Release, auth failure, readiness, feature-flag dashboards | Immutable image rollback or forward-fix command | Compare exact image SHA, schema plan hash, session/key version and feature-flag state | Irreversible migration, stale-client mutation incompatibility, or rotation cannot be rolled back |
| Runbook execution by non-author | Independent operator | Incident Commander | Declared incident → runbook execution → reconciliation → sign-off | Incident record and evidence links | Commands from this document and domain runbooks | Every query required by the selected drill | Author is sole operator, evidence lacks timestamps, or any ambiguity remains |

## Evidence record

Each protected drill records the exact source/image SHA, environment, named
operator and reviewer, UTC start/end, injected failure, expected and observed
state transitions, RPO boundary, measured RTO, alert/dashboard links, recovery
commands, reconciliation query outputs or digests, and final disposition.
Credentials, tokens, connection URLs, personal data, and raw customer records are
forbidden.

For NOG-05, the final protected staging domain reconciliation artifact must pass
`scripts/verify-protected-recovery-reconciliation-evidence.mjs --expected-sha
<selected-candidate-sha>`. This verifier is intentionally separate from the
ephemeral PostgreSQL/Redis restore verifier. It requires accepted reconciliation
for Academy, Trading Arena, Mentor AI, Exchange Ledger, notifications/jobs, and
tenant/principal isolation before release-owner review can treat recovery as
accepted evidence.

### NOG-05 protected staging execution

Dispatch `Protected Staging Recovery Reconciliation Evidence` from `main` with:

- `release_sha`: the exact SHA currently reported by staging `/api/health`;
- `reviewer_external_identity`: the independent reviewer's GitHub login, which
  must differ from the dispatching actor;
- `independent_review_confirmed`: `true`, only after that reviewer has approved
  the protected restore drill.

The workflow verifies the active systemd `WorkingDirectory`, health SHA,
migration status, candidate ancestry, runner identity, immutable runtime image
digest, protected environment-file permissions, and CA bundle before collection.
It starts an unprivileged, Unix-socket-only PostgreSQL cluster and an isolated
Redis process under the runner's mode-0700 temporary directory. The active
application database role therefore needs no `CREATEDB` privilege, and neither
restore can address the active service. It reconciles all six launch domains,
stops and removes both temporary targets, runs the offline verifier, and
uploads `protected-staging-recovery-reconciliation-<sha>` with a `SHA256SUMS`
binding. Do not copy database dumps, Redis RDB files, command logs, or raw rows
into the artifact. A failed or missing artifact leaves NOG-05 open.

## Ambiguity policy

If the system cannot prove whether a state mutation or provider effect occurred,
halt the affected workflow. Do not retry an external effect from memory or infer
success from a timeout. Preserve durable evidence, open an incident, execute the
domain reconciliation query, and resume only after a named owner records a
deterministic disposition.
