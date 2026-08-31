import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  activateAcademyMasterySeason,
  readAcademyMasterySeasonState,
  type AcademyMasteryTenantScope,
} from "../../lib/academy-mastery-seasons-authority";
import {
  decideAcademyMasteryGenerationDraft,
  listAcademyMasteryGenerationDrafts,
  submitAcademyMasteryGenerationDraft,
} from "../../lib/academy-mastery-season-review-orchestrator";
import { validGeneratedMasteryDraft } from "../product/mastery-season-draft-fixture";

// Load-bearing adversarial guard for the six Mastery Seasons tables (#109).
//
// All six carry (tenant_id, workspace_id) in their primary key or uniqueness
// boundary, and every reader and writer in
// academy-mastery-seasons-authority.ts and
// academy-mastery-season-review-orchestrator.ts filters on both. This suite
// proves those predicates are real rather than decorative, using the shape the
// platform actually allows: platform_principal_bindings is keyed by
// (tenant_id, workspace_id, principal_type, principal_id), so the SAME student
// UUID can be bound in two tenants. Every assertion below therefore drives the
// same student id under two tenants and requires the two views to stay apart.
//
// Removing `AND tenant_id = $1` from any of the covered statements makes at
// least one assertion here fail.
//
// The final case guards a leak this suite originally discovered and recorded as
// audit finding F-8: readAcademyMasterySeasonState composes readCompletedTerms(),
// which read academy_term_progress — then a table with no tenant column at all —
// so terms passed in one tenant unlocked a season in another. Migration 0066
// gave that table a tenant boundary and the read is now scoped, so the case
// asserts isolation rather than the old contamination.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const TENANT_A = `tenant-a-${randomUUID()}`;
const WORKSPACE_A = `ws-a-${randomUUID()}`;
const TENANT_B = `tenant-b-${randomUUID()}`;
const WORKSPACE_B = `ws-b-${randomUUID()}`;

const SCOPE_A: AcademyMasteryTenantScope = { tenantId: TENANT_A, workspaceId: WORKSPACE_A };
const SCOPE_B: AcademyMasteryTenantScope = { tenantId: TENANT_B, workspaceId: WORKSPACE_B };

// Term 8 is a post-core programme even when a repair recommendation was
// identified earlier. Activation therefore requires all seven core terms.
const SEASON = "risk-repair-season";
const SEASON_UNLOCK_TERM = 7;

const cleanupStudents = new Set<string>();
// Track drafts by id rather than by tenant: a tenant-wide delete would also
// remove the default tenant's real rows from a shared database.
const cleanupDraftIds = new Set<string>();

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

function isPostgresErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

async function retryPostgresDeadlock<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isPostgresErrorCode(error, "40P01") || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
    }
  }
}

