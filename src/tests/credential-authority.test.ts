import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PoolClient } from "pg";
import {
  appendApprovedAcademyCredentialLifecycleEvent,
  appendAcademyCredentialLifecycleEvent,
  issueAcademyCredential,
  listOwnedAcademyCredentialHistory,
  listOwnedAcademyCredentials,
  setOwnedAcademyCredentialVisibility,
} from "../lib/academy-credential-authority";
import { C_LEVEL_CONTROL_POLICY_VERSION } from "../lib/c-level-control-authority";

const input = {
  tenantId: "tenant-a",
  workspaceId: "workspace-a",
  studentId: "00000000-0000-4000-8000-000000000001",
  credentialKey: "league:2026-08:rank:1",
  credentialType: "league_medal" as const,
  code: "monthly-champion",
  titleFa: "قهرمان ماه",
  titleEn: "Monthly champion",
  descriptionFa: "رتبه نخست لیگ",
  descriptionEn: "First place",
  icon: "🏆",
  policyVersion: "academy-league-v1",
  evidence: { season: "2026-08", scoreBps: 9200 },
  issuedAt: "2026-08-15T00:00:00.000Z",
  competitionId: "academy-monthly-league",
  seasonKey: "2026-08",
  rank: 1,
  pointsBps: 9200,
};

