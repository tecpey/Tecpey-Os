import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

import {
  AI_TENANT_RLS_EVIDENCE_ENVIRONMENT,
  AI_TENANT_RLS_EVIDENCE_SOURCE_PATHS,
  validateAiTenantRlsRuntimeEvidence,
} from "./ai-tenant-rls-runtime-evidence-policy.mjs";
import { AI_TENANT_RLS_TABLES } from "../src/lib/db-migrate-ai-tenant-rls";

type RlsTableRow = {
  table: string;
  rlsEnabled: boolean;
  rlsForced: boolean;
  policyCount: number;
};

type ManagedRoleRow = {
  name: string;
  login: boolean;
  superuser: boolean;
  createDatabase: boolean;
  createRole: boolean;
  replication: boolean;
  bypassRls: boolean;
  inherit: boolean;
};

type MembershipRow = {
  grantedRole: string;
  memberRole: string;
  inheritOption: boolean;
  setOption: boolean;
  adminOption: boolean;
};

type WorkerColumnPrivilegeRow = {
  table: string;
  column: string;
  privilege: string;
};

type WorkerTablePrivilegeRow = {
  table: string;
  privilege: string;
};

type WorkerSchemaPrivilegeRow = {
  schema: string;
  privilege: string;
};

type WorkerRoutinePrivilegeRow = {
  routine: string;
  privilege: string;
};

type WorkerSecurityDefinerRoutineRow = {
  routine: string;
};

const TEST_FILE = "src/tests/security/ai-tenant-rls-postgres.test.ts";
const TEST_COMMAND =
  "node --import tsx --test --test-force-exit --test-reporter=tap src/tests/security/ai-tenant-rls-postgres.test.ts";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name.toLowerCase()}_required`);
  return value;
}

function exactGitObject(args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      NODE_ENV: process.env.NODE_ENV ?? "test",
      LANG: "C",
      LC_ALL: "C",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseTapMetric(tap: string, label: string): number {
  const pattern = new RegExp(`^# ${label} ([0-9]+(?:\\.[0-9]+)?)$`);
  const matches = tap
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => pattern.exec(line)?.[1] ?? null)
    .filter((value): value is string => value !== null);
  if (matches.length !== 1) {
    throw new Error(`ai_tenant_rls_tap_${label}_invalid`);
  }
  const value = Number(matches[0]);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`ai_tenant_rls_tap_${label}_invalid`);
  }
  return value;
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, filePath);
}