async function seedStudentBoundToBothTenants(client: PoolClient): Promise<string> {
  return retryPostgresDeadlock(async () => {
    const studentId = randomUUID();
    cleanupStudents.add(studentId);
    for (const [tenant, workspace] of [[TENANT_A, WORKSPACE_A], [TENANT_B, WORKSPACE_B]]) {
      await client.query(
        `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
         VALUES ($1, $1, $1, 'enterprise', '{}'::text[]) ON CONFLICT (id) DO NOTHING`,
        [tenant],
      );
      await client.query(
        `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
         VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
        [workspace, tenant],
      );
    }
    await client.query(
      `INSERT INTO academy_students (id, locale) VALUES ($1::uuid, 'fa')
       ON CONFLICT (id) DO NOTHING`,
      [studentId],
    );
    for (const [tenant, workspace] of [[TENANT_A, WORKSPACE_A], [TENANT_B, WORKSPACE_B]]) {
      await client.query(
        `INSERT INTO platform_principal_bindings
           (tenant_id, workspace_id, principal_type, principal_id, status, source)
         VALUES ($1, $2, 'student', $3, 'active', 'test')
         ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id) DO NOTHING`,
        [tenant, workspace, studentId],
      );
    }
    return studentId;
  });
}

async function upsertProfile(
  client: PoolClient,
  scope: AcademyMasteryTenantScope,
  studentId: string,
  input: { completedTerms: number; weakConceptTags: string[] },
): Promise<void> {
  await client.query(
    `INSERT INTO academy_student_mastery_profiles
       (tenant_id, workspace_id, student_id, locale, completed_terms, weak_concept_tags)
     VALUES ($1, $2, $3::uuid, 'fa', $4, $5::jsonb)
     ON CONFLICT (tenant_id, workspace_id, student_id, locale)
     DO UPDATE SET completed_terms = EXCLUDED.completed_terms,
                   weak_concept_tags = EXCLUDED.weak_concept_tags`,
    [scope.tenantId, scope.workspaceId, studentId, input.completedTerms, JSON.stringify(input.weakConceptTags)],
  );
}

async function insertWeaknessSignal(
  client: PoolClient,
  scope: AcademyMasteryTenantScope,
  studentId: string,
  conceptTag: string,
): Promise<void> {
  await client.query(
    `INSERT INTO academy_mastery_weakness_signals
       (tenant_id, workspace_id, student_id, locale, source_type, source_id, concept_tag, strength)
     VALUES ($1, $2, $3::uuid, 'fa', 'assessment', $4, $5, -60)`,
    [scope.tenantId, scope.workspaceId, studentId, `src-${randomUUID()}`, conceptTag],
  );
}

async function passAllCoreTerms(
  client: PoolClient,
  scope: AcademyMasteryTenantScope,
  studentId: string,
): Promise<void> {
  for (let term = 1; term <= SEASON_UNLOCK_TERM; term += 1) {
    await client.query(
      `INSERT INTO academy_term_progress
         (tenant_id, workspace_id, student_id, term_number, status, locale, score, percent)
       VALUES ($1, $2, $3::uuid, $4, 'passed', 'fa', 100, 100)
       ON CONFLICT (tenant_id, workspace_id, student_id, term_number, locale) DO NOTHING`,
      [scope.tenantId, scope.workspaceId, studentId, term],
    );
  }
}


before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 4, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  if (!pool) return;
  await withClient(async (client) => {
    // Remove every fixture under BOTH tenants so repeated runs against a shared
    // database do not accumulate rows. Children go before the bindings: the
    // progress-event and assignment rows reference academy_students, and the
    // tenant-A rows are not covered by the tenant-B cascade.
    for (const studentId of cleanupStudents) {
      await client.query(
        `DELETE FROM academy_mastery_season_progress_events WHERE student_id = $1::uuid`,
        [studentId],
      );
      await client.query(
        `DELETE FROM academy_mastery_season_assignments WHERE student_id = $1::uuid`,
        [studentId],
      );
      await client.query(
        `DELETE FROM academy_mastery_weakness_signals WHERE student_id = $1::uuid`,
        [studentId],
      );
      await client.query(
        `DELETE FROM academy_student_mastery_profiles WHERE student_id = $1::uuid`,
        [studentId],
      );
      await client.query(`DELETE FROM academy_term_progress WHERE student_id = $1::uuid`, [studentId]);
      // academy_public_profiles carries a composite FK onto
      // platform_principal_bindings with ON DELETE RESTRICT, so any profile row
      // the authority created for this student must go before its binding.
      await client.query(`DELETE FROM academy_public_profiles WHERE student_id = $1::uuid`, [studentId]);
      await client.query(`DELETE FROM learning_events WHERE student_id = $1::uuid`, [studentId]);
      await retryPostgresDeadlock(() =>
        client.query(
          `DELETE FROM platform_principal_bindings WHERE principal_type = 'student' AND principal_id = $1`,
          [studentId],
        ),
      );
      await client.query(`DELETE FROM academy_students WHERE id = $1::uuid`, [studentId]);
    }
    for (const draftId of cleanupDraftIds) {
      await client.query(
        `DELETE FROM academy_mastery_season_generation_drafts WHERE id = $1::uuid`,
        [draftId],
      );
    }
    for (const tenantId of [TENANT_A, TENANT_B]) {
      await client.query(`DELETE FROM platform_workspaces WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM platform_tenants WHERE id = $1`, [tenantId]);
    }
  });
  await pool.end();
  pool = null;
});

describe("Mastery Seasons cross-tenant isolation", () => {
  it(
    "keeps mastery profiles and weakness signals apart for one student in two tenants",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withClient(async (client) => {
        const studentId = await seedStudentBoundToBothTenants(client);

        await upsertProfile(client, SCOPE_A, studentId, {
          completedTerms: 5,
          weakConceptTags: ["tenant-a-only-tag"],
        });
        await upsertProfile(client, SCOPE_B, studentId, {
          completedTerms: 1,
          weakConceptTags: ["tenant-b-only-tag"],
        });
        await insertWeaknessSignal(client, SCOPE_A, studentId, "signal-a-only");
        await insertWeaknessSignal(client, SCOPE_B, studentId, "signal-b-only");

        const stateA = await readAcademyMasterySeasonState(client, SCOPE_A, studentId, "fa");
        const stateB = await readAcademyMasterySeasonState(client, SCOPE_B, studentId, "fa");

        const tagsA = new Set(stateA.signals.weakConceptTags);
        const tagsB = new Set(stateB.signals.weakConceptTags);

        assert.ok(tagsA.has("tenant-a-only-tag"), "tenant A must see its own profile tag");
        assert.ok(tagsA.has("signal-a-only"), "tenant A must see its own weakness signal");
        assert.equal(tagsA.has("tenant-b-only-tag"), false, "tenant A must not read tenant B's profile tag");
        assert.equal(tagsA.has("signal-b-only"), false, "tenant A must not read tenant B's weakness signal");

        assert.ok(tagsB.has("tenant-b-only-tag"), "tenant B must see its own profile tag");
        assert.ok(tagsB.has("signal-b-only"), "tenant B must see its own weakness signal");
        assert.equal(tagsB.has("tenant-a-only-tag"), false, "tenant B must not read tenant A's profile tag");
        assert.equal(tagsB.has("signal-a-only"), false, "tenant B must not read tenant A's weakness signal");

        // completed_terms is stored per tenant, so the profile halves stay apart.
        assert.equal(stateA.completedTerms, 5);
        assert.equal(stateB.completedTerms, 1);
      });
    },
  );

  it(
    "gives each tenant an independent season assignment and progress-event trail",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withClient(async (client) => {
        const studentId = await seedStudentBoundToBothTenants(client);
        // Both tenants record enough completed terms for the season to unlock.
        await upsertProfile(client, SCOPE_A, studentId, {
          completedTerms: SEASON_UNLOCK_TERM,
          weakConceptTags: ["risk"],
        });
        await upsertProfile(client, SCOPE_B, studentId, {
          completedTerms: SEASON_UNLOCK_TERM,
          weakConceptTags: ["risk"],
        });
        await passAllCoreTerms(client, SCOPE_A, studentId);
        await passAllCoreTerms(client, SCOPE_B, studentId);

        const activatedA = await activateAcademyMasterySeason({
          client,
          scope: SCOPE_A,
          studentId,
          locale: "fa",
          seasonId: SEASON,
          idempotencyKey: `mastery-a-${randomUUID()}`,
        });
        assert.equal(activatedA.assignment.status, "active");
        assert.equal(activatedA.changed, true);

        const replayedA = await activateAcademyMasterySeason({
          client,
          scope: SCOPE_A,
          studentId,
          locale: "fa",
          seasonId: SEASON,
          idempotencyKey: `mastery-a-retry-${randomUUID()}`,
        });
        assert.equal(replayedA.changed, false, "an active season must be a no-op even with a new command key");
        assert.equal(replayedA.assignment.id, activatedA.assignment.id);

        // Tenant B sees none of tenant A's assignments before activating.
        const beforeB = await readAcademyMasterySeasonState(client, SCOPE_B, studentId, "fa");
        assert.deepEqual(beforeB.assignments, [], "tenant B must not read tenant A's assignments");

        const activatedB = await activateAcademyMasterySeason({
          client,
          scope: SCOPE_B,
          studentId,
          locale: "fa",
          seasonId: SEASON,
          idempotencyKey: `mastery-b-${randomUUID()}`,
        });

        // The open-assignment uniqueness boundary is tenant-scoped, so the same
        // student activating the same season in a second tenant creates a
        // second independent row rather than replaying tenant A's.
        assert.notEqual(
          activatedB.assignment.id,
          activatedA.assignment.id,
          "tenant B must own a distinct assignment row",
        );

        const rows = await client.query<{ tenant_id: string; workspace_id: string }>(
          `SELECT tenant_id, workspace_id
             FROM academy_mastery_season_assignments
            WHERE student_id = $1::uuid AND season_id = $2
            ORDER BY tenant_id`,
          [studentId, SEASON],
        );
        assert.equal(rows.rows.length, 2, "each tenant owns exactly one open assignment");
        assert.deepEqual(
          rows.rows.map((row) => [row.tenant_id, row.workspace_id]).sort(),
          [[TENANT_A, WORKSPACE_A], [TENANT_B, WORKSPACE_B]].sort(),
        );

        // Every progress event is written under the activating tenant and is
        // bound to that tenant's assignment.
        const events = await client.query<{ tenant_id: string; assignment_id: string }>(
          `SELECT tenant_id, assignment_id::text
             FROM academy_mastery_season_progress_events
            WHERE student_id = $1::uuid AND event_type = 'started'
            ORDER BY tenant_id`,
          [studentId],
        );
        assert.equal(events.rows.length, 2);
        const eventByTenant = new Map(events.rows.map((row) => [row.tenant_id, row.assignment_id]));
        assert.equal(eventByTenant.get(TENANT_A), activatedA.assignment.id);
        assert.equal(eventByTenant.get(TENANT_B), activatedB.assignment.id);

        // Tenant A's view is unchanged by tenant B's activation.
        const afterA = await readAcademyMasterySeasonState(client, SCOPE_A, studentId, "fa");
        assert.equal(afterA.assignments.length, 1);
        assert.equal(afterA.assignments[0]?.id, activatedA.assignment.id);
      });
    },
  );

  it(
    "hides generation drafts from another tenant and refuses cross-tenant review decisions",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withClient(async (client) => {
        await seedStudentBoundToBothTenants(client);
        const seasonId = `gen-season-${randomUUID().slice(0, 8)}`;

        const submitted = await submitAcademyMasteryGenerationDraft(client, {
          scope: SCOPE_A,
          locale: "fa",
          draft: validGeneratedMasteryDraft({ id: seasonId }),
        });
        cleanupDraftIds.add(submitted.draft.id);
        assert.ok(submitted.draft.id);

        const listedA = await listAcademyMasteryGenerationDrafts(client, { scope: SCOPE_A, status: "all" });
        assert.ok(
          listedA.some((draft) => draft.id === submitted.draft.id),
          "tenant A must list its own draft",
        );

        const listedB = await listAcademyMasteryGenerationDrafts(client, { scope: SCOPE_B, status: "all" });
        assert.equal(
          listedB.some((draft) => draft.id === submitted.draft.id),
          false,
          "tenant B must not list tenant A's draft",
        );

        // A tenant B reviewer holding tenant A's draft id cannot decide on it.
        await assert.rejects(
          decideAcademyMasteryGenerationDraft(client, {
            scope: SCOPE_B,
            draftId: submitted.draft.id,
            decision: "reject",
            reviewerId: "mentor-reviewer-b",
            decisionNotes: "cross-tenant decision attempt that must never be admitted",
          }),
          /draft_not_found/,
          "a tenant B scope must not reach tenant A's draft",
        );

        // No review row may exist for that draft after the refused attempt.
        const afterRefusal = await client.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total
             FROM academy_mastery_season_generation_reviews
            WHERE draft_id = $1::uuid`,
          [submitted.draft.id],
        );
        assert.equal(afterRefusal.rows[0]?.total, "0", "a refused cross-tenant decision must write no review");

        // The owning tenant can decide, and the review row carries its tenant.
        await decideAcademyMasteryGenerationDraft(client, {
          scope: SCOPE_A,
          draftId: submitted.draft.id,
          decision: "reject",
          reviewerId: "mentor-reviewer-a",
          decisionNotes: "owning tenant rejects the draft with a sufficiently long note",
        });

        // Tenant B submits and decides its OWN draft. Without this half the
        // suite would pass too easily if it only proved the first tenant's
        // happy path; tenant B must also write under its own scope.
        const seasonIdB = `gen-season-b-${randomUUID().slice(0, 8)}`;
        const submittedB = await submitAcademyMasteryGenerationDraft(client, {
          scope: SCOPE_B,
          locale: "fa",
          draft: validGeneratedMasteryDraft({ id: seasonIdB }),
        });
        cleanupDraftIds.add(submittedB.draft.id);

        const draftRowB = await client.query<{ tenant_id: string; workspace_id: string }>(
          `SELECT tenant_id, workspace_id
             FROM academy_mastery_season_generation_drafts
            WHERE id = $1::uuid`,
          [submittedB.draft.id],
        );
        assert.equal(draftRowB.rows[0]?.tenant_id, TENANT_B, "a tenant B draft must be written under tenant B");
        assert.equal(draftRowB.rows[0]?.workspace_id, WORKSPACE_B);

        // Tenant A cannot see or decide on tenant B's draft either — the
        // refusal is symmetric, not just a default-tenant privilege.
        const listedAAfterB = await listAcademyMasteryGenerationDrafts(client, { scope: SCOPE_A, status: "all" });
        assert.equal(
          listedAAfterB.some((draft) => draft.id === submittedB.draft.id),
          false,
          "tenant A must not list tenant B's draft",
        );
        await assert.rejects(
          decideAcademyMasteryGenerationDraft(client, {
            scope: SCOPE_A,
            draftId: submittedB.draft.id,
            decision: "reject",
            reviewerId: "mentor-reviewer-a",
            decisionNotes: "cross-tenant decision attempt from another tenant must be refused",
          }),
          /draft_not_found/,
          "the default tenant must not reach tenant B's draft",
        );

        await decideAcademyMasteryGenerationDraft(client, {
          scope: SCOPE_B,
          draftId: submittedB.draft.id,
          decision: "reject",
          reviewerId: "mentor-reviewer-b",
          decisionNotes: "owning tenant B rejects its own draft with a sufficiently long note",
        });

        const reviewsB = await client.query<{ tenant_id: string; workspace_id: string }>(
          `SELECT tenant_id, workspace_id
             FROM academy_mastery_season_generation_reviews
            WHERE draft_id = $1::uuid`,
          [submittedB.draft.id],
        );
        assert.equal(reviewsB.rows.length, 1);
        assert.equal(reviewsB.rows[0]?.tenant_id, TENANT_B, "a tenant B review must be written under tenant B");
        assert.equal(reviewsB.rows[0]?.workspace_id, WORKSPACE_B);

        const reviews = await client.query<{ tenant_id: string; workspace_id: string }>(
          `SELECT tenant_id, workspace_id
             FROM academy_mastery_season_generation_reviews
            WHERE draft_id = $1::uuid`,
          [submitted.draft.id],
        );
        assert.equal(reviews.rows.length, 1);
        assert.equal(reviews.rows[0]?.tenant_id, TENANT_A);
        assert.equal(reviews.rows[0]?.workspace_id, WORKSPACE_A);
      });
    },
  );

  it(
    "keeps season eligibility from inheriting another tenant's term progress",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withClient(async (client) => {
        const studentId = await seedStudentBoundToBothTenants(client);
        // Tenant B's own profile says the student has completed nothing, so the
        // season must not unlock from tenant B's data alone.
        await upsertProfile(client, SCOPE_B, studentId, { completedTerms: 0, weakConceptTags: ["risk"] });

        const isolated = await readAcademyMasterySeasonState(client, SCOPE_B, studentId, "fa");
        assert.equal(isolated.completedTerms, 0);
        assert.equal(
          isolated.recommendations.find((item) => item.season.id === SEASON)?.eligible,
          false,
          "with no term progress the season must stay locked for tenant B",
        );

        // Tenant A earns every term the season requires; tenant B earns none.
        await passAllCoreTerms(client, SCOPE_A, studentId);

        const afterTenantAProgress = await readAcademyMasterySeasonState(client, SCOPE_B, studentId, "fa");

        // Migration 0066 gave academy_term_progress a tenant boundary and
        // readCompletedTerms now filters on it, so tenant A's progress no
        // longer raises tenant B's completedTerms or unlocks its season.
        assert.equal(
          afterTenantAProgress.completedTerms,
          0,
          "tenant B must not inherit tenant A's term progress",
        );
        assert.equal(
          afterTenantAProgress.recommendations.find((item) => item.season.id === SEASON)?.eligible,
          false,
          "tenant B must not unlock a season it did not earn",
        );

        // A lone pass for term 7 is not proof that terms 1–6 passed.
        await client.query(
          `INSERT INTO academy_term_progress
             (tenant_id, workspace_id, student_id, term_number, status, locale, score, percent)
           VALUES ($1, $2, $3::uuid, 7, 'passed', 'fa', 100, 100)
           ON CONFLICT (tenant_id, workspace_id, student_id, term_number, locale) DO NOTHING`,
          [TENANT_B, WORKSPACE_B, studentId],
        );
        const termSevenOnly = await readAcademyMasterySeasonState(client, SCOPE_B, studentId, "fa");
        assert.equal(termSevenOnly.completedTerms, 1, "term 7 alone must count as one passed core term");

        await assert.rejects(
          activateAcademyMasterySeason({
            client,
            scope: SCOPE_B,
            studentId,
            locale: "fa",
            seasonId: SEASON,
            idempotencyKey: `mastery-b-blocked-${randomUUID()}`,
          }),
          /mastery_core_terms_incomplete/,
          "the write authority must enforce 7/7 independently of the page guard",
        );

        assert.deepEqual(afterTenantAProgress.assignments, []);
      });
    },
  );
});
