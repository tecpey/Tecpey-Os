import { withTx } from "../src/lib/db";
import {
  evaluateMentorProfileFreshnessCalibration,
  loadMentorProfileFreshnessSnapshot,
} from "../src/lib/mentor-profile-freshness";

function boundedIntegerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name.toLowerCase()}_invalid`);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name.toLowerCase()}_out_of_range`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const lookbackSeconds = boundedIntegerEnv(
    "MENTOR_PROFILE_FRESHNESS_LOOKBACK_SECONDS",
    3_600,
    300,
    86_400,
  );
  const targetSeconds = boundedIntegerEnv(
    "MENTOR_PROFILE_FRESHNESS_TARGET_SECONDS",
    60,
    1,
    3_600,
  );
  const minimumSamples = boundedIntegerEnv(
    "MENTOR_PROFILE_FRESHNESS_MIN_SAMPLES",
    50,
    1,
    1_000_000,
  );

  const snapshot = await withTx((client) =>
    loadMentorProfileFreshnessSnapshot(client, {
      lookbackSeconds,
      targetSeconds,
    }),
  );
  if (!snapshot.enabled) {
    console.error(JSON.stringify({
      ok: false,
      status: "authority_unavailable",
      error: "mentor_profile_database_unavailable",
    }));
    process.exitCode = 3;
    return;
  }

  const evaluation = evaluateMentorProfileFreshnessCalibration(
    snapshot.value,
    minimumSamples,
  );
  console.log(JSON.stringify({
    ok: evaluation.status === "observed",
    evaluation,
    snapshot: snapshot.value,
  }));

  process.exitCode =
    evaluation.status === "observed" ? 0 :
    evaluation.status === "insufficient_data" ? 1 :
    2;
}

void main().catch((error) => {
  const code =
    error instanceof Error && /^[a-z0-9._:-]{3,160}$/.test(error.message)
      ? error.message
      : "mentor_profile_freshness_calibration_failed";
  console.error(JSON.stringify({ ok: false, status: "error", error: code }));
  process.exitCode = 3;
});
