import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import {
  defaultCommunityConsent,
  loadOwnedCommunityProfile,
  loadPublicCommunityProfile,
  updateCommunityProfileConsent,
  type CommunityConsentSettings,
} from "../../lib/community-profile-authority";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { hashSensitiveAuditRequest } from "../../lib/security/sensitive-mutation-audit";
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
  scope: "community:profile:read" | "community:profile:write";
}): AvailableTenantPrincipalContext {
  return {
    available: true,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    principalType: "student",
    principalId: input.studentId,
    roles: ["student"],
    scopes: [input.scope],
    bindingSource: "community_profile_test",
    bindingStatus: "active",
    membershipId: null,
    requestId: `request-${randomUUID()}`,
    authEvidence: {
      strictRevocation: true,
      sessionPrincipal: true,
    },
  };
}

async function seedProfile(label: string): Promise<{
  tenantId: string;
  workspaceId: string;
  studentId: string;
  publicProfileId: string;
}> {
  const tenantId = `community-${label}-${randomUUID()}`;
  const workspaceId = `workspace-${randomUUID()}`;
  const studentId = randomUUID();
  const username = `u_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
  tenants.add(tenantId);
  students.add(studentId);

  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
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
      await client.query(
        `INSERT INTO academy_students (id, locale, display_name, username)
         VALUES ($1::uuid, 'fa', $2, $3)`,
        [studentId, `Student ${label}`, username],
      );

      // The compatibility trigger creates TecPey's default binding/profile.
      // This fixture deliberately re-homes the isolated test principal.
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
         VALUES ($1, $2, 'student', $3, 'community_profile_test')`,
        [tenantId, workspaceId, studentId],
      );
      const profile = await client.query<{ public_profile_id: string }>(
        `INSERT INTO academy_public_profiles
           (student_id, tenant_id, workspace_id, principal_type,
            public_profile_id, visibility, leaderboard_visible,
            journal_sharing_enabled, instructor_review_consent,
            challenge_participation, study_group_discovery,
            revision, consent_version, consented_at, created_at, updated_at)
         VALUES
           ($1::uuid, $2, $3, 'student', gen_random_uuid(), 'private', FALSE,
            FALSE, FALSE, FALSE, FALSE, 0,
            'community-profile-consent-v1', NULL, NOW(), NOW())
         RETURNING public_profile_id::text`,
        [studentId, tenantId, workspaceId],
      );
      await client.query("COMMIT");
      return {
        tenantId,
        workspaceId,
        studentId,
        publicProfileId: profile.rows[0].public_profile_id,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

function audit(input: {
  tenantId: string;
  studentId: string;
  correlationId: string;
  expectedRevision: number;
  consent: CommunityConsentSettings;
}) {
  return {
    tenantId: input.tenantId,
    actorType: "student" as const,
    actorId: input.studentId,
    correlationId: input.correlationId,
    requestHash: hashSensitiveAuditRequest({
      tenantId: input.tenantId,
      action: "community.profile.consent.update",
      expectedRevision: input.expectedRevision,
      consent: input.consent,
    }),
  };
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 6, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  if (pool) {
    await withClient(async (client) => {
      // Mandatory audit evidence is append-only by design and intentionally
      // survives fixture cleanup. CI databases are ephemeral; only mutable
      // fixture rows are removed here.
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

describe("Community profile consent PostgreSQL authority", () => {
  it("starts private and commits changed consent with one mandatory evidence event", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const fixture = await seedProfile("atomic");
    const readContext = context({ ...fixture, scope: "community:profile:read" });
    const writeContext = context({ ...fixture, scope: "community:profile:write" });

    const initial = await loadOwnedCommunityProfile(readContext);
    assert.equal(initial.available, true);
    assert.equal(initial.profile?.visibility, "private");
    assert.deepEqual(initial.profile?.consent, defaultCommunityConsent());
    assert.equal(initial.profile?.revision, 0);

    const consent: CommunityConsentSettings = {
      profileVisibility: "public",
      leaderboardVisible: true,
      journalSharingEnabled: false,
      instructorReviewConsent: false,
      challengeParticipation: false,
      studyGroupDiscovery: false,
    };
    const correlationId = `community-${randomUUID()}`;
    const updated = await updateCommunityProfileConsent({
      context: writeContext,
      expectedRevision: 0,
      consent,
      audit: audit({
        tenantId: fixture.tenantId,
        studentId: fixture.studentId,
        correlationId,
        expectedRevision: 0,
        consent,
      }),
    });
    assert.equal(updated.ok, true);
    if (!updated.ok) return;
    assert.equal(updated.changed, true);
    assert.equal(updated.replayed, false);
    assert.equal(updated.profile.revision, 1);
    assert.equal(updated.profile.visibility, "public");
    assert.equal(updated.profile.arenaScore, 0);

    const evidence = await withClient((client) =>
      client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
           FROM sensitive_mutation_audit_events
          WHERE tenant_id = $1
            AND action = 'community.profile.consent.update'
            AND correlation_id = $2`,
        [fixture.tenantId, correlationId],
      ),
    );
    assert.equal(evidence.rows[0].count, 1);

    const publicProfile = await loadPublicCommunityProfile({
      tenantId: fixture.tenantId,
      workspaceId: fixture.workspaceId,
      identifier: fixture.publicProfileId,
    });
    assert.equal(publicProfile.available, true);
    assert.equal(publicProfile.profile?.publicProfileId, fixture.publicProfileId);
    assert.equal("revision" in (publicProfile.profile ?? {}), false);
    assert.equal("consent" in (publicProfile.profile ?? {}), false);
    assert.equal("studentId" in (publicProfile.profile ?? {}), false);
  });

  it("keeps identical updates as no-ops and rejects stale revisions", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const fixture = await seedProfile("revision");
    const writeContext = context({ ...fixture, scope: "community:profile:write" });
    const consent = defaultCommunityConsent();

    const noOp = await updateCommunityProfileConsent({
      context: writeContext,
      expectedRevision: 0,
      consent,
      audit: audit({
        tenantId: fixture.tenantId,
        studentId: fixture.studentId,
        correlationId: `community-${randomUUID()}`,
        expectedRevision: 0,
        consent,
      }),
    });
    assert.equal(noOp.ok, true);
    if (noOp.ok) {
      assert.equal(noOp.changed, false);
      assert.equal(noOp.profile.revision, 0);
    }

    const changedConsent = { ...consent, studyGroupDiscovery: true };
    const changed = await updateCommunityProfileConsent({
      context: writeContext,
      expectedRevision: 0,
      consent: changedConsent,
      audit: audit({
        tenantId: fixture.tenantId,
        studentId: fixture.studentId,
        correlationId: `community-${randomUUID()}`,
        expectedRevision: 0,
        consent: changedConsent,
      }),
    });
    assert.equal(changed.ok, true);

    const stale = await updateCommunityProfileConsent({
      context: writeContext,
      expectedRevision: 0,
      consent: { ...changedConsent, journalSharingEnabled: true },
      audit: audit({
        tenantId: fixture.tenantId,
        studentId: fixture.studentId,
        correlationId: `community-${randomUUID()}`,
        expectedRevision: 0,
        consent: { ...changedConsent, journalSharingEnabled: true },
      }),
    });
    assert.deepEqual(stale, { ok: false, reason: "revision_conflict" });
  });

  it("replays one command once, rejects changed replay and isolates another tenant principal", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const owner = await seedProfile("owner");
    const other = await seedProfile("other");
    const ownerWrite = context({ ...owner, scope: "community:profile:write" });
    const consent = { ...defaultCommunityConsent(), profileVisibility: "public" as const };
    const correlationId = `community-${randomUUID()}`;
    const evidence = audit({
      tenantId: owner.tenantId,
      studentId: owner.studentId,
      correlationId,
      expectedRevision: 0,
      consent,
    });

    const first = await updateCommunityProfileConsent({
      context: ownerWrite,
      expectedRevision: 0,
      consent,
      audit: evidence,
    });
    assert.equal(first.ok, true);

    const replay = await updateCommunityProfileConsent({
      context: ownerWrite,
      expectedRevision: 0,
      consent,
      audit: evidence,
    });
    assert.equal(replay.ok, true);
    if (replay.ok) assert.equal(replay.replayed, true);

    const changedReplayConsent = { ...consent, leaderboardVisible: true };
    const changedReplay = await updateCommunityProfileConsent({
      context: ownerWrite,
      expectedRevision: 0,
      consent: changedReplayConsent,
      audit: audit({
        tenantId: owner.tenantId,
        studentId: owner.studentId,
        correlationId,
        expectedRevision: 0,
        consent: changedReplayConsent,
      }),
    });
    assert.deepEqual(changedReplay, { ok: false, reason: "idempotency_conflict" });

    const crossTenantRead = await loadPublicCommunityProfile({
      tenantId: other.tenantId,
      workspaceId: other.workspaceId,
      identifier: owner.publicProfileId,
    });
    assert.deepEqual(crossTenantRead, { available: true, profile: null });

    const forgedContext = context({
      tenantId: owner.tenantId,
      workspaceId: owner.workspaceId,
      studentId: other.studentId,
      scope: "community:profile:write",
    });
    const forbidden = await updateCommunityProfileConsent({
      context: forgedContext,
      expectedRevision: 1,
      consent: changedReplayConsent,
      audit: audit({
        tenantId: owner.tenantId,
        studentId: other.studentId,
        correlationId: `community-${randomUUID()}`,
        expectedRevision: 1,
        consent: changedReplayConsent,
      }),
    });
    assert.deepEqual(forbidden, { ok: false, reason: "not_found" });
  });
});
