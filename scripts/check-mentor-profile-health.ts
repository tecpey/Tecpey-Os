import path from "node:path";
import { withTx } from "../src/lib/db";
import {
  evaluateMentorProfileHealth,
  loadMentorProfileHealthSnapshot,
  mentorProfileHealthAlertMetadata,
  type MentorProfileHealthSnapshot,
} from "../src/lib/mentor-profile-health";
import {
  observeOperationalSignalEpisode,
  type OperationalSignalEpisodeResult,
} from "../src/lib/ops/operational-signal-episode-state";

const SOURCE_UNIT = "tecpey-mentor-profile-health.service";
const SIGNAL_TYPE = "mentor_profile_projection_health";
const COMPONENT = "mentor_profile_projection";

type EpisodeOutcome =
  | { enabled: false; result: null; error: null }
  | { enabled: true; result: OperationalSignalEpisodeResult; error: null }
  | { enabled: true; result: null; error: string };

function boundedWindowSeconds(): number {
  const raw =
    process.env.MENTOR_PROFILE_CRITICAL_SIGNAL_WINDOW_SECONDS?.trim() ?? "";
  if (!raw) return 3_600;
  if (!/^\d+$/.test(raw)) {
    throw new Error("mentor_profile_signal_window_invalid");
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 300 || parsed > 86_400) {
    throw new Error("mentor_profile_signal_window_invalid");
  }
  return parsed;
}

function operationalStateDirectory(): string | null {
  const value = process.env.TECPEY_OPS_STATE_DIR?.trim() ?? "";
  if (!value) return null;
  if (
    !path.isAbsolute(value) ||
    value === path.parse(value).root ||
    value.length > 500 ||
    value.includes("\0")
  ) {
    throw new Error("mentor_profile_ops_state_dir_invalid");
  }
  return path.normalize(value);
}

function healthMeasurements(
  snapshot: MentorProfileHealthSnapshot,
): Record<string, number | boolean | null> {
  return {
    failed_retryable: snapshot.failedRetryable,
    max_lease_overdue_seconds: snapshot.maxLeaseOverdueSeconds,
    oldest_ready_age_seconds: snapshot.oldestReadyAgeSeconds,
    overdue_leases: snapshot.overdueLeases,
    pending: snapshot.pending,
    processing: snapshot.processing,
    ready_backlog: snapshot.readyBacklog,
    unresolved_dead_letters: snapshot.unresolvedDeadLetters,
    unresolved_terminal_failures: snapshot.unresolvedTerminalFailures,
  };
}

function safeReasonCode(error: unknown): string {
  const candidate =
    error instanceof Error ? error.message.trim().toLowerCase() : "";
  return /^[a-z0-9._:-]{3,100}$/.test(candidate)
    ? candidate
    : "mentor_profile_health_check_failed";
}

async function observeHealthEpisode(input: {
  active: boolean;
  occurredAt: string;
  reasonCodes?: readonly string[];
  measurements?: Record<string, number | boolean | null>;
}): Promise<EpisodeOutcome> {
  let stateDirectory: string | null;
  try {
    stateDirectory = operationalStateDirectory();
  } catch (error) {
    return { enabled: true, result: null, error: safeReasonCode(error) };
  }
  if (!stateDirectory) {
    return { enabled: false, result: null, error: null };
  }
  try {
    const result = await observeOperationalSignalEpisode({
      stateDirectory,
      signalType: SIGNAL_TYPE,
      component: COMPONENT,
      sourceUnit: SOURCE_UNIT,
      active: input.active,
      ...(input.active ? { severity: "critical" as const } : {}),
      occurredAt: input.occurredAt,
      dedupeWindowSeconds: boundedWindowSeconds(),
      reasonCodes: input.reasonCodes,
      measurements: input.measurements,
    });
    return { enabled: true, result, error: null };
  } catch (error) {
    return { enabled: true, result: null, error: safeReasonCode(error) };
  }
}

async function main(): Promise<void> {
  const occurredAt = new Date().toISOString();
  const snapshot = await withTx((client) =>
    loadMentorProfileHealthSnapshot(client),
  );

  if (!snapshot.enabled) {
    const episode = await observeHealthEpisode({
      active: true,
      occurredAt,
      reasonCodes: ["mentor_profile_database_unavailable"],
    });
    console.error(
      JSON.stringify({
        ok: false,
        status: "authority_unavailable",
        error: "mentor_profile_database_unavailable",
        signalEpisode: episode,
      }),
    );
    process.exitCode = 3;
    return;
  }

  const evaluation = evaluateMentorProfileHealth(snapshot.value);
  const evidence = mentorProfileHealthAlertMetadata(
    snapshot.value,
    evaluation,
  );
  const episode = await observeHealthEpisode({
    active: evaluation.status === "critical",
    occurredAt,
    reasonCodes:
      evaluation.status === "critical" ? evaluation.reasonCodes : undefined,
    measurements: healthMeasurements(snapshot.value),
  });

  if (episode.error) {
    console.error(
      JSON.stringify({
        ok: false,
        status: "signal_episode_error",
        error: episode.error,
      }),
    );
  }

  console.log(
    JSON.stringify({
      ok: evaluation.status === "healthy" && episode.error === null,
      ...evidence,
      signalEpisode: episode,
    }),
  );

  process.exitCode =
    episode.error !== null
      ? 3
      : evaluation.status === "healthy"
        ? 0
        : evaluation.status === "warning"
          ? 1
          : 2;
}

void main().catch(async (error) => {
  const occurredAt = new Date().toISOString();
  const code = safeReasonCode(error);
  const episode = await observeHealthEpisode({
    active: true,
    occurredAt,
    reasonCodes: [code],
  });
  console.error(
    JSON.stringify({
      ok: false,
      status: "error",
      error: code,
      signalEpisode: episode,
    }),
  );
  process.exitCode = 3;
});
