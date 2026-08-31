export const AI_TENANT_RLS_EVIDENCE_AUTHORITY =
  "tecpey-ai-tenant-rls-runtime-evidence-v1";

export const AI_TENANT_RLS_EVIDENCE_CLASS =
  "protected-postgresql-16-ai-tenant-rls";

export const AI_TENANT_RLS_EVIDENCE_ENVIRONMENT =
  "ai-tenant-rls-evidence";

export const AI_TENANT_RLS_EVIDENCE_TABLES = Object.freeze([
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
]);

export const AI_TENANT_RLS_EVIDENCE_SOURCE_PATHS = Object.freeze([
  ".github/workflows/ai-tenant-rls-runtime-evidence.yml",
  "package.json",
  "scripts/ai-tenant-rls-runtime-evidence-policy.mjs",
  "scripts/collect-ai-tenant-rls-runtime-evidence.ts",
  "scripts/provision-ai-database-ci-roles.ts",
  "scripts/verify-ai-tenant-rls-runtime-evidence.mjs",
  "src/lib/ai/database-authority.ts",
  "src/lib/db-migrate-ai-tenant-rls.ts",
  "src/tests/security/ai-tenant-rls-postgres.test.ts",
]);

const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const WORKFLOW_REF =
  /^tecpey\/Tecpey-Os\/\.github\/workflows\/ai-tenant-rls-runtime-evidence\.yml@refs\/pull\/[1-9][0-9]*\/merge$/;
const REQUIRED_PRIVACY_BOUNDARY = [
  "github-attested-subject",
  "no-raw-test-logs",
  "no-row-data",
  "no-secrets-or-connection-urls",
  "redacted-aggregate-evidence-only",
];
const EXPECTED_MANAGED_ROLES = new Map([
  ["tecpey_ai_tenant_runtime", { login: false, inherit: false }],
  ["tecpey_ai_worker", { login: false, inherit: false }],
  ["tecpey_ai_tenant_ci", { login: true, inherit: true }],
  ["tecpey_ai_worker_ci", { login: true, inherit: true }],
]);
const EXPECTED_MEMBERSHIPS = [
  "tecpey_ai_tenant_runtime:tecpey_ai_tenant_ci:true:false:false",
  "tecpey_ai_worker:tecpey_ai_worker_ci:true:false:false",
];
export const AI_TENANT_RLS_EVIDENCE_WORKER_COLUMN_PRIVILEGES = Object.freeze([
  "ai_automation_policies:last_enqueued_at:UPDATE",
  "ai_automation_policies:next_run_at:UPDATE",
  "ai_automation_reviews:decision:SELECT",
  "ai_automation_reviews:review_kind:SELECT",
  "ai_automation_reviews:run_id:SELECT",
  "ai_automation_run_events:actor_id:INSERT",
  "ai_automation_run_events:actor_type:INSERT",
  "ai_automation_run_events:event_type:INSERT",
  "ai_automation_run_events:from_status:INSERT",
  "ai_automation_run_events:metadata:INSERT",
  "ai_automation_run_events:run_id:INSERT",
  "ai_automation_run_events:tenant_id:INSERT",
  "ai_automation_run_events:to_status:INSERT",
  "ai_automation_run_events:workspace_id:INSERT",
  "ai_automation_runs:ai_quorum:INSERT",
  "ai_automation_runs:ai_reviewer_ids:INSERT",
  "ai_automation_runs:attempt_count:UPDATE",
  "ai_automation_runs:c_level_quorum:INSERT",
  "ai_automation_runs:c_level_role_ids:INSERT",
  "ai_automation_runs:command_hash:INSERT",
  "ai_automation_runs:criticality:INSERT",
  "ai_automation_runs:data_class:INSERT",
  "ai_automation_runs:expires_at:INSERT",
  "ai_automation_runs:external_effect:INSERT",
  "ai_automation_runs:failure_code:UPDATE",
  "ai_automation_runs:free_fallback_allowed:INSERT",
  "ai_automation_runs:id:INSERT",
  "ai_automation_runs:idempotency_key:INSERT",
  "ai_automation_runs:input_hash:INSERT",
  "ai_automation_runs:input_text:INSERT",
  "ai_automation_runs:lease_expires_at:UPDATE",
  "ai_automation_runs:lease_owner:UPDATE",
  "ai_automation_runs:manager_quorum:INSERT",
  "ai_automation_runs:manager_role_ids:INSERT",
  "ai_automation_runs:max_attempts:INSERT",
  "ai_automation_runs:policy_version:INSERT",
  "ai_automation_runs:resource_type:INSERT",
  "ai_automation_runs:status:UPDATE",
  "ai_automation_runs:tenant_id:INSERT",
  "ai_automation_runs:trigger_type:INSERT",
  "ai_automation_runs:workflow_id:INSERT",
  "ai_automation_runs:workspace_id:INSERT",
]);
export const AI_TENANT_RLS_EVIDENCE_WORKER_TABLE_PRIVILEGES = Object.freeze([
  "_migration_runtime_state:SELECT",
  "ai_automation_policies:SELECT",
  "ai_automation_runs:SELECT",
]);
export const AI_TENANT_RLS_EVIDENCE_WORKER_SCHEMA_PRIVILEGES =
  Object.freeze(["public:USAGE"]);
