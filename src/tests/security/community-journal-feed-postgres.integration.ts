import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import {
  listCommunityJournalFeed,
  parseCommunityJournalCursor,
} from "../../lib/community-journal-authority";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import type { AvailableTenantPrincipalContext } from "../../lib/security/tenant-principal-context";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;
const tenants = new Set<string>();
const students = new Set<string>();

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function context(input: {
  tenantId: string;
  workspaceId: string;
  studentId: string;
}): AvailableTenantPrincipalContext {
  return {
    available: true,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    principalType: "student",
    principalId: input.studentId,
    roles: ["student"],
    scopes: ["community:journal:read"],
    bindingSource: "community_journal_test",
    bindingStatus: "active",
    membershipId: null,
    requestId: `request-${randomUUID()}`,
    authEvidence: {
      strictRevocation: true,
      sessionPrincipal: true,
    },
  };
}

async function seedTenant(label: string): Promise<{
  tenantId: string;
  workspaceId: string;
}> {
  const tenantId = `journal-${label}-${randomUUID()}`;
  const workspaceId = `workspace-${randomUUID()}`;
  tenants.add(tenantId);
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO platform_workspaces
         (id, tenant_id, slug, display_name, products, settings)
       VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
      [workspaceId, tenantId],
    );
  });
  return { tenantId, workspaceId };
}

async function seedStudent(input: {
  tenantId: string;
  workspaceId: string;
  label: string;
  sharing: boolean;
}): Promise<string> {
  const studentId = randomUUID();
  const username = `j_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
  students.add(studentId);
  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO academy_students (id, locale, display_name, username)
         VALUES ($1::uuid, 'fa', $2, $3)`,
        [studentId, `Journal ${input.label}`, username],
      );
      await client.query(
        "DELETE FROM academy_public_profiles WHERE student_id = $1::uuid",
        [studentId],
      );
      await client.query(
        `DELETE FROM platform_principal_bindings
          WHERE principal_type = 'student'
            AND principal_id = $1`,
        [studentId],
      );
      await client.query(
        `INSERT INTO platform_principal_bindings
           (tenant_id, workspace_id, principal_type, principal_id, source)
         VALUES ($1, $2, 'student', $3, 'community_journal_test')`,
        [input.tenantId, input.workspaceId, studentId],
      );
      await client.query(
        `INSERT INTO academy_public_profiles
           (student_id, tenant_id, workspace_id, principal_type,
            public_profile_id, visibility, leaderboard_visible,
            journal_sharing_enabled, instructor_review_consent,
            challenge_participation, study_group_discovery,
            revision, consent_version, consented_at, created_at, updated_at)
         VALUES
           ($1::uuid, $2, $3, 'student', gen_random_uuid(), 'private', FALSE,
            $4, FALSE, FALSE, FALSE, 1,
            'community-profile-consent-v1', NOW(), NOW(), NOW())`,
        [studentId, input.tenantId, input.workspaceId, input.sharing],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
  return studentId;
}

