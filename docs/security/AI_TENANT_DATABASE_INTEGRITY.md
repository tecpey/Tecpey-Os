# AI tenant database authority

## Release decision

Migration `0096_ai_tenant_row_level_security.sql` implements the database
boundary for the managed AI control plane. It does **not** open managed AI.
The code-owned launch decision remains:

```text
NO-GO: ai_tenant_isolation_unresolved:signed_rls_runtime_evidence_pending
```

Removing this blocker requires protected exact-head CI evidence with the real
restricted login roles, staging canaries, production role/key provisioning and
security review on the same release candidate. No environment variable or
operator flag can override it. The exact legacy exception remains limited to
the environment-configured `mentor_coach` at `tecpey/main`; a managed binding
closes that exception.

## Protected PostgreSQL 16 runtime evidence

The required CI proof is implemented by
`.github/workflows/ai-tenant-rls-runtime-evidence.yml`. It runs only for the
stacked RLS pull request on the exact pull-request head and is gated by the
`ai-tenant-rls-evidence` GitHub Environment. That environment must require
independent reviewer approval before the job can start; approving the job does
not mark the pull request ready and does not authorize merge or deployment.

The job checks out and re-verifies the exact commit and tree, starts the pinned
PostgreSQL 16 image, applies the governed migrations, creates disposable
least-privilege tenant and worker logins, and runs
`src/tests/security/ai-tenant-rls-postgres.test.ts` with an explicit TAP
reporter. Admission requires zero failed tests and **zero skipped tests**.

After the adversarial suite passes, the collector queries PostgreSQL catalogs
directly and emits only bounded aggregate evidence:

- all 19 governed tables have both `ENABLE ROW LEVEL SECURITY` and
  `FORCE ROW LEVEL SECURITY`, with at least one policy each;
- tenant/worker group and login roles cannot create databases or roles,
  replicate, become `SUPERUSER`, or use `BYPASSRLS`; group roles are
  `NOLOGIN NOINHERIT` and disposable login roles are `LOGIN INHERIT`;
- the complete membership graph touching those four roles contains only the
  two governed PostgreSQL 16 grants, each exactly `INHERIT TRUE`, `SET FALSE`,
  and `ADMIN FALSE`;
- the worker's complete direct ACL snapshot is exact: `USAGE` on `public`,
  `SELECT` on `_migration_runtime_state` and the two queue relations, only the
  enumerated queue write columns, exactly the three quorum-read columns
  `run_id`, `review_kind`, and `decision`, no directly granted routine, and no
  executable `SECURITY DEFINER` routine;
- the runtime test log and all authority sources are SHA-256 bound to the exact
  head and tree.

The raw TAP log, database URLs, HMAC material, credentials and row data are not
published. The accepted JSON is verified offline against its detached SHA-256
file and then becomes the subject of a GitHub OIDC artifact attestation via
`actions/attest-build-provenance`. The uploaded artifact contains only the
redacted JSON, detached digest and bounded verifier summary.

A successful protected run is necessary evidence, but it does not
automatically remove `signed_rls_runtime_evidence_pending`. A separate
evidence-admission review must bind the attestation URL and digest to the
unchanged exact head, prove the required staging canaries and production
role/key provisioning, and then update the launch policy in a new reviewed
commit. Until that admission is complete, managed AI remains NO-GO.

## Authority model

| Process | Database authority | Required configuration | Explicitly forbidden |
|---|---|---|---|
| Web/API | tenant runtime only | `TECPEY_AI_TENANT_DATABASE_URL`, context key and version | worker or migration credential |
| AI worker | bounded cross-tenant queue role plus tenant runtime for the selected scope | both AI URLs, context key/version, `TECPEY_DATABASE_PROCESS_ROLE=ai_worker` | migration credential |
| Migration/key operator | schema owner outside runtime | `TECPEY_DATABASE_MIGRATION_URL` (preferred) | serving requests or claiming work |
| CI | ephemeral equivalents of both runtime roles | deterministic non-production fixture credentials | reuse outside the disposable CI database |

