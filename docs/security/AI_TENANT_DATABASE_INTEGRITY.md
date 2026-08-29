# AI tenant database integrity

## Enforced database boundaries

Migrations `0091_ai_control_plane.sql` and `0094_ai_routing_budget.sql`
bind child evidence to the complete owning scope, rather than trusting callers
to repeat matching identifiers:

- `ai_knowledge_item_events (tenant_id, workspace_id, knowledge_item_id)`
  references the same tuple on `ai_knowledge_items`;
- workflow evidence uniqueness is
  `(tenant_id, workspace_id, run_id, status)`, so independent workspaces do not
  collide while duplicate evidence inside one workspace still raises `23505`;
- routing decisions bind
  `(tenant_id, workspace_id, agent_id, spend_reservation_id)` to the same tuple
  on `ai_spend_reservations`; cross-workspace and cross-agent references raise
  `23503`;
- spend reservations cannot be deleted, and their existing transition trigger
  prevents scope, amount, idempotency or creation-time tampering.

The PostgreSQL integration contract
`src/tests/security/ai-tenant-database-integrity.test.ts` exercises the `23503`,
`23505` and append-only rejection paths against a migrated test database.

## Why RLS is deliberately not active yet

The 19 tenant/workspace-scoped AI tables are not given placeholder policies in
this change. Current runtime evidence makes activation unsafe:

1. `src/lib/db.ts` creates both web and worker connections from the same
   `DATABASE_URL`; there is no separate least-privilege web role, cross-tenant
   worker role and non-login migration-owner role.
2. `withDb` and `withTx` accept no tenant/workspace context and do not install a
   validated transaction-local PostgreSQL setting before the first statement.
3. Automation workers intentionally claim work across tenants. A policy bound
   to one request tenant would disable that queue path. A permissive worker
   policy would provide no tenant isolation.
4. PostgreSQL table owners and roles with `BYPASSRLS` bypass ordinary RLS.
   Enabling policies without proving ownership separation and `FORCE ROW LEVEL
   SECURITY` would create a false security claim.

Composite keys prevent cross-scope references, but they do not isolate reads or
independent writes made through the shared database role. The controlled-launch
decision is therefore:

```text
NO-GO: ai_tenant_isolation_unresolved:shared_role_without_transaction_tenant_context
```

`src/lib/ai/managed-ai-launch-policy.ts` now supplies that separately reviewed
release containment. It is code-owned, has no environment/operator override,
and blocks managed provider/agent/route activation, runtime resolution,
admission, provider egress, knowledge load/promotion, admin tests/research and
automation policy/enqueue/claim/approval/worker paths. Disable, reject,
recovery, spend settlement, reconciliation evidence and finalization of an
already-leased effect remain available so containment cannot strand cleanup.

The only exception is the exact legacy compatibility tuple
`configurationSource=environment`, `agentId=mentor_coach`, `tenantId=tecpey`,
`workspaceId=main`. Caller-provided provenance is not sufficient: admission and
the durable pre-egress mark each take the same
`ai-agent:tecpey:main:mentor_coach` transaction advisory lock used by binding
updates and prove that **no** `ai_agent_bindings` row exists. A disabled managed
binding also closes the exception, and database unavailability fails closed.
Managed configuration in that same scope is still blocked; an environment
Mentor config is never accepted for another tenant, workspace or agent.

This gate is containment, **not** tenant-isolation closure. The PR remains
NO-GO for managed multi-tenant AI activation and must stay Draft until the
role/context/RLS evidence below is separately reviewed. The affected 19
relations are:

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

Before replacing this blocker with RLS, the deployment needs all of the
following evidence in one release:

- distinct login roles for tenant-facing runtime and cross-tenant workers, plus
  a non-runtime migration owner; runtime roles must be non-superuser and
  `NOBYPASSRLS`;
- a validated tenant/workspace context installed with `SET LOCAL` (or
  `set_config(..., true)`) inside every tenant-facing transaction, with tests
  proving pooled connections cannot retain it;
- explicit worker authority that preserves cross-tenant queue claims without
  granting tenant-facing code the same authority;
- forced RLS, least-privilege grants, owner/bypass verification and integration
  tests executed as the actual runtime roles.

Until that role split and context propagation exist, composite integrity plus
the hard-closed release gate only prevent launch through known application
paths. General row-level tenant isolation is unresolved and remains the
controlled-launch blocker; direct database authority must not be inferred from
the application gate.
