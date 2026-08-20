import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MENTOR_PROFILE_REPAIR_GRACE_MS,
  needsMentorProfileRefresh,
} from "../lib/mentor-profile-reconciliation";

// scheduleMentorProfileUpdate dispatches profile recomputation as an in-process
// microtask, so a crash, deployment or restart between the learning event landing
// and the recompute finishing loses the update silently: the student keeps
// learning, their mentor profile does not, and personalisation degrades with
// nothing failing. These tests lock the repair decision that closes that window.
//
// The decision is only safe because applyMentorProfileUpdate recomputes the whole
// profile from current signals rather than applying a delta, so repeating it is
// harmless. The rules below encode the three ways that could go wrong: repairing
// a student with nothing to derive from, racing the healthy in-process path, and
// failing to notice a genuinely lost update.

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;

function decide(overrides: Partial<Parameters<typeof needsMentorProfileRefresh>[0]> = {}) {
  return needsMentorProfileRefresh({
    profileUpdatedAtMs: NOW - 2 * HOUR,
    latestSignalAtMs: NOW - HOUR,
    nowMs: NOW,
    ...overrides,
  });
}

test("repairs a profile whose signals are newer than the stored profile", () => {
  assert.equal(decide(), true);
});

test("leaves a profile alone when it already reflects the latest signal", () => {
  assert.equal(decide({ profileUpdatedAtMs: NOW - HOUR / 2 }), false);
  // Exactly equal timestamps mean the recompute already covered that signal.
  assert.equal(decide({ profileUpdatedAtMs: NOW - HOUR, latestSignalAtMs: NOW - HOUR }), false);
});

test("repairs a student who has signals but no profile at all", () => {
  // The in-process update was lost before it ever wrote a row, or the student
  // predates the mentor engine. Either way the profile must be built.
  assert.equal(decide({ profileUpdatedAtMs: null }), true);
});

test("never fabricates a profile for a student with no signals", () => {
  // Writing a default profile here would mark it fresh, which would then suppress
  // the real recompute when the student's first signal actually arrives.
  assert.equal(decide({ latestSignalAtMs: null, profileUpdatedAtMs: null }), false);
  assert.equal(decide({ latestSignalAtMs: null }), false);
});

test("does not race the in-process update it exists to back up", () => {
  // A signal inside the grace window is presumed still in flight. Repairing it
  // would double the recompute cost of every healthy request.
  const justNow = NOW - 1_000;
  assert.equal(decide({ latestSignalAtMs: justNow, profileUpdatedAtMs: NOW - HOUR }), false);
  assert.equal(decide({ latestSignalAtMs: justNow, profileUpdatedAtMs: null }), false);
});

test("the grace window has an exact boundary", () => {
  const edge = NOW - MENTOR_PROFILE_REPAIR_GRACE_MS;
  // Strictly inside the window: still in flight.
  assert.equal(decide({ latestSignalAtMs: edge + 1, profileUpdatedAtMs: null }), false);
  // Settled: the in-process update had its chance and did not land.
  assert.equal(decide({ latestSignalAtMs: edge, profileUpdatedAtMs: null }), true);
});

test("the grace window is configurable without changing the rule", () => {
  const recent = NOW - 5_000;
  assert.equal(decide({ latestSignalAtMs: recent, profileUpdatedAtMs: null }), false);
  assert.equal(
    decide({ latestSignalAtMs: recent, profileUpdatedAtMs: null, graceMs: 1_000 }),
    true,
  );
});

test("the staleness scan covers exactly the sources the recompute reads", () => {
  // The original version of this sweep scanned learning_events, which
  // applyMentorProfileUpdate does not read at all. It therefore missed every
  // real signal store — a student whose activity was a mentor conversation was
  // never selected — while flagging staleness that no recompute could settle.
  // Any drift between the two must fail here rather than silently un-repair
  // whole categories of lost update.
  const collectors = readFileSync("src/lib/mentor-signals.ts", "utf8");
  const sweep = readFileSync("src/lib/mentor-profile-reconciliation.ts", "utf8");

  const bodies = collectors
    .split(/function collect\w*Signals/)
    .slice(1)
    .join("\n");
  // Compare parsed FROM clauses on both sides, never raw substrings: a table
  // named only in a prose comment would otherwise satisfy the check and let the
  // very drift this test exists to catch pass unnoticed.
  const fromTables = (source: string): Set<string> => {
    const withoutComments = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    return new Set([...withoutComments.matchAll(/FROM\s+([a-z_]+)/g)].map((m) => m[1]));
  };

  const readTables = fromTables(bodies);
  assert.ok(readTables.size > 0, "expected to find the collector source tables");

  const scanned = fromTables(sweep);
  scanned.delete("signals"); // the CTE the union feeds, not a signal store

  assert.deepEqual(
    [...scanned].sort(),
    [...readTables].sort(),
    "the staleness scan and applyMentorProfileUpdate must read exactly the same signal stores: " +
      "a store the recompute reads but the scan misses leaves those lost updates unrepaired, " +
      "and a store the scan reads but the recompute ignores marks profiles stale that no repair can settle",
  );
});

test("the repair is reachable as an operable job", () => {
  // A repair nobody can run is not a repair. Match the reconciliation idiom the
  // codebase already uses for session revocations, risk and offline sync.
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(pkg.scripts["mentor:profiles:repair"], "tsx scripts/reconcile-mentor-profiles.ts");

  const script = readFileSync("scripts/reconcile-mentor-profiles.ts", "utf8");
  assert.match(script, /reconcileMentorProfiles/);
  // A sweep that swallows failures would report success while leaving profiles
  // stale, which is the very failure mode this repair exists to remove.
  assert.match(script, /result\.failed > 0/);
  assert.match(script, /process\.exit\(1\)/);
});
