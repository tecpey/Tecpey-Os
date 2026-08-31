import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { writeAiAdminAuditEvent } from "../../lib/ai/admin-audit";
import { AI_AUTOMATION_POLICY_VERSION } from "../../lib/ai/automation-catalog";
import {
  AI_TENANT_DATABASE_ROLE,
  AI_WORKER_DATABASE_ROLE,
  closeAiDatabasePoolsForTest,
  withAiTenantTransaction,
  withAiWorkerTransaction,
} from "../../lib/ai/database-authority";
import { AI_TENANT_RLS_TABLES } from "../../lib/db-migrate-ai-tenant-rls";

const expectedProtectedTables = [
  "ai_provider_configs",
  "ai_provider_config_events",
  "ai_agent_bindings",
  "ai_agent_usage_daily",
  "ai_agent_binding_events",
  "ai_knowledge_items",
  "ai_knowledge_item_events",
  "ai_workflow_run_evidence",
  "ai_provider_quota_snapshots",
  "ai_automation_policies",
  "ai_automation_policy_events",
  "ai_automation_runs",
  "ai_automation_reviews",
  "ai_automation_run_events",
  "ai_agent_spend_monthly",
  "ai_spend_reservations",
  "ai_routing_decision_events",
  "ai_agent_route_candidates",
  "ai_agent_route_candidate_events",
] as const;

const ownerUrl = process.env.DATABASE_URL?.trim();
const tenantUrl = process.env.TECPEY_AI_TENANT_DATABASE_URL?.trim();
const workerUrl = process.env.TECPEY_AI_WORKER_DATABASE_URL?.trim();
const contextKey = process.env.TECPEY_AI_CONTEXT_HMAC_KEY_B64?.trim();
const contextKeyVersion = process.env.TECPEY_AI_CONTEXT_HMAC_KEY_VERSION?.trim();
const configured = Boolean(
  ownerUrl &&
  tenantUrl &&
  workerUrl &&
  contextKey &&
  contextKeyVersion &&
  ![ownerUrl, tenantUrl, workerUrl].some((value) => value?.includes("CHANGE_ME")),
);
if (process.env.CI === "true" && !configured) {
  throw new Error("ai_tenant_rls_postgres_ci_authority_missing");
}

type PgError = Error & { code?: string };
type Scope = Readonly<{ tenantId: string; workspaceId: string }>;

const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const scopeA: Scope = {
  tenantId: `ai-rls-${suffix}-a`,
  workspaceId: `ai-rls-${suffix}-wa`,
};
const scopeB: Scope = {
  tenantId: `ai-rls-${suffix}-b`,
  workspaceId: `ai-rls-${suffix}-wb`,
};
const actorA = randomUUID();
const actorB = randomUUID();
const sessionA = randomUUID();
const sessionB = randomUUID();

let ownerPool: Pool | null = null;
let rawTenantPool: Pool | null = null;
let rawWorkerPool: Pool | null = null;

async function withClient<T>(
  pool: Pool,
  handler: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await handler(client);
  } finally {
    client.release();
  }
}

async function rejectsWithPgCode(
  action: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  await assert.rejects(action, (error: PgError) => {
    assert.equal(error.code, expectedCode);
    return true;
  });
}

async function seedScope(
  client: PoolClient,
  scope: Scope,
  actorId: string,
  sessionId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
     VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`,
    [scope.tenantId],
  );
  await client.query(
    `INSERT INTO platform_workspaces
       (id, tenant_id, slug, display_name, products, settings)
     VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
    [scope.workspaceId, scope.tenantId],
  );
  await client.query(
    `INSERT INTO ai_provider_configs
       (tenant_id, workspace_id, provider_id, enabled, settings)
     VALUES ($1, $2, 'openai', FALSE, '{}'::jsonb)`,
    [scope.tenantId, scope.workspaceId],
  );
  await client.query(
    `INSERT INTO ai_automation_policies
       (tenant_id, workspace_id, workflow_id, enabled, interval_minutes,
        max_concurrency, policy_version, revision)
     VALUES ($1, $2, 'public_intelligence_digest', FALSE, 60, 1, $3, 1)`,
    [scope.tenantId, scope.workspaceId, AI_AUTOMATION_POLICY_VERSION],
  );
  await client.query(
    `INSERT INTO ai_agent_spend_monthly
       (tenant_id, workspace_id, agent_id, budget_month)
     VALUES ($1, $2, 'mentor_coach', date_trunc('month', CURRENT_DATE)::date)`,
    [scope.tenantId, scope.workspaceId],
  );
  await client.query(
    `INSERT INTO admin_users
       (id, email, display_name, status, tenant_id, workspace_id)
     VALUES ($1::uuid, $2, $2, 'active', $3, $4)`,
    [actorId, `${actorId}@rls.test`, scope.tenantId, scope.workspaceId],
  );
  await client.query(
    `INSERT INTO admin_user_roles (admin_id, role_id)
     VALUES ($1::uuid, 'ai_governance_admin')`,
    [actorId],
  );
  await client.query(
    `INSERT INTO admin_sessions
       (id, admin_id, jti, permission_version, authentication_methods,
        idle_expires_at, absolute_expires_at)
     VALUES ($1::uuid, $2::uuid, $3, 1, '["password","totp"]'::jsonb,
             NOW() + INTERVAL '30 minutes', NOW() + INTERVAL '2 hours')`,
    [sessionId, actorId, `ai-rls-session-${sessionId}`],
  );
}