The tenant and worker URLs are rejected if their host, port, database and
username identify the same principal as each other, `DATABASE_URL`, or the
migration URL. Every transaction also proves that `current_user=session_user`,
the login is non-superuser, `NOBYPASSRLS`, cannot create a database/role or
replicate, uses a canonical lowercase/underscore PostgreSQL identifier, and has
exactly one authorized role membership. The expected group
role is independently rechecked as tagged `NOLOGIN`, `NOINHERIT`, non-superuser
and `NOBYPASSRLS`, and must own no SQL object. PostgreSQL 16 membership is
required to be exactly one `INHERIT TRUE`, `SET FALSE`, `ADMIN FALSE` grant, so
the login receives the allowlisted privileges but cannot assume or delegate the
group identity. Privilege drift on either layer therefore fails closed.
Runtime startup fails if it can create objects in `public`, obtain any table-
or column-level access to the HMAC/admin/audit relations, or execute any of the
three privileged bridge functions outside its role contract.

The managed group roles are tagged TecPey-owned `NOLOGIN` roles. Migration
fails on a pre-existing untagged role name rather than adopting a potentially
privileged role. It also removes inherited memberships from those group roles
and revokes `CREATE` on the `public` schema from `PUBLIC`. The PostgreSQL
verifier and worker policies independently deny a login that is ever made a
member of both groups, so a role-provisioning error fails closed at the database
layer as well as in Node.

## Signed transaction context

Tenant-facing queries run only inside `withAiTenantTransaction`. After `BEGIN`
and schema/role verification, the runtime signs this newline-delimited message:

```text
tecpey-ai-context-v1
<key-version>
tenant_v1
<tenant-id>
<workspace-id>
<session-user>
<backend-pid>
<transaction-id>
```

The five context values are installed with transaction-local
`set_config(..., true)`. `tecpey_ai_authorized_context()` is a protected
`SECURITY DEFINER` verifier that reads the active key version, recomputes the
HMAC-SHA-256 and returns the tenant/workspace pair only on an exact match. Every
tenant RLS policy compares its row pair with that verified pair.

The verifier qualifies `public.hmac(bytea,bytea,text)` and migration proves
that exact overload is owned by the installed `pgcrypto` extension. A
same-named pre-existing function or an extension installed in an unexpected
schema aborts the migration before any policy claim is accepted.

Binding the signature to `session_user`, `pg_backend_pid()` and
`txid_current()` prevents a captured signature from being replayed on another
connection or transaction. `SET LOCAL` prevents a committed or rolled-back
scope from leaking through a pooled connection. Arbitrary custom GUC values
alone grant no access. The verifier compares keyed transforms of the expected
and supplied signatures so PostgreSQL byte comparison cannot expose a useful
prefix-timing oracle.

Before role/schema evidence is read, every tenant and worker transaction also
sets `row_security=on` and fixes the transaction-local search path to
`pg_catalog, public, pg_temp`. Catalog functions and governed public relations
therefore resolve before any same-named temporary object, while rollback or
pool reuse removes the guardrail together with the tenant context.

This boundary protects against a stolen database login, raw-GUC spoofing,
cross-tenant application query mistakes and pool residue. It does not claim to
contain a full compromise of the web/worker process that can read the HMAC
secret and execute arbitrary application code. Process isolation, secret
management, egress controls and host hardening remain separate controls.

## Forced row policies

All 19 relations use `ENABLE ROW LEVEL SECURITY` and
`FORCE ROW LEVEL SECURITY`:

- control plane: `ai_provider_configs`, `ai_provider_config_events`,
  `ai_agent_bindings`, `ai_agent_usage_daily`, `ai_agent_binding_events`,
  `ai_knowledge_items`, `ai_knowledge_item_events`,
  `ai_workflow_run_evidence`;
- automation: `ai_provider_quota_snapshots`, `ai_automation_policies`,
  `ai_automation_policy_events`, `ai_automation_runs`,
  `ai_automation_reviews`, `ai_automation_run_events`;