export const AI_TENANT_RLS_EVIDENCE_WORKER_ROUTINE_PRIVILEGES =
  Object.freeze([]);
export const AI_TENANT_RLS_EVIDENCE_WORKER_SECURITY_DEFINER_ROUTINES =
  Object.freeze([]);
const EXPECTED_TEST_COMMAND =
  "node --import tsx --test --test-force-exit --test-reporter=tap src/tests/security/ai-tenant-rls-postgres.test.ts";
const FORBIDDEN_KEYS = new Set([
  "connectionstring",
  "databaseurl",
  "hmac",
  "password",
  "rawlog",
  "rawlogs",
  "rawrow",
  "rawrows",
  "secret",
  "token",
]);
const FORBIDDEN_VALUES = [
  /postgres(?:ql)?:\/\//i,
  /DATABASE_URL\s*=/i,
  /BEGIN [A-Z ]*PRIVATE KEY/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
];

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys, label, findings) {
  if (!isRecord(value)) {
    findings.push(`${label} must be an object`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    findings.push(`${label} fields are not exact`);
    return false;
  }
  return true;
}

function exactStringSet(value, expected, label, findings) {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string") ||
    JSON.stringify([...value].sort()) !== JSON.stringify([...expected].sort())
  ) {
    findings.push(`${label} must equal the governed set`);
  }
}

function forbidRawMaterial(value, findings, path = "evidence") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      forbidRawMaterial(entry, findings, `${path}[${index}]`),
    );
    return;
  }
  if (!isRecord(value)) {
    if (
      typeof value === "string" &&
      FORBIDDEN_VALUES.some((pattern) => pattern.test(value))
    ) {
      findings.push(`${path} contains forbidden raw material`);
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    const normalized = key.replace(/[_-]/g, "").toLowerCase();
    if (FORBIDDEN_KEYS.has(normalized)) {
      findings.push(`${path}.${key} is forbidden`);
    }
    forbidRawMaterial(entry, findings, `${path}.${key}`);
  }
}

function validIsoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/**
 * @param {unknown} evidence
 * @param {{expectedSha?: string | null, expectedTreeSha?: string | null}} [options]
 * @returns {string[]}
 */
