import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AI_TENANT_RLS_EVIDENCE_SOURCE_PATHS,
  AI_TENANT_RLS_EVIDENCE_TABLES,
  AI_TENANT_RLS_EVIDENCE_WORKER_COLUMN_PRIVILEGES,
  AI_TENANT_RLS_EVIDENCE_WORKER_ROUTINE_PRIVILEGES,
  AI_TENANT_RLS_EVIDENCE_WORKER_SCHEMA_PRIVILEGES,
  AI_TENANT_RLS_EVIDENCE_WORKER_SECURITY_DEFINER_ROUTINES,
  AI_TENANT_RLS_EVIDENCE_WORKER_TABLE_PRIVILEGES,
  validateAiTenantRlsRuntimeEvidence,
} from "./ai-tenant-rls-runtime-evidence-policy.mjs";

const SHA = "a".repeat(40);
const TREE = "b".repeat(40);

function workerColumnPrivilege(value) {
  const [table, column, privilege] = value.split(":");
  return { table, column, privilege };
}

function workerTablePrivilege(value) {
  const [table, privilege] = value.split(":");
  return { table, privilege };
}

function workerSchemaPrivilege(value) {
  const [schema, privilege] = value.split(":");
  return { schema, privilege };
}

function workerRoutinePrivilege(value) {
  const separator = value.lastIndexOf(":");
  return {
    routine: value.slice(0, separator),
    privilege: value.slice(separator + 1),
  };
}

function evidenceFixture() {
  return {
    schemaVersion: 1,
    authority: "tecpey-ai-tenant-rls-runtime-evidence-v1",
    evidenceClass: "protected-postgresql-16-ai-tenant-rls",
    decision: "PASS",
    source: {
      repository: "tecpey/Tecpey-Os",
      commitSha: SHA,
      treeSha: TREE,
      workflowRef:
        "tecpey/Tecpey-Os/.github/workflows/ai-tenant-rls-runtime-evidence.yml@refs/pull/579/merge",
    },
    execution: {
      protectedEnvironment: "ai-tenant-rls-evidence",
      eventName: "pull_request",
      runId: 123,
      runAttempt: 1,
      runUrl: "https://github.com/tecpey/Tecpey-Os/actions/runs/123",
      collectedAt: "2026-08-30T17:00:00.000Z",
    },
    postgres: {
      serverVersion: "16.10",
      serverVersionNum: 160010,
      majorVersion: 16,
      rlsTables: AI_TENANT_RLS_EVIDENCE_TABLES.map((table) => ({
        table,
        rlsEnabled: true,
        rlsForced: true,
        policyCount: table.startsWith("ai_automation_") ? 2 : 1,
      })),
    },
    roles: {
      managed: [
        {
          name: "tecpey_ai_tenant_runtime",
          login: false,
          superuser: false,
          createDatabase: false,
          createRole: false,
          replication: false,
          bypassRls: false,
          inherit: false,
        },
        {
          name: "tecpey_ai_worker",
          login: false,
          superuser: false,
          createDatabase: false,
          createRole: false,
          replication: false,
          bypassRls: false,
          inherit: false,
        },
        {
          name: "tecpey_ai_tenant_ci",
          login: true,
          superuser: false,
          createDatabase: false,
          createRole: false,
          replication: false,
          bypassRls: false,
          inherit: true,
        },
        {
          name: "tecpey_ai_worker_ci",
          login: true,
          superuser: false,
          createDatabase: false,
          createRole: false,
          replication: false,
          bypassRls: false,
          inherit: true,
        },
      ],
      memberships: [
        {
          grantedRole: "tecpey_ai_tenant_runtime",
          memberRole: "tecpey_ai_tenant_ci",
          inheritOption: true,
          setOption: false,
          adminOption: false,
        },
        {
          grantedRole: "tecpey_ai_worker",
          memberRole: "tecpey_ai_worker_ci",
          inheritOption: true,
          setOption: false,
          adminOption: false,
        },
      ],
      workerColumnPrivileges:
        AI_TENANT_RLS_EVIDENCE_WORKER_COLUMN_PRIVILEGES.map(
          workerColumnPrivilege,
        ),
      workerRoutinePrivileges:
        AI_TENANT_RLS_EVIDENCE_WORKER_ROUTINE_PRIVILEGES.map(
          workerRoutinePrivilege,
        ),
      workerSchemaPrivileges:
        AI_TENANT_RLS_EVIDENCE_WORKER_SCHEMA_PRIVILEGES.map(
          workerSchemaPrivilege,
        ),
      workerSecurityDefinerRoutines:
        AI_TENANT_RLS_EVIDENCE_WORKER_SECURITY_DEFINER_ROUTINES.map(
          (routine) => ({ routine }),
        ),
      workerTablePrivileges:
        AI_TENANT_RLS_EVIDENCE_WORKER_TABLE_PRIVILEGES.map(
          workerTablePrivilege,
        ),
    },
    tests: {
      command:
        "node --import tsx --test --test-force-exit --test-reporter=tap src/tests/security/ai-tenant-rls-postgres.test.ts",
      file: "src/tests/security/ai-tenant-rls-postgres.test.ts",
      tests: 6,
      pass: 6,
      fail: 0,
      skipped: 0,
      cancelled: 0,
      durationMs: 1200.5,
      logSha256: "c".repeat(64),
    },
    sourceArtifacts: AI_TENANT_RLS_EVIDENCE_SOURCE_PATHS.map((sourcePath) => ({
      path: sourcePath,
      sha256: "d".repeat(64),
    })),
    privacyBoundary: [
      "github-attested-subject",
      "no-raw-test-logs",
      "no-row-data",
      "no-secrets-or-connection-urls",
      "redacted-aggregate-evidence-only",
    ],
  };
}