- budget/routing: `ai_agent_spend_monthly`, `ai_spend_reservations`,
  `ai_routing_decision_events`, `ai_agent_route_candidates`,
  `ai_agent_route_candidate_events`.

The tenant role receives only the operations used by scoped stores. The worker
has no policy on provider, agent, knowledge, quota, budget or routing tables.
Its cross-tenant policies are limited to selecting due policies/runs, reading
only `run_id`, `review_kind` and `decision` for the transition-quorum trigger,
updating schedule timestamps and lease/status columns, inserting scheduled runs
with an enabled matching policy snapshot, and appending a matching run event.
Column-level grants prevent the worker from reading review summaries/evidence
or changing scope, inputs, policy snapshots, approvals, execution connector
evidence or financial state.

Composite foreign keys from migrations `0091` through `0095` remain a second
line of defense: child evidence must bind to the same tenant/workspace parent,
scope-leading idempotency stays intact, and append-only triggers continue to
reject historical rewrites.

## Admin audit bridge

Tenant runtime roles cannot read or write `admin_users`, `admin_sessions`,
`admin_user_roles` or `admin_audit_events` directly. A security-barrier view
exposes only active roles in the signed tenant/workspace. Two bounded
`SECURITY DEFINER` functions lock the global audit chain and append a pre-hashed
AI event only after validating:

- signed tenant/workspace context;
- active actor and live, permission-version-current session in that scope;
- an exact, database-reconstructed set of currently assigned effective roles;
- AI-only action/resource namespaces and bounded redacted payloads;
- the current global previous hash under a transaction advisory lock.

This preserves the existing global tamper-evident chain without granting the
AI runtime direct access to global admin identity or audit tables.

## Migration operations

Migration `0096` is one atomic transaction with a 10-second lock timeout and a
120-second statement timeout. Enabling and forcing RLS requires table locks; a
busy relation therefore aborts and rolls back the complete migration instead
of leaving a partially protected schema or waiting indefinitely. Operators
must inspect long-running transactions, drain the affected AI control-plane
traffic, retry through the canonical migration job and verify the pinned plan
hash. They must not raise the timeout or apply individual statements by hand as
a shortcut around the release gate.

## Context-key lifecycle

`tecpey_ai_context_authority_keys` stores 32-byte keys by integer version. The
table is inaccessible to both runtime roles. Key material, version, activation
and creation time are immutable; rows cannot be deleted, revocation cannot be
reversed and a previously bounded expiry cannot be extended.

Rotation is overlap-first:

1. Generate a new 32-byte random key in the approved secret manager and assign
   a never-before-used version.
2. Through a parameterized migration-operator transaction, insert the same key
   version into the authority table with an optional future `activated_at`.
   Never pass key material in command-line arguments or logs.
3. Deploy the new base64 key/version to the web and worker secret scopes. Keep
   the previous database row active while old processes and connections drain.
4. Prove signed reads/writes and replay rejection on canaries, then set a
   non-extendable expiry or `revoked_at` on the previous version.
5. Retain the revoked row as audit evidence. Never reuse or overwrite a version.

The checked-in CI key is an ephemeral deterministic fixture only. Production
must use secret-manager delivery and a distinct key per environment.

## Required evidence

`src/tests/security/ai-tenant-rls-postgres.test.ts` must run without skips
after migration and CI role provisioning. It proves:

- all 19 relations have forced policies using the signed verifier;
- runtime logins are mutually exclusive, non-privileged and cannot read the
  key/admin tables or create public objects;
- tenant A cannot read or write tenant B rows through unqualified queries;
- forged/captured GUC signatures fail, including after rollback on a
  one-connection pool;
- the worker can see only its cross-tenant queue surface;
- the scoped audit bridge appends valid global-chain evidence and rejects a
  cross-scope actor.

Local environments without PostgreSQL intentionally report these cases as
skipped and are not release evidence. CI provisions the two ephemeral login
roles after migration, runs the full suite with the worker URL only in the test
step, and keeps worker authority out of web/build processes. Staging must repeat
tenant A/B read/write/replay tests with production-equivalent role topology and
record the exact candidate SHA before this release gate can be reconsidered.
