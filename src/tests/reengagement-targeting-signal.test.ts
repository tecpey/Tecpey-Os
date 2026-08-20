import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveNotificationBrainSnapshot,
  type NotificationBrainSignals,
} from "../lib/phase5-achievement-engine";

// The re-engagement targeting decision — who gets nudged back, on which channel,
// with which hook and copy — used to live inside a database read and so could not
// be tested. Extracting it made it pure; these tests lock the behavior that drives
// return-rate, so a regression that mis-targets an engaged learner or picks the
// wrong channel cannot ship silently.

function signals(overrides: Partial<NotificationBrainSignals> = {}): NotificationBrainSignals {
  return {
    learningEvents: 0,
    quizzes: 0,
    simulatorEvents: 0,
    certificates: 0,
    discipline: 0,
    confidence: 100,
    inactiveDays: 0,
    locale: "en",
    ...overrides,
  };
}

test("hook cascade: low confidence routes to the mentor before anything else", () => {
  // Low confidence wins even when the simulator/achievement conditions also hold.
  const snap = deriveNotificationBrainSnapshot(
    signals({ confidence: 59, simulatorEvents: 0, certificates: 0, learningEvents: 5 }),
  );
  assert.equal(snap.nextHookType, "mentor");
  assert.equal(snap.nextActionUrl, "/academy/mentor-coach");
});

test("hook cascade: confident but under-practiced routes to the simulator", () => {
  const snap = deriveNotificationBrainSnapshot(
    signals({ confidence: 80, simulatorEvents: 1, certificates: 0, learningEvents: 5 }),
  );
  assert.equal(snap.nextHookType, "simulator");
  assert.equal(snap.nextActionUrl, "/academy/simulator");
});

test("hook cascade: practiced and progressing but uncertified routes to achievement", () => {
  const snap = deriveNotificationBrainSnapshot(
    signals({ confidence: 80, simulatorEvents: 3, certificates: 0, learningEvents: 2 }),
  );
  assert.equal(snap.nextHookType, "achievement");
  assert.equal(snap.nextActionUrl, "/academy/certificates");
});

test("hook cascade: fully-engaged learner falls through to the learning path", () => {
  const snap = deriveNotificationBrainSnapshot(
    signals({ confidence: 80, simulatorEvents: 3, certificates: 1, learningEvents: 5 }),
  );
  assert.equal(snap.nextHookType, "learning");
  assert.equal(snap.nextActionUrl, "/academy/profile");
});

test("achievement hook requires real progress, not just being uncertified", () => {
  // certificates === 0 but only 1 learning event → not enough progress, stays learning.
  const snap = deriveNotificationBrainSnapshot(
    signals({ confidence: 80, simulatorEvents: 3, certificates: 0, learningEvents: 1 }),
  );
  assert.equal(snap.nextHookType, "learning");
});

test("channel: high churn risk escalates to push", () => {
  // Long inactivity with no engagement drives churnRisk above the push threshold.
  const snap = deriveNotificationBrainSnapshot(signals({ inactiveDays: 12, confidence: 100 }));
  assert.ok(snap.churnRisk > 72, `expected high churn risk, got ${snap.churnRisk}`);
  assert.equal(snap.bestChannel, "push");
});

test("channel: engaged simulator user with low churn prefers in-app", () => {
  const snap = deriveNotificationBrainSnapshot(
    signals({ simulatorEvents: 3, learningEvents: 4, certificates: 1, inactiveDays: 0 }),
  );
  assert.ok(snap.churnRisk <= 72);
  assert.equal(snap.bestChannel, "in_app");
});

test("channel: low-engagement low-churn defaults to email", () => {
  const snap = deriveNotificationBrainSnapshot(signals({ inactiveDays: 0, learningEvents: 0 }));
  assert.ok(snap.churnRisk <= 72);
  assert.equal(snap.bestChannel, "email");
});

test("scores are monotonic in inactivity and clamped to 0..100", () => {
  const fresh = deriveNotificationBrainSnapshot(signals({ inactiveDays: 0, learningEvents: 3 }));
  const stale = deriveNotificationBrainSnapshot(signals({ inactiveDays: 10, learningEvents: 3 }));
  assert.ok(stale.returnProbability < fresh.returnProbability, "inactivity must lower return probability");
  assert.ok(stale.churnRisk > fresh.churnRisk, "inactivity must raise churn risk");
  for (const snap of [fresh, stale]) {
    assert.ok(snap.returnProbability >= 0 && snap.returnProbability <= 100);
    assert.ok(snap.churnRisk >= 0 && snap.churnRisk <= 100);
  }
});

test("best-time label and copy are localized and inactivity-aware", () => {
  const enActive = deriveNotificationBrainSnapshot(signals({ inactiveDays: 1, locale: "en" }));
  const enStale = deriveNotificationBrainSnapshot(signals({ inactiveDays: 3, locale: "en" }));
  assert.equal(enActive.bestTimeLabel, "afternoon");
  assert.equal(enStale.bestTimeLabel, "tonight");

  const fa = deriveNotificationBrainSnapshot(signals({ inactiveDays: 3, locale: "fa" }));
  assert.equal(fa.bestTimeLabel, "امشب");
  assert.notEqual(fa.messageTitle, enStale.messageTitle);
});