describe("AI tenant RLS runtime evidence policy", () => {
  it("accepts exact PostgreSQL 16 evidence with zero skips", () => {
    assert.deepEqual(
      validateAiTenantRlsRuntimeEvidence(evidenceFixture(), {
        expectedSha: SHA,
        expectedTreeSha: TREE,
      }),
      [],
    );
  });

  it("rejects source identity drift", () => {
    const evidence = evidenceFixture();
    const findings = validateAiTenantRlsRuntimeEvidence(evidence, {
      expectedSha: "e".repeat(40),
      expectedTreeSha: "f".repeat(40),
    });
    assert.equal(
      findings.includes("source.commitSha does not match the expected head"),
      true,
    );
    assert.equal(
      findings.includes("source.treeSha does not match the expected tree"),
      true,
    );
  });

  it("rejects workflow provenance ref drift", () => {
    const evidence = evidenceFixture();
    evidence.source.workflowRef =
      "attacker/repo/.github/workflows/ai-tenant-rls-runtime-evidence.yml@refs/heads/main";
    const findings = validateAiTenantRlsRuntimeEvidence(evidence);
    assert.equal(findings.includes("source.workflowRef is invalid"), true);
  });

  it("rejects PostgreSQL versions outside major 16", () => {
    const evidence = evidenceFixture();
    evidence.postgres.serverVersion = "15.14";
    evidence.postgres.serverVersionNum = 150014;
    evidence.postgres.majorVersion = 15;
    const findings = validateAiTenantRlsRuntimeEvidence(evidence);
    assert.equal(findings.some((item) => item.includes("PostgreSQL 16")), true);
  });

  it("rejects skipped or failed adversarial tests", () => {
    const evidence = evidenceFixture();
    evidence.tests.pass = 5;
    evidence.tests.skipped = 1;
    const findings = validateAiTenantRlsRuntimeEvidence(evidence);
    assert.equal(
      findings.includes(
        "tests must pass completely with zero failures and zero skips",
      ),
      true,
    );
  });

  it("rejects any governed table without FORCE RLS", () => {
    const evidence = evidenceFixture();
    evidence.postgres.rlsTables[4].rlsForced = false;
    const findings = validateAiTenantRlsRuntimeEvidence(evidence);
    assert.equal(
      findings.some((item) => item.includes("ENABLE and FORCE RLS")),
      true,
    );
  });

  it("rejects SUPERUSER or BYPASSRLS role drift", () => {
    const evidence = evidenceFixture();
    evidence.roles.managed[1].bypassRls = true;
    const findings = validateAiTenantRlsRuntimeEvidence(evidence);
    assert.equal(
      findings.some((item) => item.includes("must not bypass database authority")),
      true,
    );
  });

  it("rejects PostgreSQL membership option drift", () => {
    const evidence = evidenceFixture();
    evidence.roles.memberships[0].setOption = true;
    const findings = validateAiTenantRlsRuntimeEvidence(evidence);
    assert.equal(
      findings.includes("roles.memberships must equal the governed set"),
      true,
    );
  });

  it("rejects undeclared role membership expansion", () => {
    const evidence = evidenceFixture();
    evidence.roles.memberships.push({
      grantedRole: "pg_read_all_data",
      memberRole: "tecpey_ai_worker_ci",
      inheritOption: true,
      setOption: true,
      adminOption: false,
    });
    const findings = validateAiTenantRlsRuntimeEvidence(evidence);
    assert.equal(
      findings.includes("roles.memberships must equal the governed set"),
      true,
    );
  });

  it("rejects managed role capability or inheritance drift", () => {
    const evidence = evidenceFixture();
    evidence.roles.managed[1].inherit = true;
    evidence.roles.managed[2].createDatabase = true;
    const findings = validateAiTenantRlsRuntimeEvidence(evidence);
    assert.equal(
      findings.some((item) => item.includes("inherit flag is invalid")),
      true,
    );
    assert.equal(
      findings.some((item) => item.includes("must not bypass database authority")),
      true,
    );
  });

  it("rejects worker quorum-column expansion", () => {
    const evidence = evidenceFixture();
    evidence.roles.workerColumnPrivileges.push({
      table: "ai_automation_reviews",
      column: "comment",
      privilege: "SELECT",
    });
    const findings = validateAiTenantRlsRuntimeEvidence(evidence);
    assert.equal(
      findings.includes(
        "roles.workerColumnPrivileges must equal the governed set",
      ),
      true,
    );
  });

  it("rejects worker relation or routine privilege expansion", () => {
    const evidence = evidenceFixture();
    evidence.roles.workerTablePrivileges.push({
      table: "ai_provider_configs",
      privilege: "SELECT",
    });
    evidence.roles.workerRoutinePrivileges.push({
      routine: "public.unsafe_bridge()",
      privilege: "EXECUTE",
    });
    evidence.roles.workerSecurityDefinerRoutines.push({
      routine: "public.unsafe_bridge()",
    });
    const findings = validateAiTenantRlsRuntimeEvidence(evidence);
    assert.equal(
      findings.includes(
        "roles.workerTablePrivileges must equal the governed set",
      ),
      true,
    );
    assert.equal(
      findings.includes(
        "roles.workerRoutinePrivileges must equal the governed set",
      ),
      true,
    );
    assert.equal(
      findings.includes(
        "roles.workerSecurityDefinerRoutines must equal the governed set",
      ),
      true,
    );
  });

  it("rejects secret-shaped or connection URL material", () => {
    const evidence = evidenceFixture();
    evidence.execution.databaseUrl = "postgresql://user:password@example/db";
    const findings = validateAiTenantRlsRuntimeEvidence(evidence);
    assert.equal(findings.some((item) => item.includes("forbidden")), true);
    assert.equal(findings.includes("execution fields are not exact"), true);
  });

  it("rejects missing source-artifact bindings", () => {
    const evidence = evidenceFixture();
    evidence.sourceArtifacts.pop();
    const findings = validateAiTenantRlsRuntimeEvidence(evidence);
    assert.equal(
      findings.includes("sourceArtifacts paths must equal the governed set"),
      true,
    );
  });
});
