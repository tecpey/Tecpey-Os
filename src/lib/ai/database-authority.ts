import { createHmac } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { DATABASE_MIGRATION_PLAN_HASH } from "@/lib/db-migration-registry";
import { logger } from "@/lib/logger";

export const AI_TENANT_DATABASE_ROLE = "tecpey_ai_tenant_runtime" as const;
export const AI_WORKER_DATABASE_ROLE = "tecpey_ai_worker" as const;
export const AI_TENANT_CONTEXT_KIND = "tenant_v1" as const;

const SCOPE_PATTERN = /^[a-z][a-z0-9._-]{1,79}$/;
const DATABASE_LOGIN_PATTERN = /^[a-z][a-z0-9_]{2,62}$/;
const TENANT_DATABASE_URL_ENV = "TECPEY_AI_TENANT_DATABASE_URL";
const WORKER_DATABASE_URL_ENV = "TECPEY_AI_WORKER_DATABASE_URL";
const MIGRATION_DATABASE_URL_ENV = "TECPEY_DATABASE_MIGRATION_URL";
const CONTEXT_KEY_ENV = "TECPEY_AI_CONTEXT_HMAC_KEY_B64";
const CONTEXT_KEY_VERSION_ENV = "TECPEY_AI_CONTEXT_HMAC_KEY_VERSION";
const WORKER_PROCESS_ROLE = "ai_worker";

type AiDatabaseKind = "tenant" | "worker";
type AiTransactionResult<T> =
  | { enabled: true; value: T }
  | { enabled: false; value: null };

export type AiTenantDatabaseScope = Readonly<{
  tenantId: string;
  workspaceId: string;
}>;

type DatabaseRoleEvidenceRow = {
  current_user: string;
  session_user: string;
  backend_pid: number;
  transaction_id: string;
  login_can_login: boolean;
  is_superuser: boolean;
  can_create_database: boolean;
  can_create_role: boolean;
  can_replicate: boolean;
  inherits_privileges: boolean;
  bypasses_rls: boolean;
  expected_role_can_login: boolean;
  expected_role_is_superuser: boolean;
  expected_role_can_create_database: boolean;
  expected_role_can_create_role: boolean;
  expected_role_can_replicate: boolean;
  expected_role_inherits_privileges: boolean;
  expected_role_bypasses_rls: boolean;
  expected_role_owns_objects: boolean;
  membership_grant_count: number;
  membership_inherits_privileges: boolean;
  membership_can_set_role: boolean;
  membership_can_admin_role: boolean;
  expected_role_authorized: boolean;
  forbidden_role_authorized: boolean;
  role_not_switched: boolean;
  authorized_roles: string[];
};

type DatabasePrivilegeEvidenceRow = {
  can_create_public_objects: boolean;
  can_access_context_key: boolean;
  can_access_admin_users: boolean;
  can_access_admin_user_roles: boolean;
  can_access_admin_sessions: boolean;
  can_access_admin_audit: boolean;
  can_execute_context_verifier: boolean;
  can_execute_audit_head: boolean;
  can_execute_audit_append: boolean;
};

type AiContextAuthority = Readonly<{
  key: Buffer;
  version: number;
}>;

let tenantPool: Pool | null = null;
let workerPool: Pool | null = null;

function boundedPoolSize(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 20) return fallback;
  return parsed;
}

function databasePrincipalIdentity(parsed: URL): string {
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const username = decodeURIComponent(parsed.username);
  return [
    parsed.hostname.toLowerCase(),
    parsed.port || "5432",
    databaseName,
    username,
  ].join(":");
}