export function validateAiTenantRlsRuntimeEvidence(
  evidence,
  { expectedSha = null, expectedTreeSha = null } = {},
) {
  const findings = [];
  forbidRawMaterial(evidence, findings);
  if (
    !exactKeys(
      evidence,
      [
        "schemaVersion",
        "authority",
        "evidenceClass",
        "decision",
        "source",
        "execution",
        "postgres",
        "roles",
        "tests",
        "sourceArtifacts",
        "privacyBoundary",
      ],
      "evidence",
      findings,
    )
  ) {
    return findings;
  }

  if (evidence.schemaVersion !== 1) findings.push("schemaVersion must be 1");
  if (evidence.authority !== AI_TENANT_RLS_EVIDENCE_AUTHORITY) {
    findings.push("authority is invalid");
  }
  if (evidence.evidenceClass !== AI_TENANT_RLS_EVIDENCE_CLASS) {
    findings.push("evidenceClass is invalid");
  }
  if (evidence.decision !== "PASS") findings.push("decision must be PASS");

  if (
    exactKeys(
      evidence.source,
      ["repository", "commitSha", "treeSha", "workflowRef"],
      "source",
      findings,
    )
  ) {
    if (evidence.source.repository !== "tecpey/Tecpey-Os") {
      findings.push("source.repository is invalid");
    }
    if (!SHA1.test(evidence.source.commitSha ?? "")) {
      findings.push("source.commitSha is invalid");
    }
    if (!SHA1.test(evidence.source.treeSha ?? "")) {
      findings.push("source.treeSha is invalid");
    }
    if (expectedSha && evidence.source.commitSha !== expectedSha) {
      findings.push("source.commitSha does not match the expected head");
    }
    if (expectedTreeSha && evidence.source.treeSha !== expectedTreeSha) {
      findings.push("source.treeSha does not match the expected tree");
    }
    if (!WORKFLOW_REF.test(evidence.source.workflowRef ?? "")) {
      findings.push("source.workflowRef is invalid");
    }
  }

  if (
    exactKeys(
      evidence.execution,
      [
        "protectedEnvironment",
        "eventName",
        "runId",
        "runAttempt",
        "runUrl",
        "collectedAt",
      ],
      "execution",
      findings,
    )
  ) {
    if (
      evidence.execution.protectedEnvironment !==
      AI_TENANT_RLS_EVIDENCE_ENVIRONMENT
    ) {
      findings.push("execution.protectedEnvironment is invalid");
    }
    if (evidence.execution.eventName !== "pull_request") {
      findings.push("execution.eventName is invalid");
    }
    if (
      !Number.isSafeInteger(evidence.execution.runId) ||
      evidence.execution.runId <= 0
    ) {
      findings.push("execution.runId is invalid");
    }
    if (
      !Number.isSafeInteger(evidence.execution.runAttempt) ||
      evidence.execution.runAttempt <= 0
    ) {
      findings.push("execution.runAttempt is invalid");
    }
    const expectedRunUrl = `https://github.com/tecpey/Tecpey-Os/actions/runs/${evidence.execution.runId}`;
    if (evidence.execution.runUrl !== expectedRunUrl) {
      findings.push("execution.runUrl is invalid");
    }
    if (!validIsoTimestamp(evidence.execution.collectedAt)) {
      findings.push("execution.collectedAt is invalid");
    }
  }

  if (
    exactKeys(
      evidence.postgres,
      ["serverVersion", "serverVersionNum", "majorVersion", "rlsTables"],
      "postgres",
      findings,
    )
  ) {
    if (
      typeof evidence.postgres.serverVersion !== "string" ||
      !evidence.postgres.serverVersion.startsWith("16.")
    ) {
      findings.push("postgres.serverVersion must be PostgreSQL 16");
    }
    if (
      !Number.isSafeInteger(evidence.postgres.serverVersionNum) ||
      evidence.postgres.serverVersionNum < 160000 ||
      evidence.postgres.serverVersionNum >= 170000
    ) {
      findings.push("postgres.serverVersionNum must be PostgreSQL 16");
    }
    if (evidence.postgres.majorVersion !== 16) {
      findings.push("postgres.majorVersion must be 16");
    }
    const tables = evidence.postgres.rlsTables;
    if (!Array.isArray(tables)) {
      findings.push("postgres.rlsTables must be an array");
    } else {
      exactStringSet(
        tables.map((entry) => entry?.table),
        AI_TENANT_RLS_EVIDENCE_TABLES,
        "postgres.rlsTables names",
        findings,
      );
      for (const entry of tables) {
        if (
          !exactKeys(
            entry,
            ["table", "rlsEnabled", "rlsForced", "policyCount"],
            `postgres.rlsTables.${entry?.table ?? "unknown"}`,
            findings,
          )
        ) {
          continue;
        }
        if (entry.rlsEnabled !== true || entry.rlsForced !== true) {
          findings.push(`${entry.table} must have ENABLE and FORCE RLS`);
        }
        if (!Number.isSafeInteger(entry.policyCount) || entry.policyCount < 1) {
          findings.push(`${entry.table} must have at least one policy`);
        }
      }
    }
  }

  if (
    exactKeys(
      evidence.roles,
      [
        "managed",
        "memberships",
        "workerColumnPrivileges",
        "workerRoutinePrivileges",
        "workerSchemaPrivileges",
        "workerSecurityDefinerRoutines",
        "workerTablePrivileges",
      ],
      "roles",
      findings,
    )
  ) {
    if (!Array.isArray(evidence.roles.managed)) {
      findings.push("roles.managed must be an array");
    } else {
      exactStringSet(
        evidence.roles.managed.map((entry) => entry?.name),
        [...EXPECTED_MANAGED_ROLES.keys()],
        "roles.managed names",
        findings,
      );
      for (const entry of evidence.roles.managed) {
        if (
          !exactKeys(
            entry,
            [
              "name",
              "login",
              "superuser",
              "createDatabase",
              "createRole",
              "replication",
              "bypassRls",
              "inherit",
            ],
            `roles.managed.${entry?.name ?? "unknown"}`,
            findings,
          )
        ) {
          continue;
        }
        const expectedRole = EXPECTED_MANAGED_ROLES.get(entry.name);
        if (entry.login !== expectedRole?.login) {
          findings.push(`${entry.name} login capability is invalid`);
        }
        if (
          entry.superuser !== false ||
          entry.createDatabase !== false ||
          entry.createRole !== false ||
          entry.replication !== false ||
          entry.bypassRls !== false
        ) {
          findings.push(`${entry.name} must not bypass database authority`);
        }
        if (entry.inherit !== expectedRole?.inherit) {
          findings.push(`${entry.name} inherit flag is invalid`);
        }
      }
    }

    if (Array.isArray(evidence.roles.memberships)) {
      for (const entry of evidence.roles.memberships) {
        exactKeys(
          entry,
          [
            "grantedRole",
            "memberRole",
            "inheritOption",
            "setOption",
            "adminOption",
          ],
          `roles.memberships.${entry?.grantedRole ?? "unknown"}`,
          findings,
        );
      }
    }
    exactStringSet(
      Array.isArray(evidence.roles.memberships)
        ? evidence.roles.memberships.map(
            (entry) =>
              `${entry?.grantedRole}:${entry?.memberRole}:${entry?.inheritOption}:${entry?.setOption}:${entry?.adminOption}`,
          )
        : null,
      EXPECTED_MEMBERSHIPS,
      "roles.memberships",
      findings,
    );

    if (Array.isArray(evidence.roles.workerColumnPrivileges)) {
      for (const entry of evidence.roles.workerColumnPrivileges) {
        exactKeys(
          entry,
          ["table", "column", "privilege"],
          `roles.workerColumnPrivileges.${entry?.table ?? "unknown"}.${entry?.column ?? "unknown"}`,
          findings,
        );
      }
    }
    exactStringSet(
      Array.isArray(evidence.roles.workerColumnPrivileges)
        ? evidence.roles.workerColumnPrivileges.map(
            (entry) =>
              `${entry?.table}:${entry?.column}:${entry?.privilege}`,
          )
        : null,
      AI_TENANT_RLS_EVIDENCE_WORKER_COLUMN_PRIVILEGES,
      "roles.workerColumnPrivileges",
      findings,
    );

    if (Array.isArray(evidence.roles.workerTablePrivileges)) {
      for (const entry of evidence.roles.workerTablePrivileges) {
        exactKeys(
          entry,
          ["table", "privilege"],
          `roles.workerTablePrivileges.${entry?.table ?? "unknown"}`,
          findings,
        );
      }
    }
    exactStringSet(
      Array.isArray(evidence.roles.workerTablePrivileges)
        ? evidence.roles.workerTablePrivileges.map(
            (entry) => `${entry?.table}:${entry?.privilege}`,
          )
        : null,
      AI_TENANT_RLS_EVIDENCE_WORKER_TABLE_PRIVILEGES,
      "roles.workerTablePrivileges",
      findings,
    );

    if (Array.isArray(evidence.roles.workerSchemaPrivileges)) {
      for (const entry of evidence.roles.workerSchemaPrivileges) {
        exactKeys(
          entry,
          ["schema", "privilege"],
          `roles.workerSchemaPrivileges.${entry?.schema ?? "unknown"}`,
          findings,
        );
      }
    }
    exactStringSet(
      Array.isArray(evidence.roles.workerSchemaPrivileges)
        ? evidence.roles.workerSchemaPrivileges.map(
            (entry) => `${entry?.schema}:${entry?.privilege}`,
          )
        : null,
      AI_TENANT_RLS_EVIDENCE_WORKER_SCHEMA_PRIVILEGES,
      "roles.workerSchemaPrivileges",
      findings,
    );

    if (Array.isArray(evidence.roles.workerRoutinePrivileges)) {
      for (const entry of evidence.roles.workerRoutinePrivileges) {
        exactKeys(
          entry,
          ["routine", "privilege"],
          `roles.workerRoutinePrivileges.${entry?.routine ?? "unknown"}`,
          findings,
        );
      }
    }
    exactStringSet(
      Array.isArray(evidence.roles.workerRoutinePrivileges)
        ? evidence.roles.workerRoutinePrivileges.map(
            (entry) => `${entry?.routine}:${entry?.privilege}`,
          )
        : null,
      AI_TENANT_RLS_EVIDENCE_WORKER_ROUTINE_PRIVILEGES,
      "roles.workerRoutinePrivileges",
      findings,
    );

    if (Array.isArray(evidence.roles.workerSecurityDefinerRoutines)) {
      for (const entry of evidence.roles.workerSecurityDefinerRoutines) {
        exactKeys(
          entry,
          ["routine"],
          `roles.workerSecurityDefinerRoutines.${entry?.routine ?? "unknown"}`,
          findings,
        );
      }
    }
    exactStringSet(
      Array.isArray(evidence.roles.workerSecurityDefinerRoutines)
        ? evidence.roles.workerSecurityDefinerRoutines.map(
            (entry) => entry?.routine,
          )
        : null,
      AI_TENANT_RLS_EVIDENCE_WORKER_SECURITY_DEFINER_ROUTINES,
      "roles.workerSecurityDefinerRoutines",
      findings,
    );
  }

  if (
    exactKeys(
      evidence.tests,
      [
        "command",
        "file",
        "tests",
        "pass",
        "fail",
        "skipped",
        "cancelled",
        "durationMs",
        "logSha256",
      ],
      "tests",
      findings,
    )
  ) {
    if (evidence.tests.command !== EXPECTED_TEST_COMMAND) {
      findings.push("tests.command is invalid");
    }
    if (
      evidence.tests.file !==
      "src/tests/security/ai-tenant-rls-postgres.test.ts"
    ) {
      findings.push("tests.file is invalid");
    }
    if (
      !Number.isSafeInteger(evidence.tests.tests) ||
      evidence.tests.tests < 6 ||
      evidence.tests.pass !== evidence.tests.tests ||
      evidence.tests.fail !== 0 ||
      evidence.tests.skipped !== 0 ||
      evidence.tests.cancelled !== 0
    ) {
      findings.push("tests must pass completely with zero failures and zero skips");
    }
    if (
      typeof evidence.tests.durationMs !== "number" ||
      !Number.isFinite(evidence.tests.durationMs) ||
      evidence.tests.durationMs <= 0
    ) {
      findings.push("tests.durationMs is invalid");
    }
    if (!SHA256.test(evidence.tests.logSha256 ?? "")) {
      findings.push("tests.logSha256 is invalid");
    }
  }

  if (!Array.isArray(evidence.sourceArtifacts)) {
    findings.push("sourceArtifacts must be an array");
  } else {
    exactStringSet(
      evidence.sourceArtifacts.map((entry) => entry?.path),
      AI_TENANT_RLS_EVIDENCE_SOURCE_PATHS,
      "sourceArtifacts paths",
      findings,
    );
    for (const entry of evidence.sourceArtifacts) {
      if (
        !exactKeys(
          entry,
          ["path", "sha256"],
          `sourceArtifacts.${entry?.path ?? "unknown"}`,
          findings,
        )
      ) {
        continue;
      }
      if (!SHA256.test(entry.sha256 ?? "")) {
        findings.push(`${entry.path} digest is invalid`);
      }
    }
  }

  exactStringSet(
    evidence.privacyBoundary,
    REQUIRED_PRIVACY_BOUNDARY,
    "privacyBoundary",
    findings,
  );
  return [...new Set(findings)];
}
