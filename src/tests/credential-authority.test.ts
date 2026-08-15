import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PoolClient } from "pg";
import {
  issueAcademyCredential,
  listOwnedAcademyCredentialHistory,
  listOwnedAcademyCredentials,
  setOwnedAcademyCredentialVisibility,
} from "../lib/academy-credential-authority";

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
    assert.match(calls[0].sql, /LIMIT 240/);
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
});
