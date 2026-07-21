import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const cataloguePath = "src/lib/community-challenges.ts";
const authorityPath = "src/lib/community-journal-challenge-authority.ts";
const routePath = "src/app/api/community/profile/route.ts";
const clientPath = "src/lib/community-challenge-client.ts";
const componentPath = "src/components/academy/community/ChallengeCenter.tsx";

describe("Community journal challenge source boundary", () => {
  it("keeps the catalogue pure and browser-persistence-free", async () => {
    const source = await readFile(cataloguePath, "utf8");
    for (const forbidden of [
      "localStorage",
      "sessionStorage",
      "loadParticipation",
      "saveParticipation",
      "joinChallenge",
      "markChallengeComplete",
      "Date.now()",
    ]) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
    assert.match(source, /getChallengeCycle\(now = new Date\(\)\)/);
    assert.match(source, /minRate: 0\.8, minTrades: 3/);
  });

  it("derives eligibility only from server execution events, reflections and consent", async () => {
    const source = await readFile(authorityPath, "utf8");
    for (const required of [
      'import "server-only"',
      "AvailableTenantPrincipalContext",
      'context.scopes.includes(scope)',
      "academy_trading_arena_execution_events",
      "arena.position_closed",
      "closedTradeIds",
      "autoClosedTradeIds",
      "academy_trading_arena_reflections",
      "profile.challenge_participation",
      "JOURNAL_REFLECTION_MIN_TRADES = 3",
      "JOURNAL_REFLECTION_MIN_RATE = 0.8",
      "awardAcademyReward",
      "academy_student_events",
      "writeSensitiveMutationAuditTx",
      'action: "community.challenge.reward.claim"',
      'resourceType: "community_challenge"',
      "refreshAcademyProgressProjection",
      "readLearningCommand",
      "storeLearningCommand",
      "pg_advisory_xact_lock",
    ]) {
      assert.equal(source.includes(required), true, required);
    }
    for (const forbidden of [
      "localStorage",
      "sessionStorage",
      "clientScore",
      "body.score",
      "body.xp",
      "body.badge",
      "body.closedTradeCount",
      "body.reflectedTradeCount",
    ]) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
  });

  it("uses the governed Community route with exact claim parsing", async () => {
    const source = await readFile(routePath, "utf8");
    for (const required of [
      'view !== "challenge-center"',
      'view !== "journal-challenge"',
      'scopes: ["community:challenge:read"]',
      'scopes: ["community:challenge:write"]',
      'namespace: "community-journal-challenge-claim"',
      "verifyCsrfOrigin(req)",
      "getCanonicalSession(req, { strictRevocation: true })",
      "readBoundedJsonRequest",
      "CHALLENGE_CLAIM_FIELDS",
      "Object.keys(body).length !== CHALLENGE_CLAIM_FIELDS.size",
      'req.headers.get("idempotency-key")',
      "claimJournalChallenge",
      'apiError("idempotency_conflict", 409)',
      'apiError("community_challenge_unavailable", 503)',
    ]) {
      assert.equal(source.includes(required), true, required);
    }
    for (const forbidden of [
      "body.score",
      "body.xp",
      "body.badge",
      "body.closedTradeCount",
      "body.reflectedTradeCount",
      "body.completed",
      "body.rewardedAt",
    ]) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
  });

  it("keeps the active UI on server consent/status/claim contracts", async () => {
    const [client, component] = await Promise.all([
      readFile(clientPath, "utf8"),
      readFile(componentPath, "utf8"),
    ]);
    for (const required of [
      "parseJournalChallengeStatusPayload",
      "parseJournalChallengeClaimPayload",
      "cryptoApi.randomUUID",
      "cryptoApi.getRandomValues",
    ]) {
      assert.equal(client.includes(required), true, required);
    }
    for (const required of [
      'fetch("/api/community/profile?view=challenge-center"',
      'fetch("/api/community/profile?view=journal-challenge"',
      'fetch("/api/community/profile", {',
      '"Idempotency-Key": createCommunityChallengeIdempotencyKey()',
      "expectedRevision: profile.revision",
      "فقط چالش بازتاب ژورنال دارای Authority رسمی است",
      "پیش‌نمایش کاتالوگ",
      "هیچ Count، Completion یا Reward مرورگری جایگزین نمی‌شود",
    ]) {
      assert.equal(component.includes(required), true, required);
    }
    for (const forbidden of [
      "localStorage",
      "sessionStorage",
      "loadParticipation",
      "joinChallenge",
      "markChallengeComplete",
      "loadArenaState",
      "computeArenaStats",
      "getJournalCompletionRate",
    ]) {
      assert.equal(component.includes(forbidden), false, forbidden);
    }
  });
});
