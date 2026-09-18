import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateMentorProfileFreshnessCalibration,
  type MentorProfileFreshnessSnapshot,
} from "@/lib/mentor-profile-freshness";

const base: MentorProfileFreshnessSnapshot = {
  version: "2026-09-18.2",
  observedAt: "2026-09-18T12:00:00.000Z",
  lookbackSeconds: 3_600,
  targetSeconds: 60,
  sampleCount: 100,
  processedSampleCount: 100,
  validLatencyCount: 100,
  invalidLatencyCount: 0,
  withinTargetCount: 95,
  missedTargetCount: 5,
  withinTargetRatio: 0.95,
  p50Seconds: 8,
  p95Seconds: 58,
  maxSeconds: 120,
};

test("Mentor freshness calibration reports observation without declaring an SLO pass", () => {
  assert.deepEqual(evaluateMentorProfileFreshnessCalibration(base, 50), {
    status: "observed",
    sampleCount: 100,
    minimumSamples: 50,
  });
});

test("Mentor freshness denominator includes matured misses rather than only successes", () => {
  const withBacklog: MentorProfileFreshnessSnapshot = {
    ...base,
    sampleCount: 120,
    processedSampleCount: 100,
    validLatencyCount: 100,
    withinTargetCount: 95,
    missedTargetCount: 25,
    withinTargetRatio: 95 / 120,
  };
  assert.equal(
    evaluateMentorProfileFreshnessCalibration(withBacklog, 50).status,
    "observed",
  );
  assert.equal(withBacklog.sampleCount - withBacklog.processedSampleCount, 20);
  assert.equal(withBacklog.missedTargetCount, 25);
});

test("Mentor freshness calibration distinguishes low volume from invalid evidence", () => {
  assert.equal(
    evaluateMentorProfileFreshnessCalibration(
      {
        ...base,
        sampleCount: 10,
        processedSampleCount: 10,
        validLatencyCount: 10,
        withinTargetCount: 8,
        missedTargetCount: 2,
        withinTargetRatio: 0.8,
      },
      50,
    ).status,
    "insufficient_data",
  );
  assert.equal(
    evaluateMentorProfileFreshnessCalibration(
      {
        ...base,
        sampleCount: 101,
        processedSampleCount: 101,
        validLatencyCount: 100,
        invalidLatencyCount: 1,
        missedTargetCount: 6,
      },
      50,
    ).status,
    "invalid_evidence",
  );
});