function configuredContextAuthority(): AiContextAuthority | null {
  const encodedKey = process.env[CONTEXT_KEY_ENV]?.trim();
  const rawVersion = process.env[CONTEXT_KEY_VERSION_ENV]?.trim();
  if (!encodedKey && !rawVersion) return null;
  if (!encodedKey || !rawVersion || !/^[1-9][0-9]{0,8}$/.test(rawVersion)) {
    throw new Error("ai_tenant_context_authority_invalid");
  }
  const key = Buffer.from(encodedKey, "base64");
  const version = Number(rawVersion);
  if (
    key.length !== 32 ||
    key.toString("base64") !== encodedKey ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    version > 999_999_999
  ) {
    throw new Error("ai_tenant_context_authority_invalid");
  }
  return { key, version };
}

function hasConfiguredTenantDatabaseUrl(): boolean {
  const raw = process.env[TENANT_DATABASE_URL_ENV]?.trim();
  return Boolean(raw && !raw.includes("CHANGE_ME"));
}

function signedTenantContext(input: {
  authority: AiContextAuthority;
  scope: AiTenantDatabaseScope;
  sessionUser: string;
  backendPid: number;
  transactionId: string;
}): string {
  const message = [
    "tecpey-ai-context-v1",
    String(input.authority.version),
    AI_TENANT_CONTEXT_KIND,
    input.scope.tenantId,
    input.scope.workspaceId,
    input.sessionUser,
    String(input.backendPid),
    input.transactionId,
  ].join("\n");
  return createHmac("sha256", input.authority.key).update(message).digest("hex");
}

