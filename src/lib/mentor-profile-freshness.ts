import type { PoolClient } from "pg";

export const MENTOR_PROFILE_FRESHNESS_CALIBRATION_VERSION =
  "2026-09-18.1" as const;

export type MentorProfileFreshnessCalibrationInput = Readonly<{
  lookbackSeconds?: number;
  targetSeconds?: number;
}>;

export type MentorProfileFreshnessSnapshot = Readonly<{
  version: typeof MENTOR_PROFILE_FRESHNESS_CALIBRATION_VERSION;
  observedAt: string;
  lookbackSeconds: number;
  targetSeconds: number;
  sampleCount: number;
  validSampleCount: number;
  invalidLatencyCount: number;
  withinTargetCount: number;
  withinTargetRatio: number | null;
  p50Seconds: number | null;
  p95Seconds: number | null;
  maxSeconds: number | null;
}>;

export type MentorProfileFreshnessCalibrationEvaluation = Readonly<{
  status: "observed" | "insufficient_data" | "invalid_evidence";
  sampleCount: number;
  minimumSamples: number;
}>;

type FreshnessRow = {
  observed_at: Date;
  sample_count: string;
  valid_sample_count: string;
  invalid_latency_count: string;
  within_target_count: string;
  p50_seconds: number | null;
  p95_seconds: number | null;
  max_seconds: number | null;
};

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < minimum || selected > maximum) {
    throw new Error(code);
  }
  return selected;
}

function count(value: string, code: string): number {
  if (!/^\d+$/.test(value)) throw new Error(code);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(code);
  return parsed;
}

function seconds(value: number | null, code: string): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error(code);
  return Math.round(value * 1000) / 1000;
}

export async function loadMentorProfileFreshnessSnapshot(
  client: PoolClient,
  input: MentorProfileFreshnessCalibrationInput = {},
): Promise<MentorProfileFreshnessSnapshot> {
  const lookbackSeconds = boundedInteger(
    input.lookbackSeconds,
    3_600,
    300,
    86_400,
    "mentor_profile_freshness_lookback_invalid",
  );
  const targetSeconds = boundedInteger(
    input.targetSeconds,
    60,
    1,
    3_600,
    "mentor_profile_freshness_target_invalid",
  );

  const result = await client.query<FreshnessRow>(
    `WITH recent AS (
       SELECT EXTRACT(EPOCH FROM (processed_at - created_at))::double precision
                AS latency_seconds
         FROM mentor_profile_update_outbox
        WHERE status = 'processed'
          AND processed_at IS NOT NULL
          AND processed_at >=
            clock_timestamp() - make_interval(secs => $1)
     ),
     valid AS (
       SELECT latency_seconds
         FROM recent
        WHERE latency_seconds >= 0
     )
     SELECT
       clock_timestamp() AS observed_at,
       (SELECT COUNT(*)::text FROM recent) AS sample_count,
       COUNT(*)::text AS valid_sample_count,
       (SELECT COUNT(*)::text FROM recent WHERE latency_seconds < 0)
         AS invalid_latency_count,
       COUNT(*) FILTER (WHERE latency_seconds <= $2)::text
         AS within_target_count,
       percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_seconds)
         AS p50_seconds,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_seconds)
         AS p95_seconds,
       MAX(latency_seconds) AS max_seconds
       FROM valid`,
    [lookbackSeconds, targetSeconds],
  );

  const row = result.rows[0];
  if (!row?.observed_at) {
    throw new Error("mentor_profile_freshness_snapshot_missing");
  }
  const sampleCount = count(
    row.sample_count,
    "mentor_profile_freshness_sample_count_invalid",
  );
  const validSampleCount = count(
    row.valid_sample_count,
    "mentor_profile_freshness_valid_sample_count_invalid",
  );
  const invalidLatencyCount = count(
    row.invalid_latency_count,
    "mentor_profile_freshness_invalid_latency_count_invalid",
  );
  const withinTargetCount = count(
    row.within_target_count,
    "mentor_profile_freshness_within_target_count_invalid",
  );
  if (
    validSampleCount + invalidLatencyCount !== sampleCount ||
    withinTargetCount > validSampleCount
  ) {
    throw new Error("mentor_profile_freshness_counts_inconsistent");
  }

  return Object.freeze({
    version: MENTOR_PROFILE_FRESHNESS_CALIBRATION_VERSION,
    observedAt: row.observed_at.toISOString(),
    lookbackSeconds,
    targetSeconds,
    sampleCount,
    validSampleCount,
    invalidLatencyCount,
    withinTargetCount,
    withinTargetRatio:
      validSampleCount === 0
        ? null
        : Math.round((withinTargetCount / validSampleCount) * 1_000_000) /
          1_000_000,
    p50Seconds: seconds(
      row.p50_seconds,
      "mentor_profile_freshness_p50_invalid",
    ),
    p95Seconds: seconds(
      row.p95_seconds,
      "mentor_profile_freshness_p95_invalid",
    ),
    maxSeconds: seconds(
      row.max_seconds,
      "mentor_profile_freshness_max_invalid",
    ),
  });
}

export function evaluateMentorProfileFreshnessCalibration(
  snapshot: MentorProfileFreshnessSnapshot,
  minimumSamples = 50,
): MentorProfileFreshnessCalibrationEvaluation {
  const boundedMinimum = boundedInteger(
    minimumSamples,
    50,
    1,
    1_000_000,
    "mentor_profile_freshness_minimum_samples_invalid",
  );
  if (snapshot.invalidLatencyCount > 0) {
    return {
      status: "invalid_evidence",
      sampleCount: snapshot.validSampleCount,
      minimumSamples: boundedMinimum,
    };
  }
  if (snapshot.validSampleCount < boundedMinimum) {
    return {
      status: "insufficient_data",
      sampleCount: snapshot.validSampleCount,
      minimumSamples: boundedMinimum,
    };
  }
  return {
    status: "observed",
    sampleCount: snapshot.validSampleCount,
    minimumSamples: boundedMinimum,
  };
}
