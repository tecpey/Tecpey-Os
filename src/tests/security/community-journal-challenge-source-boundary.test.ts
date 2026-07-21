import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const cataloguePath = "src/lib/community-challenges.ts";
const authorityPath = "src/lib/community-journal-challenge-authority.ts";
const migrationPath = "src/lib/db-migrate-community-journal-challenge.ts";
const routePath = "src/app/api/community/profile/route.ts";
const clientPath = "src/lib/community-journal-challenge-client.ts";
const uiPath = "src/components/academy/community/ChallengeCenter.tsx";

describe("Official journal challenge source boundary", () => {
  it("keeps the catalogue presentation-only", async () => {
    const source = await readFile(cataloguePath, "utf8");
    for (const forbidden of [
      "localStorage",
      "sessionStorage",
      "Date.now()",
      "getCurrentWeekNumber",
      "loadParticipation",
      "saveParticipation",
      "joinChallenge",
      "markChallengeComplete",
      "CHALLENGE_PARTICIPATION_KEY",
    ]) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
    assert.match(source, /presentation-only definitions/);
    assert.match(source, /OFFICIAL_PILOT_CHALLENGE_ID = "journal-reflection-week"/);
    assert.match(source, /امتیاز عددی صادر نمی‌شود/);
    assert.match(source, /PREVIEW_ONLY_CHALLENGES/);
  });

  it("derives official completion only from canonical server evidence", async () => {
    const source = await readFile(authorityPath, "utf8");
    for (const required of [
      'import "server-only"',
      "AvailableTenantPrincipalContext",
      'community:challenge:read',
      'community:challenge:write',
      "SELECT NOW() AS now",
      "academy_trading_arena_attempts",
      "validateArenaExecutionStateV2",
      "academy_trading_arena_reflections",
      "mapArenaReflectionRow",
      "reflectionMatchesTrade",
      "eligibleClosedTrades >= OFFICIAL_JOURNAL_CHALLENGE_MIN_TRADES",
      "validReflections * 5 >= eligibleClosedTrades * 4",
      "api_command_receipts",
      "academy_community_challenge_events",
      "retrospectiveEvidenceAccepted: false",
      "rewardsEnabled: false",
      "validateEnrollmentRow",
      "lockIdentity = JSON.stringify",
    ]) {
      assert.equal(source.includes(required), true, required);
    }
    for (const forbidden of [
      "localStorage",
      "sessionStorage",
      "Math.random",
      "clientScore",
      "clientCompletedAt",
      "clientStartedAt",
      "xpBonus:",
      "badgeId:",
      "\\0${cycle.key}",
    ]) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
  });

  it("enforces durable enrollment and append-only evidence in PostgreSQL", async () => {
    const source = await readFile(migrationPath, "utf8");
    for (const required of [
      'FILENAME = "0048_community_journal_reflection_challenge.sql"',
      "academy_community_challenge_enrollments",
      "principal_id TEXT GENERATED ALWAYS AS (student_id::text) STORED",
      "academy_community_challenge_principal_binding_fk",
      "academy_community_challenge_identity_unique",
      "valid_reflection_count * 5 >= eligible_closed_trade_count * 4",
      "completed community challenge enrollment is immutable",
      "academy_community_challenge_events",
      "community challenge events are append-only",
    ]) {
      assert.equal(source.includes(required), true, required);
    }
  });

  it("keeps reads and commands on the governed Community route", async () => {
    const source = await readFile(routePath, "utf8");
    for (const required of [
      'view !== "journal-reflection-challenge"',
      'getCanonicalSession(req, { strictRevocation: true })',
      'scopes: ["community:challenge:read"]',
      'scopes: ["community:challenge:write"]',
      "loadOfficialJournalChallengeState",
      "processOfficialJournalChallengeCommand",
      "verifyCsrfOrigin(req)",
      "readBoundedJsonRequest(req, { maxBytes: 2_048 })",
      'req.headers.get("idempotency-key")',
      'apiError("community_challenge_unavailable", 503)',
      'response.headers.set("Cache-Control", "private, no-store")',
      'response.headers.set("Vary", "Cookie")',
    ]) {
      assert.equal(source.includes(required), true, required);
    }
    const getStart = source.indexOf('if (view === "journal-reflection-challenge")');
    const getEnd = source.indexOf('if (searchParams.has("cursor")', getStart);
    const patchStart = source.indexOf('if (view === "journal-reflection-challenge")', getEnd);
    const patchEnd = source.indexOf('const limited = await rateLimit(req, {\n        namespace: "community-profile-write"', patchStart);
    for (const index of [getStart, getEnd, patchStart, patchEnd]) assert.notEqual(index, -1);
    const challengeBranches = `${source.slice(getStart, getEnd)}\n${source.slice(patchStart, patchEnd)}`;
    for (const forbidden of [
      "PLATFORM.DEFAULT_TENANT_ID",
      "score",
      "completedAt",
      "startedAt",
      "eligibleClosedTrades",
      "validReflections",
    ]) {
      assert.equal(challengeBranches.includes(forbidden), false, forbidden);
    }
  });

  it("keeps the active UI and client contract free of browser authority", async () => {
    const [client, ui] = await Promise.all([
      readFile(clientPath, "utf8"),
      readFile(uiPath, "utf8"),
    ]);
    for (const source of [client, ui]) {
      for (const forbidden of [
        "localStorage",
        "sessionStorage",
        "loadParticipation",
        "joinChallenge(",
        "markChallengeComplete",
        "getCurrentWeekNumber",
      ]) {
        assert.equal(source.includes(forbidden), false, forbidden);
      }
    }
    assert.match(client, /rewards\.xp !== 0/);
    assert.match(client, /validReflections \* 5 >= eligibleClosedTrades \* 4/);
    assert.match(ui, /view=journal-reflection-challenge/);
    assert.match(ui, /XP = ۰، Badge = ندارد و پاداش مالی = ندارد/);
  });
});