function parseDatabaseUrl(environmentName: string, raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${environmentName.toLowerCase()}_invalid`);
  }
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    !parsed.hostname ||
    !parsed.username ||
    !parsed.pathname.replace(/^\//, "")
  ) {
    throw new Error(`${environmentName.toLowerCase()}_invalid`);
  }
  return parsed;
}

function assertRuntimeCredentialSeparation(kind: AiDatabaseKind): void {
  const migrationCredential = process.env[MIGRATION_DATABASE_URL_ENV]?.trim();
  if (
    process.env.NODE_ENV !== "test" &&
    migrationCredential &&
    !migrationCredential.includes("CHANGE_ME")
  ) {
    throw new Error("ai_migration_database_credential_exposed_to_runtime");
  }
  const workerCredential = process.env[WORKER_DATABASE_URL_ENV]?.trim();
  if (
    kind === "tenant" &&
    process.env.NODE_ENV !== "test" &&
    workerCredential &&
    !workerCredential.includes("CHANGE_ME") &&
    process.env.TECPEY_DATABASE_PROCESS_ROLE !== WORKER_PROCESS_ROLE
  ) {
    throw new Error("ai_worker_database_credential_exposed_to_web_runtime");
  }
}

function configuredDatabaseUrl(kind: AiDatabaseKind): string | null {
  assertRuntimeCredentialSeparation(kind);
  const environmentName = kind === "tenant"
    ? TENANT_DATABASE_URL_ENV
    : WORKER_DATABASE_URL_ENV;
  const raw = process.env[environmentName]?.trim();
  if (!raw || raw.includes("CHANGE_ME")) return null;

  const parsed = parseDatabaseUrl(environmentName, raw);
  const principal = databasePrincipalIdentity(parsed);

  for (const [otherName, errorCode] of [
    [
      kind === "tenant" ? WORKER_DATABASE_URL_ENV : TENANT_DATABASE_URL_ENV,
      "ai_database_runtime_roles_must_be_distinct",
    ],
    ["DATABASE_URL", "ai_database_url_must_not_reuse_legacy_runtime_role"],
    [
      MIGRATION_DATABASE_URL_ENV,
      "ai_database_url_must_not_reuse_migration_role",
    ],
  ] as const) {
    const other = process.env[otherName]?.trim();
    if (!other || other.includes("CHANGE_ME")) continue;
    const otherParsed = parseDatabaseUrl(otherName, other);
    if (databasePrincipalIdentity(otherParsed) === principal) {
      throw new Error(errorCode);
    }
  }
  return raw;
}

function assertWorkerProcessAuthority(): void {
  if (
    process.env.NODE_ENV !== "test" &&
    process.env.TECPEY_DATABASE_PROCESS_ROLE !== WORKER_PROCESS_ROLE
  ) {
    throw new Error("ai_worker_database_process_authority_required");
  }
}

function createPool(kind: AiDatabaseKind, connectionString: string): Pool {
  const instance = new Pool({
    connectionString,
    max: boundedPoolSize(
      process.env[
        kind === "tenant"
          ? "TECPEY_AI_TENANT_DATABASE_POOL_MAX"
          : "TECPEY_AI_WORKER_DATABASE_POOL_MAX"
      ],
      kind === "tenant" ? 10 : 4,
    ),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
    application_name: kind === "tenant"
      ? "tecpey-ai-tenant-runtime"
      : "tecpey-ai-cross-tenant-worker",
    allowExitOnIdle: process.env.NODE_ENV === "test",
  });
  instance.on("error", (error) => {
    logger.error("[ai-database] pool error", {
      kind,
      message: error.message,
    });
  });
  return instance;
}

function getAiDatabasePool(kind: AiDatabaseKind): Pool | null {
  if (kind === "worker") assertWorkerProcessAuthority();
  const connectionString = configuredDatabaseUrl(kind);
  if (!connectionString) return null;
  if (kind === "tenant") {
    tenantPool ??= createPool(kind, connectionString);
    return tenantPool;
  }
  workerPool ??= createPool(kind, connectionString);
  return workerPool;
}

function assertTenantScope(scope: AiTenantDatabaseScope): void {
  if (
    !SCOPE_PATTERN.test(scope.tenantId) ||
    !SCOPE_PATTERN.test(scope.workspaceId)
  ) {
    throw new Error("ai_tenant_database_scope_invalid");
  }
}

async function assertDatabaseRole(
  client: PoolClient,
  kind: AiDatabaseKind,
): Promise<DatabaseRoleEvidenceRow> {
  const expectedRole = kind === "tenant"
    ? AI_TENANT_DATABASE_ROLE
    : AI_WORKER_DATABASE_ROLE;
  const forbiddenRole = kind === "tenant"
    ? AI_WORKER_DATABASE_ROLE
    : AI_TENANT_DATABASE_ROLE;
  const evidence = await client.query<DatabaseRoleEvidenceRow>(
    `SELECT current_user,
            session_user,
            pg_backend_pid() AS backend_pid,
            txid_current()::text AS transaction_id,
            login.rolcanlogin AS login_can_login,
            login.rolsuper AS is_superuser,
            login.rolcreatedb AS can_create_database,
            login.rolcreaterole AS can_create_role,
            login.rolreplication AS can_replicate,
            login.rolinherit AS inherits_privileges,
            login.rolbypassrls AS bypasses_rls,
            expected.rolcanlogin AS expected_role_can_login,
            expected.rolsuper AS expected_role_is_superuser,
            expected.rolcreatedb AS expected_role_can_create_database,
            expected.rolcreaterole AS expected_role_can_create_role,
            expected.rolreplication AS expected_role_can_replicate,
            expected.rolinherit AS expected_role_inherits_privileges,
            expected.rolbypassrls AS expected_role_bypasses_rls,
            EXISTS (
              SELECT 1
                FROM pg_shdepend owned
               WHERE owned.refclassid = 'pg_authid'::regclass
                 AND owned.refobjid = expected.oid
                 AND owned.deptype = 'o'
            ) AS expected_role_owns_objects,
            membership.membership_grant_count,
            membership.membership_inherits_privileges,
            membership.membership_can_set_role,
            membership.membership_can_admin_role,
            pg_has_role(current_user, $1, 'USAGE') AS expected_role_authorized,
            pg_has_role(current_user, $2, 'USAGE') AS forbidden_role_authorized,
            current_user = session_user AS role_not_switched,
            ARRAY(
              SELECT candidate.rolname::text
                FROM pg_roles candidate
               WHERE candidate.rolname <> session_user
                 AND pg_has_role(session_user, candidate.rolname, 'MEMBER')
               ORDER BY candidate.rolname
            ) AS authorized_roles
       FROM pg_roles login
       JOIN pg_roles expected ON expected.rolname = $1
       CROSS JOIN LATERAL (
         SELECT COUNT(*)::int AS membership_grant_count,
                COALESCE(bool_and(edge.inherit_option), FALSE)
                  AS membership_inherits_privileges,
                COALESCE(bool_or(edge.set_option), FALSE)
                  AS membership_can_set_role,
                COALESCE(bool_or(edge.admin_option), FALSE)
                  AS membership_can_admin_role
           FROM pg_auth_members edge
          WHERE edge.roleid = expected.oid
            AND edge.member = login.oid
       ) membership
      WHERE login.rolname = session_user`,
    [expectedRole, forbiddenRole],
  );
  const role = evidence.rows[0];
  if (
    !role ||
    !DATABASE_LOGIN_PATTERN.test(role.session_user) ||
    !role.login_can_login ||
    role.is_superuser ||
    role.can_create_database ||
    role.can_create_role ||
    role.can_replicate ||
    !role.inherits_privileges ||
    role.bypasses_rls ||
    role.expected_role_can_login ||
    role.expected_role_is_superuser ||
    role.expected_role_can_create_database ||
    role.expected_role_can_create_role ||
    role.expected_role_can_replicate ||
    role.expected_role_inherits_privileges ||
    role.expected_role_bypasses_rls ||
    role.expected_role_owns_objects ||
    role.membership_grant_count !== 1 ||
    !role.membership_inherits_privileges ||
    role.membership_can_set_role ||
    role.membership_can_admin_role ||
    !role.expected_role_authorized ||
    role.forbidden_role_authorized ||
    !role.role_not_switched ||
    role.authorized_roles.length !== 1 ||
    role.authorized_roles[0] !== expectedRole
  ) {
    throw new Error(`ai_${kind}_database_role_authority_invalid`);
  }
  return role;
}

async function assertLeastPrivilege(
  client: PoolClient,
  kind: AiDatabaseKind,
): Promise<void> {
  const evidence = await client.query<DatabasePrivilegeEvidenceRow>(
    `WITH sensitive_access AS (
       SELECT target.label,
              has_table_privilege(current_user, target.relation_oid, 'SELECT')
              OR has_table_privilege(current_user, target.relation_oid, 'INSERT')
              OR has_table_privilege(current_user, target.relation_oid, 'UPDATE')
              OR has_table_privilege(current_user, target.relation_oid, 'DELETE')
              OR has_table_privilege(current_user, target.relation_oid, 'TRUNCATE')
              OR has_table_privilege(current_user, target.relation_oid, 'REFERENCES')
              OR has_table_privilege(current_user, target.relation_oid, 'TRIGGER')
              OR has_any_column_privilege(current_user, target.relation_oid, 'SELECT')
              OR has_any_column_privilege(current_user, target.relation_oid, 'INSERT')
              OR has_any_column_privilege(current_user, target.relation_oid, 'UPDATE')
              OR has_any_column_privilege(current_user, target.relation_oid, 'REFERENCES')
                AS can_access
         FROM (VALUES
           ('context_key', 'public.tecpey_ai_context_authority_keys'::regclass),
           ('admin_users', 'public.admin_users'::regclass),
           ('admin_user_roles', 'public.admin_user_roles'::regclass),
           ('admin_sessions', 'public.admin_sessions'::regclass),
           ('admin_audit', 'public.admin_audit_events'::regclass)
         ) AS target(label, relation_oid)
     )
     SELECT has_schema_privilege(current_user, 'public', 'CREATE')
              AS can_create_public_objects,
            (SELECT can_access FROM sensitive_access WHERE label = 'context_key')
              AS can_access_context_key,
            (SELECT can_access FROM sensitive_access WHERE label = 'admin_users')
              AS can_access_admin_users,
            (SELECT can_access FROM sensitive_access WHERE label = 'admin_user_roles')
              AS can_access_admin_user_roles,
            (SELECT can_access FROM sensitive_access WHERE label = 'admin_sessions')
              AS can_access_admin_sessions,
            (SELECT can_access FROM sensitive_access WHERE label = 'admin_audit')
              AS can_access_admin_audit,
            has_function_privilege(
              current_user,
              'public.tecpey_ai_authorized_context()',
              'EXECUTE'
            ) AS can_execute_context_verifier,
            has_function_privilege(
              current_user,
              'public.tecpey_ai_lock_admin_audit_head()',
              'EXECUTE'
            ) AS can_execute_audit_head,
            has_function_privilege(
              current_user,
              'public.tecpey_ai_append_admin_audit(uuid,timestamp with time zone,uuid,uuid,jsonb,text,text,text,text,text,text,text,jsonb,jsonb,text,text,text,text)',
              'EXECUTE'
            ) AS can_execute_audit_append`,
  );
  const privilege = evidence.rows[0];
  const tenantExpected = kind === "tenant";
  if (
    !privilege ||
    privilege.can_create_public_objects ||
    privilege.can_access_context_key ||
    privilege.can_access_admin_users ||
    privilege.can_access_admin_user_roles ||
    privilege.can_access_admin_sessions ||
    privilege.can_access_admin_audit ||
    privilege.can_execute_context_verifier !== tenantExpected ||
    privilege.can_execute_audit_head !== tenantExpected ||
    privilege.can_execute_audit_append !== tenantExpected
  ) {
    throw new Error(`ai_${kind}_database_least_privilege_invalid`);
  }
}

async function assertCurrentMigration(client: PoolClient): Promise<void> {
  const state = await client.query<{ status: string; plan_hash: string }>(
    `SELECT status, plan_hash
       FROM _migration_runtime_state
      WHERE singleton = TRUE
      LIMIT 1`,
  );
  if (
    state.rows[0]?.status !== "current" ||
    state.rows[0]?.plan_hash !== DATABASE_MIGRATION_PLAN_HASH
  ) {
    throw new Error("ai_database_schema_not_current");
  }
}

async function installTransactionGuardrails(client: PoolClient): Promise<void> {
  const installed = await client.query<{
    search_path: string;
    row_security: string;
  }>(
    `SELECT set_config(
              'search_path', 'pg_catalog, public, pg_temp', TRUE
            ) AS search_path,
            set_config('row_security', 'on', TRUE) AS row_security`,
  );
  if (
    installed.rows[0]?.search_path !== "pg_catalog, public, pg_temp" ||
    installed.rows[0]?.row_security !== "on"
  ) {
    throw new Error("ai_database_transaction_guardrail_install_failed");
  }
}

async function beginTransaction(
  client: PoolClient,
  kind: AiDatabaseKind,
): Promise<DatabaseRoleEvidenceRow> {
  await client.query("BEGIN");
  await installTransactionGuardrails(client);
  const role = await assertDatabaseRole(client, kind);
  await assertCurrentMigration(client);
  await assertLeastPrivilege(client, kind);
  return role;
}

async function rollbackPreservingOriginal(client: PoolClient): Promise<boolean> {
  try {
    await client.query("ROLLBACK");
    return true;
  } catch {
    // The originating database error remains the authoritative failure.
    return false;
  }
}

export async function withAiTenantTransaction<T>(
  scope: AiTenantDatabaseScope,
  handler: (client: PoolClient) => Promise<T>,
): Promise<AiTransactionResult<T>> {
  assertTenantScope(scope);
  assertRuntimeCredentialSeparation("tenant");
  const authority = configuredContextAuthority();
  const databaseConfigured = hasConfiguredTenantDatabaseUrl();
  if (Boolean(authority) !== databaseConfigured) {
    throw new Error("ai_tenant_database_configuration_incomplete");
  }
  if (!authority) return { enabled: false, value: null };
  const pool = getAiDatabasePool("tenant");
  if (!pool) throw new Error("ai_tenant_database_configuration_incomplete");

  const client = await pool.connect();
  let discardClient = false;
  try {
    const role = await beginTransaction(client, "tenant");
    const signature = signedTenantContext({
      authority,
      scope,
      sessionUser: role.session_user,
      backendPid: role.backend_pid,
      transactionId: role.transaction_id,
    });
    const context = await client.query<{
      tenant_id: string;
      workspace_id: string;
      context_kind: string;
      key_version: string;
      signature: string;
    }>(
      `SELECT set_config('tecpey.tenant_id', $1, TRUE) AS tenant_id,
              set_config('tecpey.workspace_id', $2, TRUE) AS workspace_id,
              set_config('tecpey.ai_context_kind', $3, TRUE) AS context_kind,
              set_config('tecpey.ai_context_key_version', $4, TRUE) AS key_version,
              set_config('tecpey.ai_context_signature', $5, TRUE) AS signature`,
      [
        scope.tenantId,
        scope.workspaceId,
        AI_TENANT_CONTEXT_KIND,
        String(authority.version),
        signature,
      ],
    );
    const installed = context.rows[0];
    if (
      installed?.tenant_id !== scope.tenantId ||
      installed.workspace_id !== scope.workspaceId ||
      installed.context_kind !== AI_TENANT_CONTEXT_KIND ||
      installed.key_version !== String(authority.version) ||
      installed.signature !== signature
    ) {
      throw new Error("ai_tenant_database_context_install_failed");
    }
    const verified = await client.query<{ authorized_scope: unknown }>(
      "SELECT public.tecpey_ai_authorized_context() AS authorized_scope",
    );
    const authorizedScope = verified.rows[0]?.authorized_scope;
    if (
      !Array.isArray(authorizedScope) ||
      authorizedScope.length !== 2 ||
      authorizedScope[0] !== scope.tenantId ||
      authorizedScope[1] !== scope.workspaceId
    ) {
      throw new Error("ai_tenant_database_context_verification_failed");
    }
    const value = await handler(client);
    await client.query("COMMIT");
    return { enabled: true, value };
  } catch (error) {
    discardClient = !(await rollbackPreservingOriginal(client));
    throw error;
  } finally {
    client.release(discardClient);
  }
}

export async function withAiWorkerTransaction<T>(
  handler: (client: PoolClient) => Promise<T>,
): Promise<AiTransactionResult<T>> {
  const pool = getAiDatabasePool("worker");
  if (!pool) return { enabled: false, value: null };

  const client = await pool.connect();
  let discardClient = false;
  try {
    await beginTransaction(client, "worker");
    await client.query(
      `SELECT set_config('tecpey.tenant_id', '', TRUE),
              set_config('tecpey.workspace_id', '', TRUE),
              set_config('tecpey.ai_context_kind', '', TRUE),
              set_config('tecpey.ai_context_key_version', '', TRUE),
              set_config('tecpey.ai_context_signature', '', TRUE)`,
    );
    const value = await handler(client);
    await client.query("COMMIT");
    return { enabled: true, value };
  } catch (error) {
    discardClient = !(await rollbackPreservingOriginal(client));
    throw error;
  } finally {
    client.release(discardClient);
  }
}

export async function closeAiDatabasePoolsForTest(): Promise<void> {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("ai_database_pool_close_test_only");
  }
  const pools = [tenantPool, workerPool].filter((item): item is Pool => item !== null);
  tenantPool = null;
  workerPool = null;
  await Promise.all(pools.map((item) => item.end()));
}
