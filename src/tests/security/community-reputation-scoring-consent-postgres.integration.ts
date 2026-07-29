import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import {
  defaultCommunityConsent,
  fingerprintCommunityProfilePrincipal,
  loadOwnedCommunityProfile,
  updateCommunityProfileConsent,
} from "../../lib/community-profile-authority";
import { loadJournalDisciplineScore } from "../../lib/community-journal-discipline-score-authority";
import {
  COMMUNITY_REPUTATION_SCORING_CONSENT_POLICY,
  COMMUNITY_REPUTATION_SCORING_CONSENT_VERSION,
  fingerprintCommunityReputationScoringPrincipal,
  loadCommunityReputationScoringConsent,
  updateCommunityReputationScoringConsent,
} from "../../lib/community-reputation-scoring-consent-authority";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { hashSensitiveAuditRequest } from "../../lib/security/sensitive-mutation-audit";
import type { AvailableTenantPrincipalContext } from "../../lib/security/tenant-principal-context";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;
const tenants = new Set<string>();
const students = new Set<string>();

type Fixture = {
  tenantId: string;
  workspaceId: string;
  studentId: string;
  publicProfileId: string;
};

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function context(
  fixture: Pick<Fixture, "tenantId" | "workspaceId" | "studentId">,
  scopes: string[],
): AvailableTenantPrincipalContext {
  return {
    available: true,
    tenantId: fixture.tenantId,
    workspaceId: fixture.workspaceId,
    principalType: "student",
    principalId: fixture.studentId,
    roles: ["student"],
    scopes,
    bindingSource: "community_reputation_scoring_consent_test",
    bindingStatus: "active",
    membershipId: null,
    requestId: `request-${randomUUID()}`,
    authEvidence: { strictRevocation: true, sessionPrincipal: true },
  };
}