describe("Academy credential authority", () => {
  const existingCredential = async () => {
    const crypto = await import("node:crypto");
    const evidence = JSON.stringify({ scoreBps: 9200, season: "2026-08" });
    return {
      id: "00000000-0000-4000-8000-000000000010",
      credential_type: input.credentialType,
      code: input.code,
      title_fa: input.titleFa,
      title_en: input.titleEn,
      description_fa: input.descriptionFa,
      description_en: input.descriptionEn,
      icon: input.icon,
      competition_id: input.competitionId,
      season_key: input.seasonKey,
      rank: input.rank,
      points_bps: input.pointsBps,
      policy_version: input.policyVersion,
      evidence_sha256: crypto.createHash("sha256").update(evidence).digest("hex"),
      issued_at: new Date(input.issuedAt),
    };
  };

  it("scopes every profile read by tenant, workspace and student", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        return { rows: [] };
      },
    } as unknown as PoolClient;
    await listOwnedAcademyCredentials(client, input);
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /tenant_id = \$1 AND workspace_id = \$2 AND student_id = \$3::uuid/);
    assert.deepEqual(calls[0].values, [input.tenantId, input.workspaceId, input.studentId]);
  });

  it("returns a bounded, privacy-minimized credential history in exact owner scope", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        return { rows: [] };
      },
    } as unknown as PoolClient;
    await listOwnedAcademyCredentialHistory(client, input);
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /record\.tenant_id = \$1 AND record\.workspace_id = \$2/);
    assert.match(calls[0].sql, /record\.student_id = \$3::uuid/);
    assert.match(calls[0].sql, /ROW_NUMBER\(\) OVER/);
    assert.match(calls[0].sql, /PARTITION BY credential_id/);
    assert.match(calls[0].sql, /credential_event_rank <= 6/);
    assert.doesNotMatch(calls[0].sql, /metadata|evidence|actor_id/);
    assert.deepEqual(calls[0].values, [input.tenantId, input.workspaceId, input.studentId]);
  });

  it("commits the record, issued event and notification only for a new credential", async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes("INSERT INTO academy_credential_records")) {
          return { rows: [{ id: "00000000-0000-4000-8000-000000000010" }] };
        }
        if (sql.includes("SELECT id, locale FROM platform_principals")) {
          return { rows: [{ id: "00000000-0000-4000-8000-000000000030", locale: "fa" }] };
        }
        if (sql.includes("INSERT INTO notification_domain_outbox")) {
          return { rows: [{ id: "00000000-0000-4000-8000-000000000020" }] };
        }
        return { rows: [] };
      },
    } as unknown as PoolClient;
    const result = await issueAcademyCredential(client, input);
    assert.deepEqual(result, {
      credentialId: "00000000-0000-4000-8000-000000000010",
      replayed: false,
    });
    assert.ok(statements.some((sql) => sql.includes("INSERT INTO academy_credential_events")));
    assert.ok(statements.some((sql) => sql.includes("INSERT INTO notification_domain_outbox")));
    assert.ok(statements.some((sql) => sql.includes("student_id = $2::uuid")));
  });

  it("returns an exact replay without duplicating lifecycle or notification rows", async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes("INSERT INTO academy_credential_records")) return { rows: [] };
        if (sql.includes("SELECT id, credential_type")) return { rows: [await existingCredential()] };
        throw new Error("unexpected query");
      },
    } as unknown as PoolClient;
    const result = await issueAcademyCredential(client, input);
    assert.equal(result.replayed, true);
    assert.equal(statements.some((sql) => sql.includes("academy_credential_events")), false);
    assert.equal(statements.some((sql) => sql.includes("notification_domain_outbox")), false);
  });

  it("rejects a reused idempotency key when any immutable identity field changes", async () => {
    const client = {
      query: async (sql: string) => {
        if (sql.includes("INSERT INTO academy_credential_records")) return { rows: [] };
        if (sql.includes("SELECT id, credential_type")) {
          return { rows: [{ ...await existingCredential(), rank: 2 }] };
        }
        throw new Error("unexpected query");
      },
    } as unknown as PoolClient;
    await assert.rejects(
      issueAcademyCredential(client, input),
      /academy_credential_identity_conflict/,
    );
  });

  it("writes credential visibility only through the exact owner scope", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = { query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return { rows: [{ visibility: "profile", occurred_at: "2026-08-15T01:00:00.000Z" }] };
    } } as unknown as PoolClient;
    const result = await setOwnedAcademyCredentialVisibility(client, {
      tenantId: input.tenantId, workspaceId: input.workspaceId,
      studentId: input.studentId, credentialId: "00000000-0000-4000-8000-000000000010",
      visibility: "profile", idempotencyKey: "visibility:test:0001",
    });
    assert.deepEqual(result, {
      visibility: "profile",
      replayed: false,
      occurredAt: "2026-08-15T01:00:00.000Z",
    });
    assert.match(calls[0].sql, /FROM academy_credential_current_state/);
    assert.match(calls[0].sql, /tenant_id = \$1 AND workspace_id = \$2/);
    assert.match(calls[0].sql, /student_id = \$3::uuid/);
  });

  it("permits public visibility only for an unexpired issued or reinstated credential", async () => {
    const statements: string[] = [];
    const client = { query: async (sql: string) => {
      statements.push(sql);
      return { rows: [] };
    } } as unknown as PoolClient;
    const result = await setOwnedAcademyCredentialVisibility(client, {
      tenantId: input.tenantId, workspaceId: input.workspaceId,
      studentId: input.studentId, credentialId: "00000000-0000-4000-8000-000000000010",
      visibility: "public", idempotencyKey: "visibility:test:public",
    });
    assert.equal(result, null);
    assert.match(statements[0], /lifecycle_state IN \('issued', 'reinstated'\)/);
    assert.match(statements[0], /expires_at IS NULL OR expires_at > NOW\(\)/);
  });

  it("rejects a conflicting visibility replay", async () => {
    let call = 0;
    const client = { query: async () => {
      call += 1;
      return call === 1 ? { rows: [] } : { rows: [{ visibility: "public", occurred_at: "2026-08-15T01:00:00.000Z" }] };
    } } as unknown as PoolClient;
    await assert.rejects(setOwnedAcademyCredentialVisibility(client, {
      tenantId: input.tenantId, workspaceId: input.workspaceId,
      studentId: input.studentId, credentialId: "00000000-0000-4000-8000-000000000010",
      visibility: "private", idempotencyKey: "visibility:test:0002",
    }), /academy_credential_visibility_identity_conflict/);
  });

  it("appends a governed lifecycle event in exact student owner scope and notifies the principal", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = { query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes("INSERT INTO academy_credential_events")) {
        return { rows: [{
          credential_id: "00000000-0000-4000-8000-000000000010",
          student_id: input.studentId,
          title_fa: input.titleFa,
          title_en: input.titleEn,
          event_type: "appeal_opened",
          occurred_at: "2026-08-15T02:00:00.000Z",
        }] };
      }
      if (sql.includes("SELECT id, locale FROM platform_principals")) {
        return { rows: [{ id: "00000000-0000-4000-8000-000000000030", locale: "fa" }] };
      }
      if (sql.includes("INSERT INTO notification_domain_outbox")) {
        return { rows: [{ id: "00000000-0000-4000-8000-000000000040" }] };
      }
      return { rows: [] };
    } } as unknown as PoolClient;
    const result = await appendAcademyCredentialLifecycleEvent(client, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      credentialId: "00000000-0000-4000-8000-000000000010",
      actorType: "student",
      actorId: input.studentId,
      eventType: "appeal_opened",
      reasonCode: "student.disputes.evidence",
      idempotencyKey: "appeal:test:0001",
      metadata: { source: "credential_cabinet" },
      occurredAt: "2026-08-15T02:00:00.000Z",
    });

    assert.deepEqual(result, {
      credentialId: "00000000-0000-4000-8000-000000000010",
      lifecycleState: "appeal_opened",
      replayed: false,
      occurredAt: "2026-08-15T02:00:00.000Z",
    });
    assert.match(calls[0].sql, /FROM academy_credential_current_state/);
    assert.match(calls[0].sql, /tenant_id = \$1 AND workspace_id = \$2/);
    assert.match(calls[0].sql, /student_id = \$6::uuid/);
    assert.ok(calls.some(({ sql, values }) =>
      sql.includes("INSERT INTO notification_domain_outbox") &&
      values?.[2] === "academy.credential_lifecycle_changed"));
    assert.ok(calls.some(({ sql }) => sql.includes("INSERT INTO notification_domain_outbox")));
  });

  it("returns exact lifecycle replays without duplicating notifications", async () => {
    const crypto = await import("node:crypto");
    const evidenceSha256 = crypto.createHash("sha256")
      .update(JSON.stringify({
        policyVersion: "academy-credential-lifecycle-v1",
        source: "command_center",
      }))
      .digest("hex");
    let call = 0;
    const client = { query: async () => {
      call += 1;
      if (call === 1) return { rows: [] };
      return { rows: [{
        event_type: "suspended",
        actor_type: "admin",
        actor_id: "00000000-0000-4000-8000-000000000050",
        reason_code: "policy.review",
        policy_version: "academy-credential-lifecycle-v1",
        evidence_sha256: evidenceSha256,
        occurred_at: "2026-08-15T02:00:00.000Z",
      }] };
    } } as unknown as PoolClient;

    const result = await appendAcademyCredentialLifecycleEvent(client, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      credentialId: "00000000-0000-4000-8000-000000000010",
      actorType: "admin",
      actorId: "00000000-0000-4000-8000-000000000050",
      eventType: "suspended",
      reasonCode: "policy.review",
      idempotencyKey: "lifecycle:test:0001",
      metadata: { source: "command_center" },
      occurredAt: "2026-08-15T02:00:00.000Z",
    });
    assert.deepEqual(result, {
      credentialId: "00000000-0000-4000-8000-000000000010",
      lifecycleState: "suspended",
      replayed: true,
      occurredAt: "2026-08-15T02:00:00.000Z",
    });
    assert.equal(call, 2);
  });

  it("requires C-level approval evidence before Admin sensitive lifecycle changes", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = { query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes("FROM admin_approval_requests request")) {
        return { rows: [{
          id: "33333333-3333-4333-8333-333333333333",
          action: "academy_credential.lifecycle_sensitive",
          resource_type: "academy_credential",
          resource_id: "tenant-a/workspace-a/00000000-0000-4000-8000-000000000010",
          payload: {
            tenantId: "tenant-a",
            workspaceId: "workspace-a",
            controlledAction: "academy_credential.lifecycle_sensitive",
            resourceType: "academy_credential",
            resourceId: "00000000-0000-4000-8000-000000000010",
            controlPolicyVersion: C_LEVEL_CONTROL_POLICY_VERSION,
          },
          requested_by: "11111111-1111-4111-8111-111111111111",
          reviewed_by: "22222222-2222-4222-8222-222222222222",
          reviewed_roles: ["compliance_approver"],
          reviewed_at: "2026-08-15T01:00:00.000Z",
          expires_at: "2026-08-22T01:00:00.000Z",
        }] };
      }
      if (sql.includes("INSERT INTO academy_credential_events")) {
        return { rows: [{
          credential_id: "00000000-0000-4000-8000-000000000010",
          student_id: input.studentId,
          title_fa: input.titleFa,
          title_en: input.titleEn,
          event_type: "revoked",
          occurred_at: "2026-08-15T02:00:00.000Z",
        }] };
      }
      if (sql.includes("SELECT id, locale FROM platform_principals")) {
        return { rows: [{ id: "00000000-0000-4000-8000-000000000030", locale: "fa" }] };
      }
      if (sql.includes("INSERT INTO notification_domain_outbox")) {
        return { rows: [{ id: "00000000-0000-4000-8000-000000000040" }] };
      }
      return { rows: [] };
    } } as unknown as PoolClient;

    const result = await appendApprovedAcademyCredentialLifecycleEvent(client, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      credentialId: "00000000-0000-4000-8000-000000000010",
      actorType: "admin",
      actorId: "00000000-0000-4000-8000-000000000050",
      eventType: "revoked",
      reasonCode: "policy.revoked",
      idempotencyKey: "lifecycle:test:approved",
      metadata: { source: "command_center" },
      cLevelApprovalRequestId: "33333333-3333-4333-8333-333333333333",
      occurredAt: "2026-08-15T02:00:00.000Z",
    });

    assert.equal(result?.lifecycleState, "revoked");
    assert.match(calls[0].sql, /FROM admin_approval_requests request/);
    const insert = calls.find(({ sql }) => sql.includes("INSERT INTO academy_credential_events"));
    assert.equal(insert?.values?.[4], "c_level");
    assert.equal(
      JSON.parse(String(insert?.values?.[9])).cLevelApproval.policyVersion,
      C_LEVEL_CONTROL_POLICY_VERSION,
    );
  });

  it("rejects a conflicting lifecycle replay", async () => {
    let call = 0;
    const client = { query: async () => {
      call += 1;
      if (call === 1) return { rows: [] };
      return { rows: [{
        event_type: "suspended",
        actor_type: "admin",
        actor_id: "00000000-0000-4000-8000-000000000050",
        reason_code: "policy.review",
        policy_version: "academy-credential-lifecycle-v1",
        evidence_sha256: "unused",
        occurred_at: "2026-08-15T02:00:00.000Z",
      }] };
    } } as unknown as PoolClient;

    await assert.rejects(appendAcademyCredentialLifecycleEvent(client, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      credentialId: "00000000-0000-4000-8000-000000000010",
      actorType: "admin",
      actorId: "00000000-0000-4000-8000-000000000050",
      eventType: "suspended",
      reasonCode: "policy.review",
      idempotencyKey: "lifecycle:test:0001",
      metadata: { source: "command_center" },
      occurredAt: "2026-08-15T02:00:00.000Z",
    }), /academy_credential_lifecycle_identity_conflict/);
  });
});
