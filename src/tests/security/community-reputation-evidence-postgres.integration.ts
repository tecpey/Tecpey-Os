import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import {
  deriveOfficialJournalChallengeCycle,
  type OfficialJournalChallengeCycle,
  type OfficialJournalChallengeEnrollmentRow,
} from "../../lib/community-journal-challenge-authority";
import {
  communityReputationCoverageBasisPoints,
  communityReputationSourceDigest,
  loadCommunityReputationEvidenceSummary,
  materializeCommunityReputationEvidenceTx,
} from "../../lib/community-reputation-evidence-authority";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import type { AvailableTenantPrincipalContext } from "../../lib/security/tenant-principal-context";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;
let pool: Pool | null = null;

type Identity = { tenantId: string; workspaceId: string; studentId: string };

type EvidenceRow = {
  id: string;
  source_enrollment_id: string;
  tenant_id: string;
  workspace_id: string;
  principal_id: string;
  outcome: "completed" | "not_completed";
  finalized_at: Date;
  eligible_closed_trade_count: number;
  valid_reflection_count: number;
  coverage_basis_points: number;
  completion_criteria_met: boolean;
  finalization_source: "interactive" | "worker";
  finalization_run_id: string | null;
  source_digest: string;
};

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function readContext(identity: Identity): AvailableTenantPrincipalContext {
  return {
    available: true,
    tenantId: identity.tenantId,
    workspaceId: identity.workspaceId,
    principalType: "student",
    principalId: identity.studentId,
    roles: ["student"],
    scopes: ["community:reputation:read"],
    bindingSource: "community_reputation_evidence_test",
    bindingStatus: "active",
    membershipId: null,
    requestId: `community-reputation-${randomUUID()}`,
    authEvidence: { strictRevocation: true, sessionPrincipal: true },
  };
}