before(async () => {
  assert.deepEqual(AI_TENANT_RLS_TABLES, expectedProtectedTables);
  if (!configured || !ownerUrl || !tenantUrl || !workerUrl) return;
  process.env.TECPEY_AI_TENANT_DATABASE_POOL_MAX = "1";
  process.env.TECPEY_AI_WORKER_DATABASE_POOL_MAX = "1";
  ownerPool = new Pool({
    connectionString: ownerUrl,
    max: 2,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
    allowExitOnIdle: true,
  });
  rawTenantPool = new Pool({
    connectionString: tenantUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
    allowExitOnIdle: true,
  });
  rawWorkerPool = new Pool({
    connectionString: workerUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
    allowExitOnIdle: true,
  });
  await withClient(ownerPool, async (client) => {
    await seedScope(client, scopeA, actorA, sessionA);
    await seedScope(client, scopeB, actorB, sessionB);
  });
});

after(async () => {
  if (configured) await closeAiDatabasePoolsForTest();
  await Promise.all([
    ownerPool?.end(),
    rawTenantPool?.end(),
    rawWorkerPool?.end(),
  ]);
  ownerPool = null;
  rawTenantPool = null;
  rawWorkerPool = null;
});

describe("AI tenant FORCE RLS", () => {
  it(
    "forces one signed tenant policy on every protected relation",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const schema = await ownerPool!.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
        policy_name: string | null;
        using_expression: string | null;
        check_expression: string | null;
      }>(
        `SELECT relation.relname,
                relation.relrowsecurity,
                relation.relforcerowsecurity,
                policy.polname AS policy_name,
                pg_get_expr(policy.polqual, policy.polrelid) AS using_expression,
                pg_get_expr(policy.polwithcheck, policy.polrelid) AS check_expression
           FROM pg_class relation
           JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
           LEFT JOIN pg_policy policy
             ON policy.polrelid = relation.oid
            AND policy.polname = relation.relname || '_tenant_scope'
          WHERE namespace.nspname = 'public'
            AND relation.relname = ANY($1::text[])
          ORDER BY relation.relname`,
        [[...expectedProtectedTables]],
      );
      assert.equal(schema.rows.length, expectedProtectedTables.length);
      for (const row of schema.rows) {
        assert.equal(row.relrowsecurity, true, `${row.relname} must enable RLS`);
        assert.equal(row.relforcerowsecurity, true, `${row.relname} must FORCE RLS`);
        assert.equal(row.policy_name, `${row.relname}_tenant_scope`);
        assert.match(row.using_expression ?? "", /tecpey_ai_authorized_context/u);
        assert.match(row.check_expression ?? "", /tecpey_ai_authorized_context/u);
      }
    },
  );

  it(
    "uses mutually exclusive non-superuser login roles",
    { skip: !configured, timeout: 30_000 },
    async () => {
      for (const [pool, expectedRole, forbiddenRole] of [
        [rawTenantPool!, AI_TENANT_DATABASE_ROLE, AI_WORKER_DATABASE_ROLE],
        [rawWorkerPool!, AI_WORKER_DATABASE_ROLE, AI_TENANT_DATABASE_ROLE],
      ] as const) {
        const evidence = await pool.query<{
          superuser: boolean;
          bypassrls: boolean;
          create_database: boolean;
          create_role: boolean;
          replicate: boolean;
          login_inherits: boolean;
          create_public_objects: boolean;
          expected: boolean;
          forbidden: boolean;
          authorized_roles: string[];
          group_can_login: boolean;
          group_superuser: boolean;
          group_bypassrls: boolean;
          group_create_database: boolean;
          group_create_role: boolean;
          group_replicate: boolean;
          group_inherits: boolean;
          group_owns_objects: boolean;
          membership_grant_count: number;
          membership_inherits: boolean;
          membership_can_set: boolean;
          membership_can_admin: boolean;
          context_verifier: boolean;
          audit_bridge: boolean;
        }>(
          `SELECT role.rolsuper AS superuser,
                  role.rolbypassrls AS bypassrls,
                  role.rolcreatedb AS create_database,
                  role.rolcreaterole AS create_role,
                  role.rolreplication AS replicate,
                  role.rolinherit AS login_inherits,
                  has_schema_privilege(current_user, 'public', 'CREATE')
                    AS create_public_objects,
                  pg_has_role(current_user, $1, 'USAGE') AS expected,
                  pg_has_role(current_user, $2, 'USAGE') AS forbidden,
                  ARRAY(
                    SELECT candidate.rolname::text
                      FROM pg_roles candidate
                     WHERE candidate.rolname <> current_user
                       AND pg_has_role(current_user, candidate.rolname, 'MEMBER')
                     ORDER BY candidate.rolname
                  ) AS authorized_roles,
                  expected_role.rolcanlogin AS group_can_login,
                  expected_role.rolsuper AS group_superuser,
                  expected_role.rolbypassrls AS group_bypassrls,
                  expected_role.rolcreatedb AS group_create_database,
                  expected_role.rolcreaterole AS group_create_role,
                  expected_role.rolreplication AS group_replicate,
                  expected_role.rolinherit AS group_inherits,
                  EXISTS (
                    SELECT 1
                      FROM pg_shdepend owned
                     WHERE owned.refclassid = 'pg_authid'::regclass
                       AND owned.refobjid = expected_role.oid
                       AND owned.deptype = 'o'
                  ) AS group_owns_objects,
                  membership.membership_grant_count,
                  membership.membership_inherits,
                  membership.membership_can_set,
                  membership.membership_can_admin,
                  has_function_privilege(
                    current_user,
                    'public.tecpey_ai_authorized_context()',
                    'EXECUTE'
                  ) AS context_verifier,
                  has_function_privilege(
                    current_user,
                    'public.tecpey_ai_lock_admin_audit_head()',
                    'EXECUTE'
                  ) AS audit_bridge
             FROM pg_roles role
             JOIN pg_roles expected_role ON expected_role.rolname = $1
             CROSS JOIN LATERAL (
               SELECT COUNT(*)::int AS membership_grant_count,
                      COALESCE(bool_and(edge.inherit_option), FALSE)
                        AS membership_inherits,
                      COALESCE(bool_or(edge.set_option), FALSE)
                        AS membership_can_set,
                      COALESCE(bool_or(edge.admin_option), FALSE)
                        AS membership_can_admin
                 FROM pg_auth_members edge
                WHERE edge.roleid = expected_role.oid
                  AND edge.member = role.oid
             ) membership
            WHERE role.rolname = current_user`,
          [expectedRole, forbiddenRole],
        );
        assert.deepEqual(evidence.rows[0], {
          superuser: false,
          bypassrls: false,
          create_database: false,
          create_role: false,
          replicate: false,
          login_inherits: true,
          create_public_objects: false,
          expected: true,
          forbidden: false,
          authorized_roles: [expectedRole],
          group_can_login: false,
          group_superuser: false,
          group_bypassrls: false,
          group_create_database: false,
          group_create_role: false,
          group_replicate: false,
          group_inherits: false,
          group_owns_objects: false,
          membership_grant_count: 1,
          membership_inherits: true,
          membership_can_set: false,
          membership_can_admin: false,
          context_verifier: expectedRole === AI_TENANT_DATABASE_ROLE,
          audit_bridge: expectedRole === AI_TENANT_DATABASE_ROLE,
        });
      }
      const keyPrivilege = await rawTenantPool!.query<{ allowed: boolean }>(
        `SELECT has_table_privilege(
           current_user,
           'public.tecpey_ai_context_authority_keys',
           'SELECT'
         ) AS allowed`,
      );
      assert.equal(keyPrivilege.rows[0]?.allowed, false);

      await ownerPool!.query(
        `GRANT ${AI_WORKER_DATABASE_ROLE} TO tecpey_ai_tenant_ci`,
      );
      try {
        await assert.rejects(
          () => withAiTenantTransaction(scopeA, async (client) =>
            client.query("SELECT 1")),
          /ai_tenant_database_role_authority_invalid/u,
        );
        const dualRoleVisibility = await rawTenantPool!.query<{ count: number }>(
          "SELECT COUNT(*)::int AS count FROM ai_automation_policies",
        );
        assert.equal(
          dualRoleVisibility.rows[0]?.count,
          0,
          "dual membership must disable both tenant context and worker policies",
        );
      } finally {
        await ownerPool!.query(
          `REVOKE ${AI_WORKER_DATABASE_ROLE} FROM tecpey_ai_tenant_ci`,
        );
      }
    },
  );

  it(
    "isolates unqualified reads and rejects cross-tenant writes",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const tenantA = await withAiTenantTransaction(scopeA, async (client) => {
        const result = await client.query<{
          providers: number;
          policies: number;
          spend_ledgers: number;
          tenant: string;
          workspace: string;
          search_path: string;
          row_security: string;
        }>(
          `SELECT
             (SELECT COUNT(*)::int FROM ai_provider_configs) AS providers,
             (SELECT COUNT(*)::int FROM ai_automation_policies) AS policies,
             (SELECT COUNT(*)::int FROM ai_agent_spend_monthly) AS spend_ledgers,
             current_setting('tecpey.tenant_id') AS tenant,
             current_setting('tecpey.workspace_id') AS workspace,
             current_setting('search_path') AS search_path,
             current_setting('row_security') AS row_security`,
        );
        return result.rows[0]!;
      });
      assert.equal(tenantA.enabled, true);
      assert.deepEqual(tenantA.value, {
        providers: 1,
        policies: 1,
        spend_ledgers: 1,
        tenant: scopeA.tenantId,
        workspace: scopeA.workspaceId,
        search_path: "pg_catalog, public, pg_temp",
        row_security: "on",
      });

      await rejectsWithPgCode(
        () => withAiTenantTransaction(scopeA, async (client) => {
          await client.query(
            `INSERT INTO ai_provider_configs
               (tenant_id, workspace_id, provider_id, enabled, settings)
             VALUES ($1, $2, 'xai', FALSE, '{}'::jsonb)`,
            [scopeB.tenantId, scopeB.workspaceId],
          );
        }),
        "42501",
      );
    },
  );

  it(
    "rejects forged or replayed GUC context and survives rollback on a max-one pool",
    { skip: !configured, timeout: 30_000 },
    async () => {
      let capturedSignature = "";
      const signed = await withAiTenantTransaction(scopeA, async (client) => {
        const result = await client.query<{ signature: string }>(
          "SELECT current_setting('tecpey.ai_context_signature') AS signature",
        );
        capturedSignature = result.rows[0]!.signature;
        return client.query("SELECT COUNT(*)::int AS count FROM ai_provider_configs");
      });
      assert.equal(signed.enabled, true);
      assert.equal(signed.value.rows[0]?.count, 1);
      assert.match(capturedSignature, /^[0-9a-f]{64}$/u);

      await withClient(rawTenantPool!, async (client) => {
        await client.query("BEGIN");
        try {
          await client.query(
            `SELECT set_config('tecpey.tenant_id', $1, TRUE),
                    set_config('tecpey.workspace_id', $2, TRUE),
                    set_config('tecpey.ai_context_kind', 'tenant_v1', TRUE),
                    set_config('tecpey.ai_context_key_version', $3, TRUE),
                    set_config('tecpey.ai_context_signature', $4, TRUE)`,
            [scopeA.tenantId, scopeA.workspaceId, contextKeyVersion, capturedSignature],
          );
          const replay = await client.query<{ count: number }>(
            "SELECT COUNT(*)::int AS count FROM ai_provider_configs",
          );
          assert.equal(replay.rows[0]?.count, 0, "signature must bind to pid and transaction");
        } finally {
          await client.query("ROLLBACK");
        }
      });

      await assert.rejects(
        withAiTenantTransaction(scopeA, async () => {
          throw new Error("intentional_ai_rls_rollback");
        }),
        /intentional_ai_rls_rollback/u,
      );
      const nextTenant = await withAiTenantTransaction(scopeB, async (client) => {
        const result = await client.query<{ tenant_id: string }>(
          "SELECT tenant_id FROM ai_provider_configs",
        );
        return result.rows;
      });
      assert.equal(nextTenant.enabled, true);
      assert.deepEqual(nextTenant.value, [{ tenant_id: scopeB.tenantId }]);
    },
  );

  it(
    "limits cross-tenant worker authority to the queue relations",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const worker = await withAiWorkerTransaction(async (client) => {
        const policies = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count
             FROM ai_automation_policies
            WHERE tenant_id = ANY($1::text[])`,
          [[scopeA.tenantId, scopeB.tenantId]],
        );
        return policies.rows[0]!.count;
      });
      assert.equal(worker.enabled, true);
      assert.equal(worker.value, 2);
      const reviewPrivileges = await rawWorkerPool!.query<{
        run_id: boolean;
        review_kind: boolean;
        decision: boolean;
        summary: boolean;
        whole_table: boolean;
      }>(
        `SELECT has_column_privilege(
                  current_user, 'public.ai_automation_reviews', 'run_id', 'SELECT'
                ) AS run_id,
                has_column_privilege(
                  current_user, 'public.ai_automation_reviews', 'review_kind', 'SELECT'
                ) AS review_kind,
                has_column_privilege(
                  current_user, 'public.ai_automation_reviews', 'decision', 'SELECT'
                ) AS decision,
                has_column_privilege(
                  current_user, 'public.ai_automation_reviews', 'summary', 'SELECT'
                ) AS summary,
                has_table_privilege(
                  current_user, 'public.ai_automation_reviews', 'SELECT'
                ) AS whole_table`,
      );
      assert.deepEqual(reviewPrivileges.rows[0], {
        run_id: true,
        review_kind: true,
        decision: true,
        summary: false,
        whole_table: false,
      });
      await rejectsWithPgCode(
        () => rawWorkerPool!.query(
          "SELECT summary FROM ai_automation_reviews LIMIT 1",
        ),
        "42501",
      );
      await rejectsWithPgCode(
        () => rawWorkerPool!.query("SELECT * FROM ai_provider_configs LIMIT 1"),
        "42501",
      );

      const tenantPolicies = await withAiTenantTransaction(scopeA, async (client) => {
        const result = await client.query<{ tenant_id: string }>(
          "SELECT tenant_id FROM ai_automation_policies",
        );
        return result.rows;
      });
      assert.equal(tenantPolicies.enabled, true);
      assert.deepEqual(tenantPolicies.value, [{ tenant_id: scopeA.tenantId }]);
    },
  );

  it(
    "appends global audit evidence without exposing the global audit tables",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const written = await withAiTenantTransaction(scopeA, (client) =>
        writeAiAdminAuditEvent(client, {
          actorAdminId: actorA,
          sessionId: sessionA,
          effectiveRoles: ["ai_governance_admin"],
          action: "ai_provider.rls_probe",
          resourceType: "ai_provider",
          resourceId: "openai",
          outcome: "success",
          afterState: { isolation: "signed_transaction_context" },
        }),
      );
      assert.equal(written.enabled, true);
      assert.match(written.value.eventHash, /^[0-9a-f]{64}$/u);
      const persisted = await ownerPool!.query<{
        actor_admin_id: string;
        action: string;
        event_hash: string;
      }>(
        `SELECT actor_admin_id, action, event_hash
           FROM admin_audit_events
          WHERE id = $1::uuid`,
        [written.value.id],
      );
      assert.deepEqual(persisted.rows[0], {
        actor_admin_id: actorA,
        action: "ai_provider.rls_probe",
        event_hash: written.value.eventHash,
      });

      await rejectsWithPgCode(
        () => withAiTenantTransaction(scopeA, (client) =>
          writeAiAdminAuditEvent(client, {
            actorAdminId: actorB,
            sessionId: sessionB,
            effectiveRoles: ["ai_governance_admin"],
            action: "ai_provider.cross_scope_probe",
            resourceType: "ai_provider",
            resourceId: "openai",
          }),
        ),
        "42501",
      );
      await rejectsWithPgCode(
        () => withAiTenantTransaction(scopeA, (client) =>
          writeAiAdminAuditEvent(client, {
            actorAdminId: actorA,
            sessionId: sessionA,
            effectiveRoles: [],
            action: "ai_provider.underreported_role_probe",
            resourceType: "ai_provider",
            resourceId: "openai",
          }),
        ),
        "42501",
      );
      await rejectsWithPgCode(
        () => rawTenantPool!.query("SELECT * FROM admin_users LIMIT 1"),
        "42501",
      );
    },
  );
});
