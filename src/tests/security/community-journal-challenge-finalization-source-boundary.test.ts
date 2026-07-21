import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const authorityPath = "src/lib/community-journal-challenge-authority.ts";
const finalizerPath = "src/lib/community-journal-challenge-finalization.ts";
const migrationPath = "src/lib/db-migrate-community-journal-challenge-finalization.ts";
const routePath = "src/app/api/community/challenge-history/route.ts";
const clientPath = "src/lib/community-journal-challenge-history-client.ts";
const componentPath = "src/components/academy/community/FinalizedChallengeHistoryCard.tsx";
const runnerPath = "scripts/finalize-community-journal-challenges.ts";

describe("Post-cycle journal challenge finalization boundary", () => {
  it("reuses the canonical evidence authority", async () => {
    const [authority, finalizer] = await Promise.all([
      readFile(authorityPath, "utf8"),
      readFile(finalizerPath, "utf8"),
    ]);
    assert.match(authority, /export async function calculateOfficialJournalChallengeEvidence/);
    assert.match(authority, /validateArenaExecutionStateV2/);
    assert.match(authority, /mapArenaReflectionRow/);
    assert.match(finalizer, /calculateOfficialJournalChallengeEvidence/);
    assert.match(finalizer, /validateOfficialJournalChallengeEnrollmentRow/);
    for (const forbidden of [
      "validateArenaExecutionStateV2",
      "mapArenaReflectionRow",
      "academy_trading_arena_reflections",
      "execution_state",
      "localStorage",
      "sessionStorage",
      "Date.now()",
    ]) {
      assert.equal(finalizer.includes(forbidden), false, forbidden);
    }
  });

  it("uses bounded concurrency-safe worker semantics", async () => {
    const source = await readFile(finalizerPath, "utf8");
    for (const required of [
      "FOR UPDATE OF enrollment SKIP LOCKED",
      "SAVEPOINT community_challenge_finalize_row",
      "ROLLBACK TO SAVEPOINT community_challenge_finalize_row",
      "cycle_ends_at <= $3::timestamptz",
      "finalization_source = 'worker'",
      "finalization_run_id = $4::uuid",
      "finalized_completed",
      "finalized_not_completed",
      "rewardsEnabled: false",
      "enrollmentFingerprint",
    ]) {
      assert.equal(source.includes(required), true, required);
    }
    for (const forbidden of ["console.log(row", "studentId:", "principalId:"]) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
  });

  it("makes terminal results immutable in PostgreSQL", async () => {
    const source = await readFile(migrationPath, "utf8");
    for (const required of [
      'FILENAME = "0049_community_journal_challenge_finalization.sql"',
      "status IN ('active', 'completed', 'not_completed')",
      "finalized_at TIMESTAMPTZ",
      "finalization_source TEXT",
      "finalization_run_id UUID",
      "finalized community challenge enrollment is immutable",
      "valid_reflection_count * 5 < eligible_closed_trade_count * 4",
      "academy_community_challenge_one_finalization_event_idx",
      "academy_community_challenge_due_finalization_idx",
    ]) {
      assert.equal(source.includes(required), true, required);
    }
  });

  it("keeps history private, tenant-bound and no-store", async () => {
    const source = await readFile(routePath, "utf8");
    for (const required of [
      'getCanonicalSession(req, { strictRevocation: true })',
      'scopes: ["community:challenge:read"]',
      "resolveTenantPrincipalContext",
      "loadLatestFinalizedOfficialJournalChallenge",
      'namespace: "community-journal-challenge-history-read"',
      'response.headers.set("Cache-Control", "private, no-store")',
      'response.headers.set("Vary", "Cookie")',
    ]) {
      assert.equal(source.includes(required), true, required);
    }
    for (const forbidden of ["PLATFORM.DEFAULT_TENANT_ID", "studentId: body", "tenantId: body"]) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
  });

  it("keeps browser history read-only and fail closed", async () => {
    const [client, component] = await Promise.all([
      readFile(clientPath, "utf8"),
      readFile(componentPath, "utf8"),
    ]);
    for (const source of [client, component]) {
      for (const forbidden of ["localStorage", "sessionStorage", "Math.random", "Date.now()"] ) {
        assert.equal(source.includes(forbidden), false, forbidden);
      }
    }
    assert.match(client, /rewards\.xp !== 0/);
    assert.match(client, /raw\.status === "not_completed" && expectedEligible/);
    assert.match(component, /\/api\/community\/challenge-history/);
    assert.match(component, /هیچ نتیجه محلی یا نمایشی جایگزین نمی‌شود/);
    assert.match(component, /XP = ۰، Badge = ندارد و پاداش مالی = ندارد/);
  });

  it("provides a scheduler-ready fail-closed runner", async () => {
    const source = await readFile(runnerPath, "utf8");
    assert.match(source, /finalizeEndedOfficialJournalChallenges/);
    assert.match(source, /process\.exit\(1\)/);
    assert.match(source, /process\.exitCode = 2/);
  });
});