async function seedReflection(input: {
  studentId: string;
  closedAt: string;
  lesson: string;
  nextAction?: string | null;
  asset?: "BTC" | "ETH";
  tag?: string;
}): Promise<void> {
  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const account = await client.query<{ cycle_id: string }>(
        `INSERT INTO academy_trading_arena_accounts (student_id)
         VALUES ($1::uuid)
         ON CONFLICT (student_id) DO UPDATE SET updated_at = academy_trading_arena_accounts.updated_at
         RETURNING cycle_id::text`,
        [input.studentId],
      );
      let attempt = await client.query<{ id: string }>(
        `SELECT id::text
           FROM academy_trading_arena_attempts
          WHERE student_id = $1::uuid
          LIMIT 1`,
        [input.studentId],
      );
      if (!attempt.rows[0]) {
        attempt = await client.query<{ id: string }>(
          `INSERT INTO academy_trading_arena_attempts
             (student_id, cycle_id, attempt_number, status, started_at)
           VALUES ($1::uuid, $2::uuid, 1, 'active', NOW())
           RETURNING id::text`,
          [input.studentId, account.rows[0].cycle_id],
        );
      }
      await client.query(
        `INSERT INTO academy_trading_arena_reflections
           (id, student_id, attempt_id, closed_trade_id, revision,
            decision_review, learned_lesson, emotional_review, mistake_tags,
            next_action_commitment, evidence_asset, evidence_realized_pnl,
            evidence_realized_pnl_rate, evidence_closure_reason,
            evidence_closed_at, evidence_mentor_flags, created_at, updated_at)
         VALUES
           (gen_random_uuid(), $1::uuid, $2::uuid, $3, 1,
            'private decision review', $4, 'private emotional review', $5::jsonb,
            $6, $7, 123.4567890000, 0.12345678, 'manual',
            $8::timestamptz, '["good-discipline"]'::jsonb, NOW(), NOW())`,
        [
          input.studentId,
          attempt.rows[0].id,
          `trade-${randomUUID()}`,
          input.lesson,
          JSON.stringify([input.tag ?? "none"]),
          input.nextAction ?? null,
          input.asset ?? "BTC",
          input.closedAt,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 6, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  if (pool) {
    await withClient(async (client) => {
      for (const studentId of students) {
        await client.query("DELETE FROM academy_students WHERE id = $1::uuid", [studentId]);
      }
      for (const tenantId of tenants) {
        await client.query("DELETE FROM platform_tenants WHERE id = $1", [tenantId]);
      }
    });
  }
  await pool?.end();
  pool = null;
});

describe("Community journal PostgreSQL projection", () => {
  it("projects only consented canonical reflections and removes sensitive authority fields", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const tenant = await seedTenant("privacy");
    const viewer = await seedStudent({ ...tenant, label: "viewer", sharing: true });
    const peer = await seedStudent({ ...tenant, label: "peer", sharing: true });
    const privatePeer = await seedStudent({ ...tenant, label: "private", sharing: false });
    await seedReflection({
      studentId: viewer,
      closedAt: "2026-07-20T10:00:00.000Z",
      lesson: "Viewer verified lesson",
      nextAction: "Follow the written risk plan",
    });
    await seedReflection({
      studentId: peer,
      closedAt: "2026-07-19T10:00:00.000Z",
      lesson: "Peer verified lesson",
      asset: "ETH",
      tag: "early-exit",
    });
    await seedReflection({
      studentId: privatePeer,
      closedAt: "2026-07-18T10:00:00.000Z",
      lesson: "Must remain private",
    });

    const result = await listCommunityJournalFeed({
      context: context({ ...tenant, studentId: viewer }),
      limit: 20,
    });
    assert.equal(result.available, true);
    if (!result.available) return;
    assert.equal(result.page.entries.length, 2);
    assert.deepEqual(
      result.page.entries.map((entry) => entry.learnedLesson),
      ["Viewer verified lesson", "Peer verified lesson"],
    );
    assert.equal(result.page.entries.filter((entry) => entry.isMine).length, 1);
    assert.equal(result.page.nextCursor, null);

    const serialized = JSON.stringify(result.page);
    for (const forbidden of [
      viewer,
      peer,
      privatePeer,
      "123.456789",
      "0.12345678",
      "private decision review",
      "private emotional review",
      "principalId",
      "studentId",
      "attemptId",
      "closedTradeId",
      "revision",
      "consent",
    ]) {
      assert.equal(serialized.includes(forbidden), false, `forbidden projection value leaked: ${forbidden}`);
    }
    assert.equal(serialized.includes("Must remain private"), false);
  });

  it("keeps tenant feeds isolated", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const tenantA = await seedTenant("tenant-a");
    const tenantB = await seedTenant("tenant-b");
    const viewerA = await seedStudent({ ...tenantA, label: "viewer-a", sharing: true });
    const peerA = await seedStudent({ ...tenantA, label: "peer-a", sharing: true });
    const peerB = await seedStudent({ ...tenantB, label: "peer-b", sharing: true });
    await seedReflection({ studentId: peerA, closedAt: "2026-07-20T09:00:00Z", lesson: "Tenant A lesson" });
    await seedReflection({ studentId: peerB, closedAt: "2026-07-20T11:00:00Z", lesson: "Tenant B secret" });

    const result = await listCommunityJournalFeed({
      context: context({ ...tenantA, studentId: viewerA }),
      limit: 20,
    });
    assert.equal(result.available, true);
    if (!result.available) return;
    assert.deepEqual(result.page.entries.map((entry) => entry.learnedLesson), ["Tenant A lesson"]);
    assert.equal(JSON.stringify(result.page).includes("Tenant B secret"), false);
  });

  it("uses deterministic cursor pagination without duplicates", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const tenant = await seedTenant("pagination");
    const viewer = await seedStudent({ ...tenant, label: "viewer", sharing: true });
    await seedReflection({ studentId: viewer, closedAt: "2026-07-03T00:00:00Z", lesson: "Lesson 3" });
    await seedReflection({ studentId: viewer, closedAt: "2026-07-02T00:00:00Z", lesson: "Lesson 2" });
    await seedReflection({ studentId: viewer, closedAt: "2026-07-01T00:00:00Z", lesson: "Lesson 1" });

    const first = await listCommunityJournalFeed({
      context: context({ ...tenant, studentId: viewer }),
      limit: 2,
    });
    assert.equal(first.available, true);
    if (!first.available) return;
    assert.deepEqual(first.page.entries.map((entry) => entry.learnedLesson), ["Lesson 3", "Lesson 2"]);
    assert.ok(first.page.nextCursor);
    const parsed = parseCommunityJournalCursor(first.page.nextCursor);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    const second = await listCommunityJournalFeed({
      context: context({ ...tenant, studentId: viewer }),
      cursor: parsed.cursor,
      limit: 2,
    });
    assert.equal(second.available, true);
    if (!second.available) return;
    assert.deepEqual(second.page.entries.map((entry) => entry.learnedLesson), ["Lesson 1"]);
    assert.equal(second.page.nextCursor, null);
    const ids = [...first.page.entries, ...second.page.entries].map((entry) => entry.entryId);
    assert.equal(new Set(ids).size, 3);
  });

  it("rejects malformed opaque cursors", () => {
    assert.deepEqual(parseCommunityJournalCursor("not-base64-json"), { ok: false, cursor: null });
    assert.deepEqual(
      parseCommunityJournalCursor(Buffer.from(JSON.stringify({ closedAt: "invalid", reflectionId: randomUUID() })).toString("base64url")),
      { ok: false, cursor: null },
    );
  });
});
