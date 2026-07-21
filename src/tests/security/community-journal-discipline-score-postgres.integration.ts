import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import {
  deriveOfficialJournalChallengeCycle,
  type OfficialJournalChallengeCycle,
} from "../../lib/community-journal-challenge-authority";
import { loadJournalDisciplineScore } from "../../lib/community-journal-discipline-score-authority";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import type { AvailableTenantPrincipalContext } from "../../lib/security/tenant-principal-context";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;
let pool: Pool | null = null;

type Identity = { tenantId: string; workspaceId: string; studentId: string };

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function context(identity: Identity): AvailableTenantPrincipalContext {
  return {
    available: true,
    tenantId: identity.tenantId,
    workspaceId: identity.workspaceId,
    principalType: "student",
    principalId: identity.studentId,
    roles: ["student"],
    scopes: ["community:reputation:read"],
    bindingSource: "journal_discipline_score_test",
    bindingStatus: "active",
    membershipId: null,
    requestId: `journal-discipline-${randomUUID()}`,
    authEvidence: { strictRevocation: true, sessionPrincipal: true },
  };
}

async function seedIdentity(label: string): Promise<Identity> {
  const identity = {
    tenantId: `discipline-${label}-${randomUUID()}`,
    workspaceId: `workspace-${randomUUID()}`,
    studentId: randomUUID(),
  };
  const username = `d_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
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
        [identity.studentId, `Discipline ${label}`, username],
      );
      await client.query(
        `INSERT INTO platform_principal_bindings
           (tenant_id, workspace_id, principal_type, principal_id, source)
         VALUES ($1, $2, 'student', $3, 'journal_discipline_score_test')`,
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

async function seedTerminalCycle(input: {
  identity: Identity;
  offset: number;
  eligible: number;
  reflected: number;
}): Promise<OfficialJournalChallengeCycle> {
  const cycle = await previousCycle(input.offset);
  const enrollmentId = randomUUID();
  const startedAt = new Date(
    new Date(cycle.startsAt).getTime() + 60 * 60_000,
  ).toISOString();
  const finalizedAt = new Date(
    new Date(cycle.endsAt).getTime() + 60_000,
  ).toISOString();
  const completed =
    input.eligible >= 3 && input.reflected * 5 >= input.eligible * 4;
  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO academy_community_challenge_enrollments
           (id, tenant_id, workspace_id, principal_type, student_id,
            challenge_id, challenge_version, cycle_key,
            cycle_starts_at, cycle_ends_at, started_at)
         VALUES
           ($1::uuid, $2, $3, 'student', $4::uuid,
            'journal-reflection-week', 'journal-reflection-v1', $5,
            $6::timestamptz, $7::timestamptz, $8::timestamptz)`,
        [
          enrollmentId,
          input.identity.tenantId,
          input.identity.workspaceId,
          input.identity.studentId,
          cycle.key,
          cycle.startsAt,
          cycle.endsAt,
          startedAt,
        ],
      );
      await client.query(
        `UPDATE academy_community_challenge_enrollments
            SET status = $5,
                revision = revision + 1,
                evaluated_at = $6::timestamptz,
                completed_at = CASE WHEN $5 = 'completed' THEN $6::timestamptz ELSE NULL END,
                finalized_at = $6::timestamptz,
                finalization_source = 'interactive',
                finalization_run_id = NULL,
                eligible_closed_trade_count = $7,
                valid_reflection_count = $8
          WHERE id = $1::uuid
            AND tenant_id = $2
            AND workspace_id = $3
            AND principal_id = $4
            AND status = 'active'`,
        [
          enrollmentId,
          input.identity.tenantId,
          input.identity.workspaceId,
          input.identity.studentId,
          completed ? "completed" : "not_completed",
          finalizedAt,
          input.eligible,
          input.reflected,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
  return cycle;
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

describe("Journal Discipline Score PostgreSQL authority", () => {
  it("requires four immutable terminal cycles before returning a score", {
    skip: !configured,
  }, async () => {
    const identity = await seedIdentity("minimum");
    for (let offset = 1; offset <= 3; offset += 1) {
      await seedTerminalCycle({
        identity,
        offset,
        eligible: 5,
        reflected: 4,
      });
    }
    const insufficient = await loadJournalDisciplineScore(context(identity));
    assert.equal(insufficient.available, true);
    assert.equal(insufficient.score?.status, "insufficient_evidence");
    assert.equal(insufficient.score?.evaluatedCycles, 3);
    assert.equal(insufficient.score?.scoreBasisPoints, null);

    await seedTerminalCycle({ identity, offset: 4, eligible: 5, reflected: 4 });
    const available = await loadJournalDisciplineScore(context(identity));
    assert.equal(available.available, true);
    assert.equal(available.score?.status, "available");
    assert.equal(available.score?.evaluatedCycles, 4);
    assert.equal(available.score?.scoreBasisPoints, 8_800);
    assert.match(available.score?.evaluatedEvidenceDigest ?? "", /^[0-9a-f]{64}$/);
  });

  it("weights cycles equally regardless of trade volume", {
    skip: !configured,
  }, async () => {
    const identity = await seedIdentity("equal-weight");
    await seedTerminalCycle({ identity, offset: 1, eligible: 100_000, reflected: 100_000 });
    await seedTerminalCycle({ identity, offset: 2, eligible: 3, reflected: 0 });
    await seedTerminalCycle({ identity, offset: 3, eligible: 5, reflected: 5 });
    await seedTerminalCycle({ identity, offset: 4, eligible: 1_000, reflected: 0 });

    const loaded = await loadJournalDisciplineScore(context(identity));
    assert.equal(loaded.available, true);
    assert.equal(loaded.score?.completedCycles, 2);
    assert.equal(loaded.score?.completionConsistencyBasisPoints, 5_000);
    assert.equal(loaded.score?.meanCoverageBasisPoints, 5_000);
    assert.equal(loaded.score?.scoreBasisPoints, 5_000);
  });

  it("uses only the latest twelve cycles in deterministic order", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const identity = await seedIdentity("lookback");
    let twelfth: OfficialJournalChallengeCycle | null = null;
    for (let offset = 1; offset <= 13; offset += 1) {
      const seeded = await seedTerminalCycle({
        identity,
        offset,
        eligible: 5,
        reflected: offset === 13 ? 0 : 4,
      });
      if (offset === 12) twelfth = seeded;
    }
    const loaded = await loadJournalDisciplineScore(context(identity));
    assert.equal(loaded.available, true);
    assert.equal(loaded.score?.evaluatedCycles, 12);
    assert.equal(loaded.score?.completedCycles, 12);
    assert.equal(loaded.score?.meanCoverageBasisPoints, 8_000);
    assert.equal(loaded.score?.windowStartsAt, twelfth?.startsAt);
  });

  it("isolates tenants and fails closed after binding revocation", {
    skip: !configured,
  }, async () => {
    const identityA = await seedIdentity("tenant-a");
    const identityB = await seedIdentity("tenant-b");
    for (let offset = 1; offset <= 4; offset += 1) {
      await seedTerminalCycle({
        identity: identityA,
        offset,
        eligible: 5,
        reflected: 5,
      });
    }

    const isolated = await loadJournalDisciplineScore(context(identityB));
    assert.equal(isolated.available, true);
    assert.equal(isolated.score?.evaluatedCycles, 0);
    assert.equal(isolated.score?.scoreBasisPoints, null);

    await revoke(identityA);
    const revoked = await loadJournalDisciplineScore(context(identityA));
    assert.equal(revoked.available, false);
    assert.equal(revoked.score, null);
  });
});