async function seedProfile(label: string): Promise<Fixture> {
  const tenantId = `reputation-consent-${label}-${randomUUID()}`;
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
      await client.query("DELETE FROM academy_public_profiles WHERE student_id = $1::uuid", [
        studentId,
      ]);
      await client.query(
        `DELETE FROM platform_principal_bindings
          WHERE principal_type = 'student' AND principal_id = $1`,
        [studentId],
      );
      await client.query(
        `INSERT INTO platform_principal_bindings
           (tenant_id, workspace_id, principal_type, principal_id, source)
         VALUES ($1, $2, 'student', $3, 'community_reputation_scoring_consent_test')`,
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

function scoringAudit(input: Fixture & {
  correlationId: string;
  expectedRevision: number;
  enabled: boolean;
}) {
  const principalFingerprint = fingerprintCommunityReputationScoringPrincipal({
    tenantId: input.tenantId,
    principalId: input.studentId,
  });
  return {
    tenantId: input.tenantId,
    actorType: "student" as const,
    actorId: input.studentId,
    correlationId: input.correlationId,
    requestHash: hashSensitiveAuditRequest({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      action: "community.profile.consent.update",
      authority: COMMUNITY_REPUTATION_SCORING_CONSENT_POLICY,
      principalFingerprint,
      expectedRevision: input.expectedRevision,
      reputationScoringEnabled: input.enabled,
    }),
  };
}

function profileAudit(input: Fixture & {
  correlationId: string;
  expectedRevision: number;
  consent: ReturnType<typeof defaultCommunityConsent>;
}) {
  const principalFingerprint = fingerprintCommunityProfilePrincipal({
    tenantId: input.tenantId,
    principalId: input.studentId,
  });
  return {
    tenantId: input.tenantId,
    actorType: "student" as const,
    actorId: input.studentId,
    correlationId: input.correlationId,
    requestHash: hashSensitiveAuditRequest({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      action: "community.profile.consent.update",
      principalFingerprint,
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

describe("Community reputation scoring consent PostgreSQL authority", () => {
  it("defaults off, blocks private score computation, and stays independent from public visibility", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const fixture = await seedProfile("independent");
    const readContext = context(fixture, ["community:profile:read"]);
    const writeContext = context(fixture, ["community:profile:write"]);
    const scoreContext = context(fixture, ["community:reputation:read"]);

    const initial = await loadCommunityReputationScoringConsent(readContext);
    assert.equal(initial.available, true);
    assert.equal(initial.consent?.enabled, false);
    assert.equal(initial.consent?.revision, 0);
    assert.equal(
      initial.consent?.consentVersion,
      COMMUNITY_REPUTATION_SCORING_CONSENT_VERSION,
    );

    const blocked = await loadJournalDisciplineScore(scoreContext);
    assert.equal(blocked.available, true);
    assert.equal(blocked.consentRequired, true);
    assert.equal(blocked.score, null);

    const correlationId = `reputation-consent-${randomUUID()}`;
    const enabled = await updateCommunityReputationScoringConsent({
      context: writeContext,
      expectedRevision: 0,
      enabled: true,
      audit: scoringAudit({
        ...fixture,
        correlationId,
        expectedRevision: 0,
        enabled: true,
      }),
    });
    assert.equal(enabled.ok, true);
    if (!enabled.ok) return;
    assert.equal(enabled.consent.enabled, true);
    assert.equal(enabled.consent.revision, 1);

    const scoreAfterConsent = await loadJournalDisciplineScore(scoreContext);
    assert.equal(scoreAfterConsent.available, true);
    assert.equal(scoreAfterConsent.consentRequired, false);
    assert.equal(scoreAfterConsent.score?.status, "insufficient_evidence");

    const replay = await updateCommunityReputationScoringConsent({
      context: writeContext,
      expectedRevision: 0,
      enabled: true,
      audit: scoringAudit({
        ...fixture,
        correlationId,
        expectedRevision: 0,
        enabled: true,
      }),
    });
    assert.equal(replay.ok, true);
    if (replay.ok) assert.equal(replay.replayed, true);

    const changedReplay = await updateCommunityReputationScoringConsent({
      context: writeContext,
      expectedRevision: 0,
      enabled: false,
      audit: scoringAudit({
        ...fixture,
        correlationId,
        expectedRevision: 0,
        enabled: false,
      }),
    });
    assert.deepEqual(changedReplay, { ok: false, reason: "idempotency_conflict" });

    const publicConsent = {
      ...defaultCommunityConsent(),
      profileVisibility: "public" as const,
      leaderboardVisible: true,
    };
    const profileUpdated = await updateCommunityProfileConsent({
      context: writeContext,
      expectedRevision: 0,
      consent: publicConsent,
      audit: profileAudit({
        ...fixture,
        correlationId: `profile-consent-${randomUUID()}`,
        expectedRevision: 0,
        consent: publicConsent,
      }),
    });
    assert.equal(profileUpdated.ok, true);

    const disabled = await updateCommunityReputationScoringConsent({
      context: writeContext,
      expectedRevision: 1,
      enabled: false,
      audit: scoringAudit({
        ...fixture,
        correlationId: `reputation-consent-${randomUUID()}`,
        expectedRevision: 1,
        enabled: false,
      }),
    });
    assert.equal(disabled.ok, true);

    const profileAfter = await loadOwnedCommunityProfile(readContext);
    assert.equal(profileAfter.available, true);
    assert.equal(profileAfter.profile?.consent.leaderboardVisible, true);

    const blockedAgain = await loadJournalDisciplineScore(scoreContext);
    assert.equal(blockedAgain.available, true);
    assert.equal(blockedAgain.consentRequired, true);
    assert.equal(blockedAgain.score, null);

    const evidence = await withClient((client) =>
      client.query<{ count: number; authority: string }>(
        `SELECT COUNT(*)::int AS count,
                MIN(metadata->>'authority') AS authority
           FROM sensitive_mutation_audit_events
          WHERE tenant_id = $1
            AND action = 'community.profile.consent.update'
            AND metadata->>'authority' = $2`,
        [fixture.tenantId, COMMUNITY_REPUTATION_SCORING_CONSENT_POLICY],
      ),
    );
    assert.equal(evidence.rows[0].count, 2);
    assert.equal(evidence.rows[0].authority, COMMUNITY_REPUTATION_SCORING_CONSENT_POLICY);
  });

  it("isolates tenant/principal identity and rejects stale revisions", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const owner = await seedProfile("owner");
    const other = await seedProfile("other");
    const ownerWrite = context(owner, ["community:profile:write"]);

    const first = await updateCommunityReputationScoringConsent({
      context: ownerWrite,
      expectedRevision: 0,
      enabled: true,
      audit: scoringAudit({
        ...owner,
        correlationId: `reputation-consent-${randomUUID()}`,
        expectedRevision: 0,
        enabled: true,
      }),
    });
    assert.equal(first.ok, true);

    const stale = await updateCommunityReputationScoringConsent({
      context: ownerWrite,
      expectedRevision: 0,
      enabled: false,
      audit: scoringAudit({
        ...owner,
        correlationId: `reputation-consent-${randomUUID()}`,
        expectedRevision: 0,
        enabled: false,
      }),
    });
    assert.deepEqual(stale, { ok: false, reason: "revision_conflict" });

    const crossTenant = await loadCommunityReputationScoringConsent(
      context(
        {
          tenantId: other.tenantId,
          workspaceId: other.workspaceId,
          studentId: owner.studentId,
        },
        ["community:profile:read"],
      ),
    );
    assert.deepEqual(crossTenant, { available: true, consent: null });

    const forged = await updateCommunityReputationScoringConsent({
      context: context(
        {
          tenantId: owner.tenantId,
          workspaceId: owner.workspaceId,
          studentId: other.studentId,
        },
        ["community:profile:write"],
      ),
      expectedRevision: 0,
      enabled: true,
      audit: scoringAudit({
        ...owner,
        studentId: other.studentId,
        correlationId: `reputation-consent-${randomUUID()}`,
        expectedRevision: 0,
        enabled: true,
      }),
    });
    assert.deepEqual(forged, { ok: false, reason: "not_found" });
  });
});
