import { timingSafeEqual } from "node:crypto";
import { Pool, escapeIdentifier, escapeLiteral } from "pg";

type RuntimeRoleFixture = Readonly<{
  environmentName: "TECPEY_AI_TENANT_DATABASE_URL" | "TECPEY_AI_WORKER_DATABASE_URL";
  loginRole: "tecpey_ai_tenant_ci" | "tecpey_ai_worker_ci";
  groupRole: "tecpey_ai_tenant_runtime" | "tecpey_ai_worker";
  forbiddenGroupRole: "tecpey_ai_worker" | "tecpey_ai_tenant_runtime";
  ownershipMarker:
    | "tecpey-ci-managed-role:ai-tenant-login:v1"
    | "tecpey-ci-managed-role:ai-worker-login:v1";
}>;

const fixtures: readonly RuntimeRoleFixture[] = [
  {
    environmentName: "TECPEY_AI_TENANT_DATABASE_URL",
    loginRole: "tecpey_ai_tenant_ci",
    groupRole: "tecpey_ai_tenant_runtime",
    forbiddenGroupRole: "tecpey_ai_worker",
    ownershipMarker: "tecpey-ci-managed-role:ai-tenant-login:v1",
  },
  {
    environmentName: "TECPEY_AI_WORKER_DATABASE_URL",
    loginRole: "tecpey_ai_worker_ci",
    groupRole: "tecpey_ai_worker",
    forbiddenGroupRole: "tecpey_ai_tenant_runtime",
    ownershipMarker: "tecpey-ci-managed-role:ai-worker-login:v1",
  },
];

function parsedDatabaseUrl(name: string, raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    !parsed.username ||
    !parsed.password ||
    !parsed.pathname.replace(/^\//, "")
  ) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return parsed;
}

