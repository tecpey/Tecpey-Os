import path from "node:path";
import { withTx } from "../src/lib/db";
import {
  evaluateMentorProfileHealth,
  loadMentorProfileHealthSnapshot,
  mentorProfileHealthAlertMetadata,
  type MentorProfileHealthSnapshot,
} from "../src/lib/mentor-profile-health";
import { createOperationalSignalEvidence } from "../src/lib/ops/operational-signal-evidence";
import { enqueueOperationalSignal } from "../src/lib/ops/operational-signal-spool";

const SOURCE_UNIT = "tecpey-mentor-profile-health.service";
const SIGNAL_TYPE = "mentor_profile_projection_health";
const COMPONENT = "mentor_profile_projection";

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

async function enqueueCriticalSignal(input: {
  occurredAt: string;
  reasonCodes: readonly string[];
  measurements?: Record<string, number | boolean | null>;
}): Promise<
  | { enabled: false; replayed: null; signalId: null }
  | { enabled: true; replayed: boolean; signalId: string }
> {
  const stateDirectory = operationalStateDirectory();
  if (!stateDirectory) {
    return { enabled: false, replayed: null, signalId: null };
  }
  const signal = createOperationalSignalEvidence({
    signalType: SIGNAL_TYPE,
    component: COMPONENT,
    sourceUnit: SOURCE_UNIT,
    severity: "critical",
    lifecycle: "firing",
    occurredAt: input.occurredAt,
    dedupeWindowSeconds: boundedWindowSeconds(),
    reasonCodes: input.reasonCodes,
    measurements: input.measurements ?? {},
  });
  const queued = await enqueueOperationalSignal(stateDirectory, signal);
  return {
    enabled: true,
    replayed: queued.replayed,
    signalId: signal.signalId,
  };
}

async function main(): Promise<void> {
  const occurredAt = new Date().toISOString();
  const snapshot = await withTx((client) =>
    loadMentorProfileHealthSnapshot(client),
  );
  if (!snapshot.enabled) {
    let signal:
      | Awaited<ReturnType<typeof enqueueCriticalSignal>>
      | { enabled: false; replayed: null; signalId: null };
    try {
      signal = await enqueueCriticalSignal({
        occurredAt,
        reasonCodes: ["mentor_profile_database_unavailable"],
      });
    } catch (error) {
      signal = { enabled: false, replayed: null, signalId: null };
      console.error(
        JSON.stringify({
          ok: false,
          status: "signal_spool_error",
          error: safeReasonCode(error),
        }),
      );
    }
    console.error(
      JSON.stringify({
        ok: false,
        status: "authority_unavailable",
        error: "mentor_profile_database_unavailable",
        criticalSignal: signal,
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
  let criticalSignal:
    | Awaited<ReturnType<typeof enqueueCriticalSignal>>
    | null = null;
  if (evaluation.status === "critical") {
    try {
      criticalSignal = await enqueueCriticalSignal({
        occurredAt,
        reasonCodes: evaluation.reasonCodes,
        measurements: healthMeasurements(snapshot.value),
      });
    } catch (error) {
      criticalSignal = {
        enabled: false,
        replayed: null,
        signalId: null,
      };
      console.error(
        JSON.stringify({
          ok: false,
          status: "signal_spool_error",
          error: safeReasonCode(error),
        }),
      );
    }
  }

  console.log(
    JSON.stringify({
      ok: evaluation.status === "healthy",
      ...evidence,
      criticalSignal,
    }),
  );

  process.exitCode =
    evaluation.status === "healthy"
      ? 0
      : evaluation.status === "warning"
        ? 1
        : 2;
}

void main().catch(async (error) => {
  const occurredAt = new Date().toISOString();
  const code = safeReasonCode(error);
  let signal:
    | Awaited<ReturnType<typeof enqueueCriticalSignal>>
    | { enabled: false; replayed: null; signalId: null };
  try {
    signal = await enqueueCriticalSignal({
      occurredAt,
      reasonCodes: [code],
    });
  } catch (signalError) {
    signal = { enabled: false, replayed: null, signalId: null };
    console.error(
      JSON.stringify({
        ok: false,
        status: "signal_spool_error",
        error: safeReasonCode(signalError),
      }),
    );
  }
  console.error(
    JSON.stringify({
      ok: false,
      status: "error",
      error: code,
      criticalSignal: signal,
    }),
  );
  process.exitCode = 3;
});
