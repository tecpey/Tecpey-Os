import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inactiveDaysFrom } from "../lib/phase5-achievement-engine";

const DAY = 86_400_000;
const now = Date.UTC(2026, 7, 19, 12, 0, 0);

test("inactiveDaysFrom measures whole days since the last genuine activity", () => {
  assert.equal(inactiveDaysFrom(now - 5 * DAY, now), 5);
  assert.equal(inactiveDaysFrom(now - 12 * DAY, now), 12);
  // Same day (or a future-skewed timestamp) is zero, never negative.
  assert.equal(inactiveDaysFrom(now - 1000, now), 0);
  assert.equal(inactiveDaysFrom(now + DAY, now), 0);
});

test("inactiveDaysFrom treats a student with no activity as long-inactive", () => {
  assert.equal(inactiveDaysFrom(0, now), 9);
});

// Load-bearing guard for the actual defect: createBrainNotification records a
// notification_opened event with payload.generated = 'true' every time the
// engine SENDS a re-engagement nudge. If buildNotificationBrain counted that as
// activity, the last-activity timestamp would reset to 0 the moment the engine
// notified an inactive student, deflating churnRisk in a self-referential loop.
// The inactivity clock must exclude the engine's own generated events.
test("the re-engagement inactivity clock excludes the engine's own generated events", () => {
  const source = readFileSync("src/lib/phase5-achievement-engine.ts", "utf8");

  // The engine still stamps its generated nudges so they are auditable...
  assert.match(source, /eventType: "notification_opened", payload: \{ generated: true/);

  // ...but the inactivity timestamp must filter those generated events out.
  assert.match(
    source,
    /MAX\(created_at\) FILTER \(WHERE payload->>'generated' IS DISTINCT FROM 'true'\) AS last_event_at/,
  );
  // A plain unfiltered MAX(created_at) would reintroduce the self-reset loop.
  assert.doesNotMatch(source, /MAX\(created_at\) AS last_event_at/);
});
