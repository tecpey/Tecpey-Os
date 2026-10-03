import { createHash } from "node:crypto";
import Decimal from "decimal.js";

export const ARENA_LEAGUE_SEASON_POLICY_VERSION = "arena-league-season-v1" as const;
export const ARENA_LEAGUE_DEFAULT_INITIAL_BALANCE = "100000" as const;
export const ARENA_LEAGUE_DEFAULT_ATTEMPTS_PER_CYCLE = 3 as const;
export const ARENA_LEAGUE_RANKING_VISIBILITY = "opt-in" as const;

export type ArenaLeagueSeasonLifecycle =
  | "draft"
  | "enrollment"
  | "active"
  | "closing"
  | "finalized";

export type ArenaLeagueSeasonConfigInput = {
  seasonKey: string;
  timeZone: string;
  enrollmentOpensAt: string;
  enrollmentClosesAt: string;
  startsAt: string;
  endsAt: string;
  scoringPolicyVersion: string;
  initialBalance: string;
  attemptsPerCycle: number;
};

export type ArenaLeagueSeasonConfig = Readonly<{
  policyVersion: typeof ARENA_LEAGUE_SEASON_POLICY_VERSION;
  seasonKey: string;
  timeZone: string;
  enrollmentOpensAt: string;
  enrollmentClosesAt: string;
  startsAt: string;
  endsAt: string;
  scoringPolicyVersion: string;
  initialBalance: string;
  attemptsPerCycle: number;
  rankingVisibility: typeof ARENA_LEAGUE_RANKING_VISIBILITY;
}>;

const SAFE_KEY = /^[a-z0-9][a-z0-9._:-]{2,79}$/;
const SAFE_POLICY_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/;
const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;
const MAX_INITIAL_BALANCE = new Decimal("1000000000");
const MIN_SEASON_DURATION_MS = 60 * 60 * 1000;
const MAX_SEASON_DURATION_MS = 366 * 24 * 60 * 60 * 1000;

const NEXT_LIFECYCLE: Readonly<Record<ArenaLeagueSeasonLifecycle, ArenaLeagueSeasonLifecycle | null>> = {
  draft: "enrollment",
  enrollment: "active",
  active: "closing",
  closing: "finalized",
  finalized: null,
};

function exactIso(value: string, field: string): string {
  if (typeof value !== "string") throw new Error(`arena_season_${field}_invalid`);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`arena_season_${field}_invalid`);
  const normalized = new Date(timestamp).toISOString();
  if (value !== normalized) throw new Error(`arena_season_${field}_not_canonical_utc`);
  return normalized;
}

function canonicalTimeZone(value: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 80) {
    throw new Error("arena_season_timezone_invalid");
  }
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    throw new Error("arena_season_timezone_invalid");
  }
}

function normalizedBalance(value: string): string {
  if (!MONEY_PATTERN.test(value)) throw new Error("arena_season_initial_balance_invalid");
  const balance = new Decimal(value);
  if (!balance.isFinite() || balance.lte(0) || balance.gt(MAX_INITIAL_BALANCE)) {
    throw new Error("arena_season_initial_balance_invalid");
  }
  return balance.toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed();
}

function exactAttempts(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10) {
    throw new Error("arena_season_attempts_per_cycle_invalid");
  }
  return value;
}

export function normalizeArenaLeagueSeasonConfig(
  input: ArenaLeagueSeasonConfigInput,
): ArenaLeagueSeasonConfig {
  if (!SAFE_KEY.test(input.seasonKey)) throw new Error("arena_season_key_invalid");
  if (!SAFE_POLICY_VERSION.test(input.scoringPolicyVersion)) {
    throw new Error("arena_season_scoring_policy_version_invalid");
  }

  const enrollmentOpensAt = exactIso(input.enrollmentOpensAt, "enrollment_opens_at");
  const enrollmentClosesAt = exactIso(input.enrollmentClosesAt, "enrollment_closes_at");
  const startsAt = exactIso(input.startsAt, "starts_at");
  const endsAt = exactIso(input.endsAt, "ends_at");

  const enrollmentOpenMs = Date.parse(enrollmentOpensAt);
  const enrollmentCloseMs = Date.parse(enrollmentClosesAt);
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);

  if (!(enrollmentOpenMs < enrollmentCloseMs && enrollmentCloseMs <= startMs && startMs < endMs)) {
    throw new Error("arena_season_timeline_invalid");
  }
  const durationMs = endMs - startMs;
  if (durationMs < MIN_SEASON_DURATION_MS || durationMs > MAX_SEASON_DURATION_MS) {
    throw new Error("arena_season_duration_invalid");
  }

  return Object.freeze({
    policyVersion: ARENA_LEAGUE_SEASON_POLICY_VERSION,
    seasonKey: input.seasonKey,
    timeZone: canonicalTimeZone(input.timeZone),
    enrollmentOpensAt,
    enrollmentClosesAt,
    startsAt,
    endsAt,
    scoringPolicyVersion: input.scoringPolicyVersion,
    initialBalance: normalizedBalance(input.initialBalance),
    attemptsPerCycle: exactAttempts(input.attemptsPerCycle),
    rankingVisibility: ARENA_LEAGUE_RANKING_VISIBILITY,
  });
}

export function digestArenaLeagueSeasonConfig(input: ArenaLeagueSeasonConfigInput): string {
  const config = normalizeArenaLeagueSeasonConfig(input);
  return createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

export function assertArenaLeagueSeasonTransition(
  from: ArenaLeagueSeasonLifecycle,
  to: ArenaLeagueSeasonLifecycle,
): void {
  if (NEXT_LIFECYCLE[from] !== to) {
    throw new Error(`arena_season_transition_invalid:${from}:${to}`);
  }
}

export function canOpenArenaLeagueEnrollment(input: {
  lifecycle: ArenaLeagueSeasonLifecycle;
  config: ArenaLeagueSeasonConfig;
  at: string;
}): boolean {
  const at = exactIso(input.at, "enrollment_open_check_at");
  return input.lifecycle === "draft" && at >= input.config.enrollmentOpensAt && at < input.config.enrollmentClosesAt;
}

export function canEnrollInArenaLeagueSeason(input: {
  lifecycle: ArenaLeagueSeasonLifecycle;
  config: ArenaLeagueSeasonConfig;
  at: string;
}): boolean {
  const at = exactIso(input.at, "enrollment_check_at");
  if (input.lifecycle !== "enrollment") return false;
  return at >= input.config.enrollmentOpensAt && at < input.config.enrollmentClosesAt;
}

export function canActivateArenaLeagueSeason(input: {
  lifecycle: ArenaLeagueSeasonLifecycle;
  config: ArenaLeagueSeasonConfig;
  at: string;
}): boolean {
  const at = exactIso(input.at, "activation_check_at");
  return input.lifecycle === "enrollment" && at >= input.config.startsAt && at < input.config.endsAt;
}

export function canCloseArenaLeagueSeason(input: {
  lifecycle: ArenaLeagueSeasonLifecycle;
  config: ArenaLeagueSeasonConfig;
  at: string;
}): boolean {
  const at = exactIso(input.at, "close_check_at");
  return input.lifecycle === "active" && at >= input.config.endsAt;
}

export function canFinalizeArenaLeagueSeason(input: {
  lifecycle: ArenaLeagueSeasonLifecycle;
  config: ArenaLeagueSeasonConfig;
  at: string;
}): boolean {
  const at = exactIso(input.at, "finalize_check_at");
  return input.lifecycle === "closing" && at >= input.config.endsAt;
}
