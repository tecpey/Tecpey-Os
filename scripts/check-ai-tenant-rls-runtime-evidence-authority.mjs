import { readFile } from "node:fs/promises";

import { AI_TENANT_RLS_EVIDENCE_WORKER_COLUMN_PRIVILEGES } from "./ai-tenant-rls-runtime-evidence-policy.mjs";

const files = {
  workflow: ".github/workflows/ai-tenant-rls-runtime-evidence.yml",
  package: "package.json",
  collector: "scripts/collect-ai-tenant-rls-runtime-evidence.ts",
  verifier: "scripts/verify-ai-tenant-rls-runtime-evidence.mjs",
  policy: "scripts/ai-tenant-rls-runtime-evidence-policy.mjs",
  policyTest: "scripts/ai-tenant-rls-runtime-evidence-policy.test.mjs",
  migration: "src/lib/db-migrate-ai-tenant-rls.ts",
  postgresTest: "src/tests/security/ai-tenant-rls-postgres.test.ts",
  contract: "docs/security/AI_TENANT_DATABASE_INTEGRITY.md",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [
      key,
      await readFile(file, "utf8"),
    ]),
  ),
);
const packageJson = JSON.parse(source.package);
const failures = [];

function sameStringSet(left, right) {
  return (
    JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
  );
}

function requireText(target, value, reason) {
  if (!source[target].includes(value)) {
    failures.push(`${files[target]}: ${reason}`);
  }
}

function rejectText(target, value, reason) {
  if (source[target].includes(value)) {
    failures.push(`${files[target]}: ${reason}`);
  }
}

for (const marker of [
  "pull_request:\n    branches:\n      - main",
  "EXPECTED_BASE_REF: main",
  "environment: ai-tenant-rls-evidence",
  "permissions:",
  "contents: read",
  "id-token: write",
  "attestations: write",
  "postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777",
  "Verify exact source identity",
  "EXPECTED_HEAD_REPOSITORY: tecpey/Tecpey-Os",
  "Provision least-privilege AI database fixtures",
  "--test-reporter=tap",
  "src/tests/security/ai-tenant-rls-postgres.test.ts",
  "Collect redacted runtime evidence",
  "Verify detached digest and evidence policy",
  "actions/attest-build-provenance@43d14bc2b83dec42d39ecae14e916627a18bb661",
  "subject-path:",
  "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
  "if-no-files-found: error",
]) {
  requireText("workflow", marker, `workflow is missing ${marker}`);
}
for (const forbidden of [
  "pull_request_target:",
  "continue-on-error:",
  "BYPASSRLS",
  "SUPERUSER",
  "secrets.DATABASE_URL",
  "secrets.TECPEY_AI_CONTEXT_HMAC_KEY_B64",
  "deploy",
]) {
  rejectText("workflow", forbidden, `workflow contains forbidden authority: ${forbidden}`);
}

const expectedScripts = new Map([
  [
    "ai:database:runtime-evidence:collect",
    "node --import tsx scripts/collect-ai-tenant-rls-runtime-evidence.ts",
  ],
  [
    "ai:database:runtime-evidence:verify",
    "node scripts/verify-ai-tenant-rls-runtime-evidence.mjs",
  ],
  [
    "ai:database:runtime-evidence:check",
    "node scripts/check-ai-tenant-rls-runtime-evidence-authority.mjs",
  ],
  [
    "test:ai-database-runtime-evidence",
    "node --test scripts/ai-tenant-rls-runtime-evidence-policy.test.mjs",
  ],
]);
for (const [name, command] of expectedScripts) {
  if (packageJson.scripts?.[name] !== command) {
    failures.push(`package.json: ${name} must equal ${command}`);
  }
}

