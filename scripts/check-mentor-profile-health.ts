import os from "node:os";
import path from "node:path";
import { withTx } from "../src/lib/db";
import {
  evaluateMentorProfileHealth,
  loadMentorProfileHealthSnapshot,
  mentorProfileHealthAlertMetadata,
  type MentorProfileHealthSnapshot,
} from "../src/lib/mentor-profile-health";
import { transitionOperationalConditionSignal } from "../src/lib/ops/operational-condition-signal";

const SOURCE = "mentor-profile-health";
const SOURCE_UNIT = "tecpey-mentor-profile-health.service";

function stateDirectory(): string {
  const value = process.env.TECPEY_OPS_STATE_DIR?.trim() ?? "";
  if (
    !value ||
    value.length > 500 ||
    value.includes("\0") ||
    !path.isAbsolute(value) ||
    path.normalize(value) === path.parse(path.normalize(value)).root
  ) {
    throw new Error("tecpey_ops_state_dir_invalid");
  }
  return path.normalize(value);
}

function hostName(): string {
  const value = os.hostname().trim().toLowerCase();
  if (!value || value.length > 120 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("mentor_profile_health_host_invalid");
  }
  return value;
}

function metrics(snapshot: MentorProfileHealthSnapshot): {
  counters: Record<string, number>;
  gauges: Record<string, number | null>;
} {
  return {
    counters: {
      failed_retryable: snapshot.failedRetryable,
      overdue_leases: snapshot.overdueLeases,
      pending: snapshot.pending,
      processing: snapshot.processing,
      ready_backlog: snapshot.readyBacklog,
      unresolved_dead_letters: snapshot.unresolvedDeadLetters,
      unresolved_terminal_failures: snapshot.unresolvedTerminalFailures,
    },
    gauges: {
      max_lease_overdue_seconds: snapshot.maxLeaseOverdueSeconds,
      oldest_ready_age_seconds: snapshot.oldestReadyAgeSeconds,
    },
  };
}

async function condition(input: {
  condition: string;
  status: "healthy" | "warning" | "critical";
  observedAt: string;
  reasonCodes: string[];
  counters?: Record<string, number>;
  gauges?: Record<string, number | null>;
}): Promise<void> {
  await transitionOperationalConditionSignal({
    stateDirectory: stateDirectory(),
    source: SOURCE,
    sourceUnit: SOURCE_UNIT,
    hostName: hostName(),
    condition: input.condition,
    status: input.status,
    observedAt: input.observedAt,
    reasonCodes: input.reasonCodes,
    counters: input.counters ?? {},
    gauges: input.gauges ?? {},
  });
}

function safeErrorCode(error: unknown): string {
  return error instanceof Error && /^[a-z0-9._:-]{3,100}$/.test(error.message)
    ? error.message
    : "mentor_profile_health_check_failed";
}

async function bestEffortProbeFailureSignal(
  errorCode: string,
  observedAt: string,
): Promise<void> {
  try {
    await condition({
      condition: "health-probe",
      status: "critical",
      observedAt,
      reasonCodes: [errorCode],
    });
  } catch {
    // Host-level service failure remains the final independent signal when the
    // local durable spool itself is unavailable.
  }
}

async function main(): Promise<void> {
  // Validate the durable state authority before querying PostgreSQL so a
  // critical database outage can still be spooled locally.
  stateDirectory();
  hostName();

  const observedAt = new Date().toISOString();
  const snapshot = await withTx((client) =>
    loadMentorProfileHealthSnapshot(client),
  );

  if (!snapshot.enabled) {
    await condition({
      condition: "database-authority",
      status: "critical",
      observedAt,
      reasonCodes: ["mentor_profile_database_unavailable"],
    });
    console.error(JSON.stringify({
      ok: false,
      status: "authority_unavailable",
      error: "mentor_profile_database_unavailable",
    }));
    process.exitCode = 3;
    return;
  }

  await condition({
    condition: "database-authority",
    status: "healthy",
    observedAt,
    reasonCodes: [],
  });
  await condition({
    condition: "health-probe",
    status: "healthy",
    observedAt,
    reasonCodes: [],
  });

  const evaluation = evaluateMentorProfileHealth(snapshot.value);
  const evidence = mentorProfileHealthAlertMetadata(
    snapshot.value,
    evaluation,
  );
  const aggregate = metrics(snapshot.value);
  await condition({
    condition: "projection-health",
    status: evaluation.status,
    observedAt,
    reasonCodes: [...evaluation.reasonCodes],
    ...aggregate,
  });

  console.log(JSON.stringify({
    ok: evaluation.status === "healthy",
    ...evidence,
  }));

  process.exitCode =
    evaluation.status === "healthy" ? 0 :
    evaluation.status === "warning" ? 1 :
    2;
}

void main().catch(async (error) => {
  const code = safeErrorCode(error);
  await bestEffortProbeFailureSignal(code, new Date().toISOString());
  console.error(JSON.stringify({ ok: false, status: "error", error: code }));
  process.exitCode = 3;
});