function databaseTarget(parsed: URL): string {
  return [
    parsed.hostname.toLowerCase(),
    parsed.port || "5432",
    decodeURIComponent(parsed.pathname.replace(/^\//, "")),
  ].join(":");
}

async function main(): Promise<void> {
  if (process.env.CI !== "true" || process.env.NODE_ENV === "production") {
    throw new Error("ai_database_ci_role_provisioning_forbidden");
  }
  const ownerUrl = process.env.DATABASE_URL?.trim();
  if (!ownerUrl || ownerUrl.includes("CHANGE_ME")) {
    throw new Error("database_url_required_for_ai_ci_role_provisioning");
  }
  const owner = parsedDatabaseUrl("DATABASE_URL", ownerUrl);
  const configured = fixtures.flatMap((fixture) => {
    const raw = process.env[fixture.environmentName]?.trim();
    if (!raw) return [];
    const parsed = parsedDatabaseUrl(fixture.environmentName, raw);
    const username = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    if (username !== fixture.loginRole) {
      throw new Error(`${fixture.environmentName.toLowerCase()}_ci_login_role_invalid`);
    }
    if (password.length < 16 || /change_me|replace_with/i.test(password)) {
      throw new Error(`${fixture.environmentName.toLowerCase()}_ci_password_invalid`);
    }
    if (databaseTarget(parsed) !== databaseTarget(owner)) {
      throw new Error(`${fixture.environmentName.toLowerCase()}_ci_database_target_mismatch`);
    }
    return [{ ...fixture, password }];
  });
  if (configured.length === 0) {
    throw new Error("ai_database_ci_runtime_urls_missing");
  }
  const tenantRuntimeConfigured = configured.some(
    (fixture) => fixture.groupRole === "tecpey_ai_tenant_runtime",
  );
  const encodedContextKey = process.env.TECPEY_AI_CONTEXT_HMAC_KEY_B64?.trim();
  const rawContextKeyVersion = process.env.TECPEY_AI_CONTEXT_HMAC_KEY_VERSION?.trim();
  let contextKey: Buffer | null = null;
  let contextKeyVersion: number | null = null;
  if (tenantRuntimeConfigured) {
    if (
      !encodedContextKey ||
      !rawContextKeyVersion ||
      !/^[1-9][0-9]{0,8}$/.test(rawContextKeyVersion)
    ) {
      throw new Error("ai_database_ci_context_authority_missing");
    }
    contextKey = Buffer.from(encodedContextKey, "base64");
    contextKeyVersion = Number(rawContextKeyVersion);
    if (
      contextKey.length !== 32 ||
      contextKey.toString("base64") !== encodedContextKey ||
      !Number.isSafeInteger(contextKeyVersion) ||
      contextKeyVersion < 1 ||
      contextKeyVersion > 999_999_999
    ) {
      throw new Error("ai_database_ci_context_authority_invalid");
    }
  }

  const pool = new Pool({
    connectionString: ownerUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
    application_name: "tecpey-ai-ci-role-provisioner",
  });
  try {
    for (const fixture of configured) {
      const loginRole = escapeIdentifier(fixture.loginRole);
      const groupRole = escapeIdentifier(fixture.groupRole);
      const forbiddenGroupRole = escapeIdentifier(fixture.forbiddenGroupRole);
      const password = escapeLiteral(fixture.password);
      await pool.query(`
        DO $role$
        DECLARE
          existing_marker TEXT;
        BEGIN
          SELECT shobj_description(role.oid, 'pg_authid')
            INTO existing_marker
            FROM pg_roles role
           WHERE role.rolname = ${escapeLiteral(fixture.loginRole)};
          IF NOT FOUND THEN
            CREATE ROLE ${loginRole};
            COMMENT ON ROLE ${loginRole} IS ${escapeLiteral(fixture.ownershipMarker)};
          ELSIF existing_marker IS DISTINCT FROM ${escapeLiteral(fixture.ownershipMarker)} THEN
            RAISE EXCEPTION 'CI role collision: % is not TecPey-managed',
              ${escapeLiteral(fixture.loginRole)}
              USING ERRCODE = '42710';
          END IF;
        END
        $role$;
        ALTER ROLE ${loginRole}
          LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT
          NOREPLICATION NOBYPASSRLS PASSWORD ${password};
        ALTER ROLE ${loginRole} RESET ALL;
        DO $memberships$
        DECLARE
          membership RECORD;
        BEGIN
          FOR membership IN
            SELECT granted.rolname AS granted_role
              FROM pg_auth_members edge
              JOIN pg_roles granted ON granted.oid = edge.roleid
              JOIN pg_roles member ON member.oid = edge.member
             WHERE member.rolname = ${escapeLiteral(fixture.loginRole)}
               AND granted.rolname <> ${escapeLiteral(fixture.groupRole)}
          LOOP
            EXECUTE format(
              'REVOKE %I FROM %I',
              membership.granted_role,
              ${escapeLiteral(fixture.loginRole)}
            );
          END LOOP;
        END
        $memberships$;
        REVOKE ALL ON SCHEMA public FROM ${loginRole};
        REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${loginRole};
        REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${loginRole};
        REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM ${loginRole};
        REVOKE ${forbiddenGroupRole} FROM ${loginRole};
        GRANT ${groupRole} TO ${loginRole} WITH INHERIT TRUE;
        GRANT ${groupRole} TO ${loginRole} WITH SET FALSE;
        GRANT ${groupRole} TO ${loginRole} WITH ADMIN FALSE;
      `);
    }
    if (contextKey && contextKeyVersion) {
      await pool.query(
        `INSERT INTO tecpey_ai_context_authority_keys
           (key_version, hmac_key, activated_at, expires_at, revoked_at)
         VALUES ($1, $2::bytea, NOW(), NULL, NULL)
         ON CONFLICT (key_version) DO NOTHING`,
        [contextKeyVersion, contextKey],
      );
      const stored = await pool.query<{
        hmac_key: Buffer;
        activated_at: Date;
        expires_at: Date | null;
        revoked_at: Date | null;
      }>(
        `SELECT hmac_key, activated_at, expires_at, revoked_at
           FROM tecpey_ai_context_authority_keys
          WHERE key_version = $1`,
        [contextKeyVersion],
      );
      const evidence = stored.rows[0];
      if (
        !evidence ||
        evidence.hmac_key.length !== contextKey.length ||
        !timingSafeEqual(evidence.hmac_key, contextKey) ||
        evidence.activated_at.getTime() > Date.now() ||
        (evidence.expires_at !== null && evidence.expires_at.getTime() <= Date.now()) ||
        evidence.revoked_at !== null
      ) {
        throw new Error("ai_database_ci_context_authority_collision");
      }
    }
  } finally {
    await pool.end();
  }
  process.stdout.write(
    `${JSON.stringify({
      status: "ok",
      provisioned: configured.map((item) => item.loginRole),
      contextKeyVersion,
    })}\n`,
  );
}

void main().catch((error: unknown) => {
  console.error(
    `[ai-database-ci-roles] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