async function seedIdentity(label: string): Promise<Identity> {
  const identity = {
    tenantId: `reputation-${label}-${randomUUID()}`,
    workspaceId: `workspace-${randomUUID()}`,
    studentId: randomUUID(),
  };
  const username = `r_${randomUUID().replaceAll("-", "").slice(0, 18)}`;

  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
         VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`,
        [identity.tenantId],
      );
      await client.query(
        `INSERT INTO platform_workspaces
           (id, tenant_id, slug, display_name, products, settings)
         VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
        [identity.workspaceId, identity.tenantId],
      );
      await client.query(
        `INSERT INTO academy_students (id, locale, display_name, username)
         VALUES ($1::uuid, 'fa', $2, $3)`,
        [identity.studentId, `Reputation ${label}`, username],
      );
      // Keep the legitimate default TecPey binding/public-profile relation and
      // add the independent tenant binding under test.
      await client.query(
        `INSERT INTO platform_principal_bindings
           (tenant_id, workspace_id, principal_type, principal_id, source)
         VALUES ($1, $2, 'student', $3, 'community_reputation_evidence_test')`,
        [identity.tenantId, identity.workspaceId, identity.studentId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  return identity;
}

async function previousCycle(offset: number): Promise<OfficialJournalChallengeCycle> {
  return withClient(async (client) => {
    const clock = await client.query<{ now: Date }>("SELECT NOW() AS now");
    const current = deriveOfficialJournalChallengeCycle(new Date(clock.rows[0].now));
    return deriveOfficialJournalChallengeCycle(
      new Date(new Date(current.startsAt).getTime() - offset * WEEK_MS + 60_000),
    );
  });
}

const ENROLLMENT_SELECT = `
  id::text, tenant_id, workspace_id, principal_type, principal_id,
  student_id::text, challenge_id, challenge_version, cycle_key,
  cycle_starts_at, cycle_ends_at, status, revision::text, started_at,
  evaluated_at, completed_at, finalized_at, finalization_source,
  finalization_run_id::text, eligible_closed_trade_count,
  valid_reflection_count, coverage_rate::text
`;

async function seedActiveEnrollment(
  identity: Identity,
  cycle: OfficialJournalChallengeCycle,
): Promise<string> {
  const startedAt = new Date(
    new Date(cycle.startsAt).getTime() + 60 * 60_000,
  ).toISOString();
  return withClient(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO academy_community_challenge_enrollments
         (id, tenant_id, workspace_id, principal_type, student_id,
          challenge_id, challenge_version, cycle_key,
          cycle_starts_at, cycle_ends_at, started_at)
       VALUES
         (gen_random_uuid(), $1, $2, 'student', $3::uuid,
          'journal-reflection-week', 'journal-reflection-v1', $4,
          $5::timestamptz, $6::timestamptz, $7::timestamptz)
       RETURNING id::text`,
      [
        identity.tenantId,
        identity.workspaceId,
        identity.studentId,
        cycle.key,
        cycle.startsAt,
        cycle.endsAt,
        startedAt,
      ],
    );
    return result.rows[0].id;
  });
}

async function readEnrollment(id: string): Promise<OfficialJournalChallengeEnrollmentRow> {
  return withClient(async (client) => {
    const result = await client.query<OfficialJournalChallengeEnrollmentRow>(
      `SELECT ${ENROLLMENT_SELECT}
         FROM academy_community_challenge_enrollments
        WHERE id = $1::uuid`,
      [id],
    );
    assert.equal(result.rowCount, 1);
    return result.rows[0];
  });
}

async function finalize(input: {
  identity: Identity;
  enrollmentId: string;
  cycle: OfficialJournalChallengeCycle;
  outcome: "completed" | "not_completed";
  eligible: number;
  reflected: number;
  source: "interactive" | "worker";
  runId?: string | null;
}): Promise<OfficialJournalChallengeEnrollmentRow> {
  const finalizedAt = new Date(
    new Date(input.cycle.endsAt).getTime() + 60_000,
  ).toISOString();
  return withClient(async (client) => {
    const result = await client.query<OfficialJournalChallengeEnrollmentRow>(
      `UPDATE academy_community_challenge_enrollments
          SET status = $4,
              revision = revision + 1,
              evaluated_at = $5::timestamptz,
              completed_at = CASE WHEN $4 = 'completed' THEN $5::timestamptz ELSE NULL END,
              finalized_at = $5::timestamptz,
              finalization_source = $6,
              finalization_run_id = $7::uuid,
              eligible_closed_trade_count = $8,
              valid_reflection_count = $9
        WHERE id = $1::uuid
          AND tenant_id = $2
          AND principal_id = $3
          AND status = 'active'
        RETURNING ${ENROLLMENT_SELECT}`,
      [
        input.enrollmentId,
        input.identity.tenantId,
        input.identity.studentId,
        input.outcome,
        finalizedAt,
        input.source,
        input.runId ?? null,
        input.eligible,
        input.reflected,
      ],
    );
    assert.equal(result.rowCount, 1);
    return result.rows[0];
  });
}

async function evidence(id: string): Promise<EvidenceRow> {
  return withClient(async (client) => {
    const result = await client.query<EvidenceRow>(
      `SELECT id::text, source_enrollment_id::text, tenant_id, workspace_id,
              principal_id, outcome, finalized_at, eligible_closed_trade_count,
              valid_reflection_count, coverage_basis_points,
              completion_criteria_met, finalization_source,
              finalization_run_id::text, source_digest
         FROM academy_community_reputation_evidence
        WHERE source_enrollment_id = $1::uuid`,
      [id],
    );
    assert.equal(result.rowCount, 1);
    return result.rows[0];
  });
}

async function revoke(identity: Identity): Promise<void> {
  await withClient((client) => client.query(
    `UPDATE platform_principal_bindings
        SET status = 'revoked', updated_at = NOW()
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND principal_type = 'student'
        AND principal_id = $3`,
    [identity.tenantId, identity.workspaceId, identity.studentId],
  ));
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 8, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Community reputation evidence PostgreSQL authority", () => {
  it("materializes interactive completion atomically and replays exactly once", {
    skip: !configured,
  }, async () => {
    const identity = await seedIdentity("interactive");
    const cycle = await previousCycle(2);
    const enrollmentId = await seedActiveEnrollment(identity, cycle);
    const enrollment = await finalize({
      identity,
      enrollmentId,
      cycle,
      outcome: "completed",
      eligible: 5,
      reflected: 4,
      source: "interactive",
    });

    const row = await evidence(enrollmentId);
    assert.equal(row.id, enrollmentId);
    assert.equal(row.source_enrollment_id, enrollmentId);
    assert.equal(row.tenant_id, identity.tenantId);
    assert.equal(row.workspace_id, identity.workspaceId);
    assert.equal(row.principal_id, identity.studentId);
    assert.equal(row.outcome, "completed");
    assert.equal(row.coverage_basis_points, 8000);
    assert.equal(row.completion_criteria_met, true);
    assert.equal(row.finalization_source, "interactive");
    assert.equal(row.finalization_run_id, null);

    const expectedDigest = communityReputationSourceDigest({
      tenantId: identity.tenantId,
      workspaceId: identity.workspaceId,
      principalType: "student",
      principalId: identity.studentId,
      studentId: identity.studentId,
      sourceEnrollmentId: enrollmentId,
      challengeId: "journal-reflection-week",
      challengeVersion: "journal-reflection-v1",
      cycleKey: cycle.key,
      cycleStartsAt: cycle.startsAt,
      cycleEndsAt: cycle.endsAt,
      outcome: "completed",
      finalizedAt: new Date(enrollment.finalized_at!).toISOString(),
      eligibleClosedTrades: 5,
      validReflections: 4,
      coverageBasisPoints: 8000,
      completionCriteriaMet: true,
      finalizationSource: "interactive",
      finalizationRunId: null,
    });
    assert.equal(row.source_digest, expectedDigest);

    await withClient(async (client) => {
      const replay = await materializeCommunityReputationEvidenceTx(client, enrollment);
      assert.equal(replay.sourceDigest, expectedDigest);
    });
    const count = await withClient((client) => client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM academy_community_reputation_evidence
        WHERE source_enrollment_id = $1::uuid`,
      [enrollmentId],
    ));
    assert.equal(Number(count.rows[0].count), 1);
  });

  it("materializes worker not-completed evidence and rounds deterministically", {
    skip: !configured,
  }, async () => {
    const identity = await seedIdentity("worker");
    const cycle = await previousCycle(3);
    const enrollmentId = await seedActiveEnrollment(identity, cycle);
    const runId = randomUUID();
    await finalize({
      identity,
      enrollmentId,
      cycle,
      outcome: "not_completed",
      eligible: 4,
      reflected: 3,
      source: "worker",
      runId,
    });

    const row = await evidence(enrollmentId);
    assert.equal(row.outcome, "not_completed");
    assert.equal(row.coverage_basis_points, 7500);
    assert.equal(row.completion_criteria_met, false);
    assert.equal(row.finalization_run_id, runId);
    assert.equal(communityReputationCoverageBasisPoints(3, 1), 3333);
    assert.equal(communityReputationCoverageBasisPoints(3, 2), 6667);
    assert.equal(communityReputationCoverageBasisPoints(5, 4), 8000);
  });

  it("rejects active sources, forged evidence, updates and deletes", {
    skip: !configured,
  }, async () => {
    const identity = await seedIdentity("reject");
    const activeCycle = await previousCycle(4);
    const activeId = await seedActiveEnrollment(identity, activeCycle);
    const active = await readEnrollment(activeId);
    await withClient(async (client) => {
      await assert.rejects(
        materializeCommunityReputationEvidenceTx(client, active),
        /community_reputation_source_identity_invalid|community_reputation_source_not_finalized/,
      );
    });

    const terminalCycle = await previousCycle(5);
    const terminalId = await seedActiveEnrollment(identity, terminalCycle);
    await finalize({
      identity,
      enrollmentId: terminalId,
      cycle: terminalCycle,
      outcome: "completed",
      eligible: 5,
      reflected: 4,
      source: "interactive",
    });

    await assert.rejects(
      withClient((client) => client.query(
        `INSERT INTO academy_community_reputation_evidence
           (id, tenant_id, workspace_id, principal_type, principal_id, student_id,
            evidence_version, source_type, source_enrollment_id,
            challenge_id, challenge_version, cycle_key, cycle_starts_at, cycle_ends_at,
            outcome, finalized_at, eligible_closed_trade_count, valid_reflection_count,
            coverage_basis_points, completion_criteria_met, finalization_source,
            finalization_run_id, source_digest)
         SELECT id, tenant_id, workspace_id, principal_type, principal_id, student_id,
                'community-reputation-evidence-v1',
                'official_journal_challenge_finalization', id,
                challenge_id, challenge_version, cycle_key, cycle_starts_at, cycle_ends_at,
                status, finalized_at, eligible_closed_trade_count, valid_reflection_count,
                7999, TRUE, finalization_source, finalization_run_id, $2
           FROM academy_community_challenge_enrollments
          WHERE id = $1::uuid`,
        [terminalId, "f".repeat(64)],
      )),
      /community reputation evidence does not match terminal source|coverage_check/,
    );
    await assert.rejects(
      withClient((client) => client.query(
        `UPDATE academy_community_reputation_evidence
            SET source_digest = $2
          WHERE source_enrollment_id = $1::uuid`,
        [terminalId, "e".repeat(64)],
      )),
      /community reputation evidence is append-only/,
    );
    await assert.rejects(
      withClient((client) => client.query(
        `DELETE FROM academy_community_reputation_evidence
          WHERE source_enrollment_id = $1::uuid`,
        [terminalId],
      )),
      /community reputation evidence is append-only/,
    );
  });

  it("rolls back terminal finalization when the selected binding is revoked", {
    skip: !configured,
  }, async () => {
    const identity = await seedIdentity("revoked-finalization");
    const cycle = await previousCycle(6);
    const enrollmentId = await seedActiveEnrollment(identity, cycle);
    await revoke(identity);

    await assert.rejects(
      finalize({
        identity,
        enrollmentId,
        cycle,
        outcome: "completed",
        eligible: 5,
        reflected: 4,
        source: "interactive",
      }),
      /community reputation finalization binding inactive/,
    );
    assert.equal((await readEnrollment(enrollmentId)).status, "active");
    const count = await withClient((client) => client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM academy_community_reputation_evidence
        WHERE source_enrollment_id = $1::uuid`,
      [enrollmentId],
    ));
    assert.equal(Number(count.rows[0].count), 0);
  });

  it("isolates principals and hides evidence after binding revocation", {
    skip: !configured,
  }, async () => {
    const alpha = await seedIdentity("alpha");
    const beta = await seedIdentity("beta");
    const alphaOne = await previousCycle(7);
    const alphaTwo = await previousCycle(8);
    const betaCycle = await previousCycle(9);

    await finalize({
      identity: alpha,
      enrollmentId: await seedActiveEnrollment(alpha, alphaOne),
      cycle: alphaOne,
      outcome: "completed",
      eligible: 5,
      reflected: 4,
      source: "interactive",
    });
    await finalize({
      identity: alpha,
      enrollmentId: await seedActiveEnrollment(alpha, alphaTwo),
      cycle: alphaTwo,
      outcome: "not_completed",
      eligible: 3,
      reflected: 2,
      source: "worker",
      runId: randomUUID(),
    });
    await finalize({
      identity: beta,
      enrollmentId: await seedActiveEnrollment(beta, betaCycle),
      cycle: betaCycle,
      outcome: "completed",
      eligible: 10,
      reflected: 10,
      source: "interactive",
    });

    const alphaResult = await loadCommunityReputationEvidenceSummary(readContext(alpha));
    assert.equal(alphaResult.available, true);
    if (!alphaResult.available) return;
    assert.equal(alphaResult.summary.finalizedCycles, 2);
    assert.equal(alphaResult.summary.completedCycles, 1);
    assert.equal(alphaResult.summary.notCompletedCycles, 1);
    assert.equal(alphaResult.summary.eligibleClosedTrades, 8);
    assert.equal(alphaResult.summary.validReflections, 6);
    assert.equal(alphaResult.summary.aggregateCoverageBasisPoints, 7500);
    assert.equal(alphaResult.summary.score, null);
    assert.equal(alphaResult.summary.rank, null);
    assert.equal(alphaResult.summary.rewardEligibility, false);
    assert.equal(alphaResult.summary.mentorDecisionEligible, false);
    assert.equal(alphaResult.summary.instructorDecisionEligible, false);

    const betaResult = await loadCommunityReputationEvidenceSummary(readContext(beta));
    assert.equal(betaResult.available, true);
    if (!betaResult.available) return;
    assert.equal(betaResult.summary.finalizedCycles, 1);
    assert.equal(betaResult.summary.eligibleClosedTrades, 10);
    assert.equal(betaResult.summary.validReflections, 10);

    await revoke(alpha);
    const revoked = await loadCommunityReputationEvidenceSummary(readContext(alpha));
    assert.equal(revoked.available, true);
    if (!revoked.available) return;
    assert.equal(revoked.summary.finalizedCycles, 0);
    assert.equal(revoked.summary.latest, null);
  });
});