const workerColumnGrantSpecs = [
  ["ai_automation_policies", "UPDATE"],
  ["ai_automation_runs", "INSERT"],
  ["ai_automation_runs", "UPDATE"],
  ["ai_automation_reviews", "SELECT"],
  ["ai_automation_run_events", "INSERT"],
];
const migrationWorkerColumnPrivileges = [];
for (const [table, privilege] of workerColumnGrantSpecs) {
  const grantPattern = new RegExp(
    `GRANT\\s+${privilege}\\s*\\(([^)]*)\\)\\s*ON TABLE\\s+${table}`,
    "u",
  );
  const match = grantPattern.exec(source.migration);
  if (!match) {
    failures.push(
      `${files.migration}: missing governed worker ${privilege} columns on ${table}`,
    );
    continue;
  }
  for (const column of match[1].split(",").map((value) => value.trim())) {
    if (column) {
      migrationWorkerColumnPrivileges.push(`${table}:${column}:${privilege}`);
    }
  }
}
if (
  !sameStringSet(
    migrationWorkerColumnPrivileges,
    AI_TENANT_RLS_EVIDENCE_WORKER_COLUMN_PRIVILEGES,
  )
) {
  failures.push(
    `${files.policy}: worker column ACL policy does not exactly match the migration authority`,
  );
}
if (
  !packageJson.scripts?.["ai:trust:check"]?.includes(
    "npm run ai:database:runtime-evidence:check",
  )
) {
  failures.push(
    "package.json: ai:trust:check must enforce the runtime-evidence authority",
  );
}
if (
  !packageJson.scripts?.["test:ai-mentor-trust"]?.includes(
    "scripts/ai-tenant-rls-runtime-evidence-policy.test.mjs",
  )
) {
  failures.push(
    "package.json: test:ai-mentor-trust must execute runtime-evidence policy tests",
  );
}

for (const marker of [
  "TECPEY_AI_RLS_EVIDENCE_ENVIRONMENT",
  "GITHUB_ACTIONS",
  "rev-parse",
  "HEAD^{tree}",
  "parseTapMetric",
  "testSummary.skipped !== 0",
  "pg_auth_members",
  "inherit_option",
  "set_option",
  "admin_option",
  "rolcreatedb",
  "rolcreaterole",
  "rolreplication",
  "relrowsecurity",
  "relforcerowsecurity",
  "aclexplode",
  "workerColumnPrivileges",
  "workerRoutinePrivileges",
  "workerSchemaPrivileges",
  "workerSecurityDefinerRoutines",
  "validateAiTenantRlsRuntimeEvidence",
  "no-secrets-or-connection-urls",
]) {
  requireText("collector", marker, `collector is missing ${marker}`);
}
for (const forbidden of ["databaseUrl:", "rawTestLog:", "rawRows:"]) {
  rejectText(
    "collector",
    forbidden,
    `collector may serialize protected material: ${forbidden}`,
  );
}

for (const marker of [
  "ai_tenant_rls_evidence_detached_digest_invalid",
  "validateAiTenantRlsRuntimeEvidence",
  "expectedSha",
  "expectedTreeSha",
]) {
  requireText("verifier", marker, `verifier is missing ${marker}`);
}
for (const marker of [
  "PostgreSQL 16",
  "tests must pass completely with zero failures and zero skips",
  "roles.memberships",
  "roles.workerColumnPrivileges",
  "roles.workerRoutinePrivileges",
  "roles.workerSchemaPrivileges",
  "roles.workerSecurityDefinerRoutines",
  "sourceArtifacts",
  "FORBIDDEN_VALUES",
]) {
  requireText("policy", marker, `policy is missing ${marker}`);
}
for (const marker of [
  "rejects workflow provenance ref drift",
  "rejects PostgreSQL versions outside major 16",
  "rejects skipped or failed adversarial tests",
  "rejects SUPERUSER or BYPASSRLS role drift",
  "rejects PostgreSQL membership option drift",
  "rejects undeclared role membership expansion",
  "rejects managed role capability or inheritance drift",
  "rejects worker quorum-column expansion",
  "rejects worker relation or routine privilege expansion",
  "rejects secret-shaped or connection URL material",
]) {
  requireText("policyTest", marker, `policy tests are missing ${marker}`);
}
for (const marker of [
  "AI_TENANT_RLS_TABLES",
  "ENABLE ROW LEVEL SECURITY",
  "FORCE ROW LEVEL SECURITY",
]) {
  requireText("migration", marker, `migration authority is missing ${marker}`);
}
for (const marker of [
  "replay",
  "forged or replayed GUC context",
  "pg_temp",
  "pool",
  "worker",
  "membership_can_admin: false",
]) {
  requireText("postgresTest", marker, `PostgreSQL adversarial suite is missing ${marker}`);
}
for (const marker of [
  "Protected PostgreSQL 16 runtime evidence",
  "GitHub OIDC artifact attestation",
  "zero skipped tests",
  "ai-tenant-rls-evidence",
  "signed_rls_runtime_evidence_pending",
]) {
  requireText("contract", marker, `security contract is missing ${marker}`);
}

if (failures.length > 0) {
  console.error(
    "AI tenant RLS runtime evidence authority failed:\n- " +
      failures.join("\n- "),
  );
  process.exit(1);
}

console.log(
  "AI tenant RLS runtime evidence authority passed: protected PostgreSQL 16, zero-skip adversarial execution, redacted digest binding and GitHub OIDC attestation remain mandatory.",
);
