import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateMentorProfileFreshnessCalibration,
  type MentorProfileFreshnessSnapshot,
} from "@/lib/mentor-profile-freshness";

const base: MentorProfileFreshnessSnapshot = {
  version: "2026-09-18.1",
  observedAt: "2026-09-18T12:00:00.000Z",
  lookbackSeconds: 3_600,
  targetSeconds: 60,
  sampleCount: 100,
  validSampleCount: 100,
  invalidLatencyCount: 0,
  withinTargetCount: 95,
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

test("Mentor freshness calibration distinguishes low volume from invalid evidence", () => {
  assert.equal(
    evaluateMentorProfileFreshnessCalibration(
      { ...base, sampleCount: 10, validSampleCount: 10 },
      50,
    ).status,
    "insufficient_data",
  );
  assert.equal(
    evaluateMentorProfileFreshnessCalibration(
      {
        ...base,
        sampleCount: 101,
        validSampleCount: 100,
        invalidLatencyCount: 1,
      },
      50,
    ).status,
    "invalid_evidence",
  );
});
