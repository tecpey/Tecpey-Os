import type { PoolClient } from "pg";

export const MENTOR_PROFILE_FRESHNESS_CALIBRATION_VERSION =
  "2026-09-18.2" as const;

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
  processedSampleCount: number;
  validLatencyCount: number;
  invalidLatencyCount: number;
  withinTargetCount: number;
  missedTargetCount: number;
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
  processed_sample_count: string;
  valid_latency_count: string;
  invalid_latency_count: string;
  within_target_count: string;
  missed_target_count: string;
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
  if (targetSeconds >= lookbackSeconds) {
    throw new Error("mentor_profile_freshness_window_invalid");
  }

  const result = await client.query<FreshnessRow>(
    `WITH clock AS (
       SELECT clock_timestamp() AS observed_at
     ),
     eligible AS (
       SELECT
         o.created_at,
         o.processed_at,
         CASE
           WHEN o.processed_at IS NULL THEN NULL
           ELSE EXTRACT(EPOCH FROM (o.processed_at - o.created_at))::double precision
         END AS latency_seconds
         FROM mentor_profile_update_outbox o
         CROSS JOIN clock
        WHERE o.created_at >=
                clock.observed_at - make_interval(secs => $1)
          AND o.created_at <=
                clock.observed_at - make_interval(secs => $2)
     ),
     valid_latency AS (
       SELECT latency_seconds
         FROM eligible
         CROSS JOIN clock
        WHERE latency_seconds IS NOT NULL
          AND latency_seconds >= 0
          AND processed_at <= clock.observed_at
     )
     SELECT
       clock.observed_at,
       (SELECT COUNT(*)::text FROM eligible) AS sample_count,
       (SELECT COUNT(*)::text
          FROM eligible
         WHERE processed_at IS NOT NULL) AS processed_sample_count,
       (SELECT COUNT(*)::text FROM valid_latency) AS valid_latency_count,
       (SELECT COUNT(*)::text
          FROM eligible
          CROSS JOIN clock
         WHERE latency_seconds < 0
            OR processed_at > clock.observed_at) AS invalid_latency_count,
       (SELECT COUNT(*)::text
          FROM eligible
         WHERE processed_at IS NOT NULL
           AND processed_at >= created_at
           AND processed_at <= clock.observed_at
           AND processed_at <= created_at + make_interval(secs => $2))
         AS within_target_count,
       (SELECT COUNT(*)::text
          FROM eligible
          CROSS JOIN clock
         WHERE processed_at IS NULL
            OR processed_at < created_at
            OR processed_at > clock.observed_at
            OR processed_at > created_at + make_interval(secs => $2))
         AS missed_target_count,
       (SELECT percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_seconds)
          FROM valid_latency) AS p50_seconds,
       (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_seconds)
          FROM valid_latency) AS p95_seconds,
       (SELECT MAX(latency_seconds) FROM valid_latency) AS max_seconds
       FROM clock`,
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
  const processedSampleCount = count(
    row.processed_sample_count,
    "mentor_profile_freshness_processed_count_invalid",
  );
  const validLatencyCount = count(
    row.valid_latency_count,
    "mentor_profile_freshness_valid_latency_count_invalid",
  );
  const invalidLatencyCount = count(
    row.invalid_latency_count,
    "mentor_profile_freshness_invalid_latency_count_invalid",
  );
  const withinTargetCount = count(
    row.within_target_count,
    "mentor_profile_freshness_within_target_count_invalid",
  );
  const missedTargetCount = count(
    row.missed_target_count,
    "mentor_profile_freshness_missed_target_count_invalid",
  );

  if (
    processedSampleCount > sampleCount ||
    validLatencyCount + invalidLatencyCount !== processedSampleCount ||
    withinTargetCount > validLatencyCount ||
    withinTargetCount + missedTargetCount !== sampleCount
  ) {
    throw new Error("mentor_profile_freshness_counts_inconsistent");
  }

  return Object.freeze({
    version: MENTOR_PROFILE_FRESHNESS_CALIBRATION_VERSION,
    observedAt: row.observed_at.toISOString(),
    lookbackSeconds,
    targetSeconds,
    sampleCount,
    processedSampleCount,
    validLatencyCount,
    invalidLatencyCount,
    withinTargetCount,
    missedTargetCount,
    withinTargetRatio:
      sampleCount === 0
        ? null
        : Math.round((withinTargetCount / sampleCount) * 1_000_000) /
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
      sampleCount: snapshot.sampleCount,
      minimumSamples: boundedMinimum,
    };
  }
  if (snapshot.sampleCount < boundedMinimum) {
    return {
      status: "insufficient_data",
      sampleCount: snapshot.sampleCount,
      minimumSamples: boundedMinimum,
    };
  }
  return {
    status: "observed",
    sampleCount: snapshot.sampleCount,
    minimumSamples: boundedMinimum,
  };
}
