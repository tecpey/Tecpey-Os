import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARENA_LEAGUE_DEFAULT_ATTEMPTS_PER_CYCLE,
  ARENA_LEAGUE_DEFAULT_INITIAL_BALANCE,
  assertArenaLeagueSeasonTransition,
  canActivateArenaLeagueSeason,
  canCloseArenaLeagueSeason,
  canEnrollInArenaLeagueSeason,
  canFinalizeArenaLeagueSeason,
  canOpenArenaLeagueEnrollment,
  digestArenaLeagueSeasonConfig,
  normalizeArenaLeagueSeasonConfig,
} from "../../lib/arena-league-season-policy";

const baseline = {
  seasonKey: "league:2026-10",
  timeZone: "UTC",
  enrollmentOpensAt: "2026-09-28T00:00:00.000Z",
  enrollmentClosesAt: "2026-10-01T00:00:00.000Z",
  startsAt: "2026-10-01T00:00:00.000Z",
  endsAt: "2026-11-01T00:00:00.000Z",
  scoringPolicyVersion: "arena-league-scoring-v1",
  initialBalance: ARENA_LEAGUE_DEFAULT_INITIAL_BALANCE,
  attemptsPerCycle: ARENA_LEAGUE_DEFAULT_ATTEMPTS_PER_CYCLE,
};

describe("Arena league season policy", () => {
  it("normalizes a versioned $100k / three-attempt competition contract", () => {
    const season = normalizeArenaLeagueSeasonConfig(baseline);
    assert.equal(season.policyVersion, "arena-league-season-v1");
    assert.equal(season.initialBalance, "100000");
    assert.equal(season.attemptsPerCycle, 3);
    assert.equal(season.rankingVisibility, "opt-in");
    assert.equal(season.timeZone, "UTC");
  });

  it("produces a deterministic configuration digest", () => {
    const first = digestArenaLeagueSeasonConfig(baseline);
    const second = digestArenaLeagueSeasonConfig({ ...baseline });
    assert.match(first, /^[0-9a-f]{64}$/);
    assert.equal(first, second);
    assert.notEqual(first, digestArenaLeagueSeasonConfig({ ...baseline, attemptsPerCycle: 2 }));
  });

  it("requires canonical UTC instants and a fair pre-start enrollment cutoff", () => {
    assert.throws(
      () => normalizeArenaLeagueSeasonConfig({ ...baseline, startsAt: "2026-10-01T03:30:00+03:30" }),
      /starts_at_not_canonical_utc/,
    );
    assert.throws(
      () => normalizeArenaLeagueSeasonConfig({
        ...baseline,
        enrollmentClosesAt: "2026-10-02T00:00:00.000Z",
      }),
      /timeline_invalid/,
    );
  });

  it("fails closed on invalid timezone, scoring identity, balance and attempt limits", () => {
    assert.throws(() => normalizeArenaLeagueSeasonConfig({ ...baseline, timeZone: "Mars/Olympus" }), /timezone_invalid/);
    assert.throws(() => normalizeArenaLeagueSeasonConfig({ ...baseline, scoringPolicyVersion: "v1" }), /scoring_policy_version_invalid/);
    assert.throws(() => normalizeArenaLeagueSeasonConfig({ ...baseline, initialBalance: "0" }), /initial_balance_invalid/);
    assert.throws(() => normalizeArenaLeagueSeasonConfig({ ...baseline, attemptsPerCycle: 0 }), /attempts_per_cycle_invalid/);
  });

  it("allows lifecycle transitions only in one direction", () => {
    assert.doesNotThrow(() => assertArenaLeagueSeasonTransition("draft", "enrollment"));
    assert.doesNotThrow(() => assertArenaLeagueSeasonTransition("enrollment", "active"));
    assert.doesNotThrow(() => assertArenaLeagueSeasonTransition("active", "closing"));
    assert.doesNotThrow(() => assertArenaLeagueSeasonTransition("closing", "finalized"));
    assert.throws(() => assertArenaLeagueSeasonTransition("active", "enrollment"), /transition_invalid/);
    assert.throws(() => assertArenaLeagueSeasonTransition("finalized", "draft"), /transition_invalid/);
  });

  it("opens and accepts enrollment only inside the configured half-open window", () => {
    const config = normalizeArenaLeagueSeasonConfig(baseline);
    assert.equal(canOpenArenaLeagueEnrollment({ lifecycle: "draft", config, at: "2026-09-27T23:59:59.999Z" }), false);
    assert.equal(canOpenArenaLeagueEnrollment({ lifecycle: "draft", config, at: baseline.enrollmentOpensAt }), true);
    assert.equal(canOpenArenaLeagueEnrollment({ lifecycle: "draft", config, at: baseline.enrollmentClosesAt }), false);
    assert.equal(canEnrollInArenaLeagueSeason({ lifecycle: "enrollment", config, at: baseline.enrollmentOpensAt }), true);
    assert.equal(canEnrollInArenaLeagueSeason({ lifecycle: "enrollment", config, at: "2026-09-30T23:59:59.999Z" }), true);
    assert.equal(canEnrollInArenaLeagueSeason({ lifecycle: "enrollment", config, at: baseline.enrollmentClosesAt }), false);
    assert.equal(canEnrollInArenaLeagueSeason({ lifecycle: "draft", config, at: baseline.enrollmentOpensAt }), false);
  });

  it("does not activate, close or finalize before the configured authority boundary", () => {
    const config = normalizeArenaLeagueSeasonConfig(baseline);
    assert.equal(canActivateArenaLeagueSeason({ lifecycle: "enrollment", config, at: "2026-09-30T23:59:59.999Z" }), false);
    assert.equal(canActivateArenaLeagueSeason({ lifecycle: "enrollment", config, at: baseline.startsAt }), true);
    assert.equal(canCloseArenaLeagueSeason({ lifecycle: "active", config, at: "2026-10-31T23:59:59.999Z" }), false);
    assert.equal(canCloseArenaLeagueSeason({ lifecycle: "active", config, at: baseline.endsAt }), true);
    assert.equal(canFinalizeArenaLeagueSeason({ lifecycle: "active", config, at: baseline.endsAt }), false);
    assert.equal(canFinalizeArenaLeagueSeason({ lifecycle: "closing", config, at: baseline.endsAt }), true);
  });
});