async function main(): Promise<void> {
  if (
    process.env.CI !== "true" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.TECPEY_AI_RLS_EVIDENCE_ENVIRONMENT !==
      AI_TENANT_RLS_EVIDENCE_ENVIRONMENT
  ) {
    throw new Error("ai_tenant_rls_evidence_protected_ci_required");
  }

  const repository = requiredEnvironment("GITHUB_REPOSITORY");
  if (repository !== "tecpey/Tecpey-Os") {
    throw new Error("ai_tenant_rls_evidence_repository_invalid");
  }
  const candidateSha = requiredEnvironment("TECPEY_AI_RLS_EVIDENCE_SHA");
  const expectedTreeSha = requiredEnvironment(
    "TECPEY_AI_RLS_EVIDENCE_TREE_SHA",
  );
  const actualCommitSha = exactGitObject(["rev-parse", "HEAD"]);
  const actualTreeSha = exactGitObject(["rev-parse", "HEAD^{tree}"]);
  if (candidateSha !== actualCommitSha || expectedTreeSha !== actualTreeSha) {
    throw new Error("ai_tenant_rls_evidence_source_identity_mismatch");
  }

  const runId = Number(requiredEnvironment("GITHUB_RUN_ID"));
  const runAttempt = Number(requiredEnvironment("GITHUB_RUN_ATTEMPT"));
  if (
    !Number.isSafeInteger(runId) ||
    runId <= 0 ||
    !Number.isSafeInteger(runAttempt) ||
    runAttempt <= 0
  ) {
    throw new Error("ai_tenant_rls_evidence_run_identity_invalid");
  }

  const tapPath = path.resolve(
    requiredEnvironment("TECPEY_AI_RLS_EVIDENCE_TAP_FILE"),
  );
  const outputPath = path.resolve(
    requiredEnvironment("TECPEY_AI_RLS_EVIDENCE_OUTPUT"),
  );
  const tapStat = await stat(tapPath);
  if (!tapStat.isFile() || tapStat.size === 0 || tapStat.size > 2 * 1024 * 1024) {
    throw new Error("ai_tenant_rls_tap_size_invalid");
  }
  const tapBytes = await readFile(tapPath);
  const tap = tapBytes.toString("utf8");
  const testSummary = {
    tests: parseTapMetric(tap, "tests"),
    pass: parseTapMetric(tap, "pass"),
    fail: parseTapMetric(tap, "fail"),
    skipped: parseTapMetric(tap, "skipped"),
    cancelled: parseTapMetric(tap, "cancelled"),
    durationMs: parseTapMetric(tap, "duration_ms"),
  };
  if (
    testSummary.tests < 6 ||
    testSummary.pass !== testSummary.tests ||
    testSummary.fail !== 0 ||
    testSummary.skipped !== 0 ||
    testSummary.cancelled !== 0
  ) {
    throw new Error("ai_tenant_rls_evidence_test_result_not_admissible");
  }

  const ownerDatabaseUrl = requiredEnvironment("DATABASE_URL");
  const pool = new Pool({
    connectionString: ownerDatabaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
    application_name: "tecpey-ai-rls-evidence-collector",
  });

  let serverVersion = "";
  let serverVersionNum = 0;
  let rlsTables: RlsTableRow[] = [];
  let managedRoles: ManagedRoleRow[] = [];
  let memberships: MembershipRow[] = [];
  let workerColumnPrivileges: WorkerColumnPrivilegeRow[] = [];
  let workerTablePrivileges: WorkerTablePrivilegeRow[] = [];
  let workerSchemaPrivileges: WorkerSchemaPrivilegeRow[] = [];
  let workerRoutinePrivileges: WorkerRoutinePrivilegeRow[] = [];
  let workerSecurityDefinerRoutines: WorkerSecurityDefinerRoutineRow[] = [];
  try {
    const version = await pool.query<{
      serverVersion: string;
      serverVersionNum: number;
    }>(
      `SELECT current_setting('server_version') AS "serverVersion",
              current_setting('server_version_num')::integer AS "serverVersionNum"`,
    );
    serverVersion = version.rows[0]?.serverVersion ?? "";
    serverVersionNum = version.rows[0]?.serverVersionNum ?? 0;

    const tables = await pool.query<RlsTableRow>(
      `SELECT relation.relname AS "table",
              relation.relrowsecurity AS "rlsEnabled",
              relation.relforcerowsecurity AS "rlsForced",
              COUNT(policy.oid)::integer AS "policyCount"
         FROM pg_class relation
         JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
         LEFT JOIN pg_policy policy ON policy.polrelid = relation.oid
        WHERE namespace.nspname = 'public'
          AND relation.relkind = 'r'
          AND relation.relname = ANY($1::text[])
        GROUP BY relation.oid, relation.relname,
                 relation.relrowsecurity, relation.relforcerowsecurity
        ORDER BY relation.relname`,
      [[...AI_TENANT_RLS_TABLES]],
    );
    rlsTables = tables.rows;

    const roles = await pool.query<ManagedRoleRow>(
      `SELECT rolname AS name,
              rolcanlogin AS login,
              rolsuper AS superuser,
              rolcreatedb AS "createDatabase",
              rolcreaterole AS "createRole",
              rolreplication AS replication,
              rolbypassrls AS "bypassRls",
              rolinherit AS inherit
         FROM pg_roles
        WHERE rolname = ANY($1::text[])
        ORDER BY rolname`,
      [[
        "tecpey_ai_tenant_runtime",
        "tecpey_ai_worker",
        "tecpey_ai_tenant_ci",
        "tecpey_ai_worker_ci",
      ]],
    );
    managedRoles = roles.rows;

    const membershipResult = await pool.query<MembershipRow>(
      `SELECT granted.rolname AS "grantedRole",
              member.rolname AS "memberRole",
              edge.inherit_option AS "inheritOption",
              edge.set_option AS "setOption",
              edge.admin_option AS "adminOption"
         FROM pg_auth_members edge
         JOIN pg_roles granted ON granted.oid = edge.roleid
         JOIN pg_roles member ON member.oid = edge.member
        WHERE granted.rolname = ANY($1::text[])
           OR member.rolname = ANY($1::text[])
        ORDER BY granted.rolname, member.rolname`,
      [[
        "tecpey_ai_tenant_runtime",
        "tecpey_ai_worker",
        "tecpey_ai_tenant_ci",
        "tecpey_ai_worker_ci",
      ]],
    );
    memberships = membershipResult.rows;

    const columnPrivileges = await pool.query<WorkerColumnPrivilegeRow>(
      `SELECT relation.relname AS "table",
              attribute.attname AS column,
              UPPER(acl.privilege_type) AS privilege
         FROM pg_class relation
         JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
         JOIN pg_attribute attribute
           ON attribute.attrelid = relation.oid
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
         CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
         JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND grantee.rolname = 'tecpey_ai_worker'
        ORDER BY relation.relname, attribute.attname, acl.privilege_type`,
    );
    workerColumnPrivileges = columnPrivileges.rows;

    const tablePrivileges = await pool.query<WorkerTablePrivilegeRow>(
      `SELECT relation.relname AS "table",
              UPPER(acl.privilege_type) AS privilege
         FROM pg_class relation
         JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
         CROSS JOIN LATERAL aclexplode(relation.relacl) acl
         JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
          AND grantee.rolname = 'tecpey_ai_worker'
        ORDER BY relation.relname, acl.privilege_type`,
    );
    workerTablePrivileges = tablePrivileges.rows;

    const schemaPrivileges = await pool.query<WorkerSchemaPrivilegeRow>(
      `SELECT namespace.nspname AS schema,
              UPPER(acl.privilege_type) AS privilege
         FROM pg_namespace namespace
         CROSS JOIN LATERAL aclexplode(namespace.nspacl) acl
         JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE grantee.rolname = 'tecpey_ai_worker'
        ORDER BY namespace.nspname, acl.privilege_type`,
    );
    workerSchemaPrivileges = schemaPrivileges.rows;

    const routinePrivileges = await pool.query<WorkerRoutinePrivilegeRow>(
      `SELECT format(
                '%I.%I(%s)',
                namespace.nspname,
                routine.proname,
                pg_get_function_identity_arguments(routine.oid)
              ) AS routine,
              UPPER(acl.privilege_type) AS privilege
         FROM pg_proc routine
         JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
         CROSS JOIN LATERAL aclexplode(routine.proacl) acl
         JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE namespace.nspname = 'public'
          AND grantee.rolname = 'tecpey_ai_worker'
        ORDER BY 1, acl.privilege_type`,
    );
    workerRoutinePrivileges = routinePrivileges.rows;

    const securityDefinerRoutines =
      await pool.query<WorkerSecurityDefinerRoutineRow>(
        `SELECT format(
                  '%I.%I(%s)',
                  namespace.nspname,
                  routine.proname,
                  pg_get_function_identity_arguments(routine.oid)
                ) AS routine
           FROM pg_proc routine
           JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
          WHERE namespace.nspname = 'public'
            AND routine.prosecdef
            AND has_function_privilege(
                  'tecpey_ai_worker', routine.oid, 'EXECUTE'
                )
          ORDER BY 1`,
      );
    workerSecurityDefinerRoutines = securityDefinerRoutines.rows;
  } finally {
    await pool.end();
  }

  const sourceArtifacts = await Promise.all(
    [...AI_TENANT_RLS_EVIDENCE_SOURCE_PATHS].map(async (sourcePath) => ({
      path: sourcePath,
      sha256: sha256(await readFile(path.resolve(sourcePath))),
    })),
  );

  const evidence = {
    schemaVersion: 1,
    authority: "tecpey-ai-tenant-rls-runtime-evidence-v1",
    evidenceClass: "protected-postgresql-16-ai-tenant-rls",
    decision: "PASS",
    source: {
      repository,
      commitSha: candidateSha,
      treeSha: actualTreeSha,
      workflowRef: requiredEnvironment("GITHUB_WORKFLOW_REF"),
    },
    execution: {
      protectedEnvironment: AI_TENANT_RLS_EVIDENCE_ENVIRONMENT,
      eventName: requiredEnvironment("GITHUB_EVENT_NAME"),
      runId,
      runAttempt,
      runUrl: `https://github.com/${repository}/actions/runs/${runId}`,
      collectedAt: new Date().toISOString(),
    },
    postgres: {
      serverVersion,
      serverVersionNum,
      majorVersion: Math.floor(serverVersionNum / 10_000),
      rlsTables,
    },
    roles: {
      managed: managedRoles,
      memberships,
      workerColumnPrivileges,
      workerRoutinePrivileges,
      workerSchemaPrivileges,
      workerSecurityDefinerRoutines,
      workerTablePrivileges,
    },
    tests: {
      command: TEST_COMMAND,
      file: TEST_FILE,
      ...testSummary,
      logSha256: sha256(tapBytes),
    },
    sourceArtifacts,
    privacyBoundary: [
      "github-attested-subject",
      "no-raw-test-logs",
      "no-row-data",
      "no-secrets-or-connection-urls",
      "redacted-aggregate-evidence-only",
    ],
  };

  const findings = validateAiTenantRlsRuntimeEvidence(evidence, {
    expectedSha: candidateSha,
    expectedTreeSha: actualTreeSha,
  });
  if (findings.length > 0) {
    throw new Error(
      `ai_tenant_rls_evidence_policy_failed:${findings.join("|")}`,
    );
  }

  const bytes = `${JSON.stringify(evidence, null, 2)}\n`;
  await atomicWrite(outputPath, bytes);
  await atomicWrite(
    `${outputPath}.sha256`,
    `${sha256(bytes)}  ${path.basename(outputPath)}\n`,
  );
  process.stdout.write(
    `${JSON.stringify({
      status: "ok",
      sourceSha: candidateSha,
      sourceTree: actualTreeSha,
      postgresMajor: 16,
      rlsTables: rlsTables.length,
      tests: testSummary.tests,
      skipped: testSummary.skipped,
      output: path.basename(outputPath),
    })}\n`,
  );
}

void main().catch((error: unknown) => {
  console.error(
    `[ai-tenant-rls-runtime-evidence] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
