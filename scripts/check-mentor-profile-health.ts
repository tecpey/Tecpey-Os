import path from "node:path";
import { withTx } from "../src/lib/db";
import {
  evaluateMentorProfileHealth,
  loadMentorProfileHealthSnapshot,
  mentorProfileHealthAlertMetadata,
  type MentorProfileHealthSnapshot,
} from "../src/lib/mentor-profile-health";
import {
  transitionOperationalConditionSignal,
  type OperationalConditionTransition,
} from "../src/lib/ops/operational-condition-signal";

const SOURCE_UNIT = "tecpey-mentor-profile-health.service";
const SIGNAL_TYPE = "mentor_profile_operational_condition";

type ConditionComponent =
  | "mentor_profile_projection"
  | "mentor_profile_database_authority"
  | "mentor_profile_health_probe";

type SignalResult =
  | { enabled: false; transition: null }
  | { enabled: true; transition: OperationalConditionTransition };

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

async function transitionCondition(input: {
  component: ConditionComponent;
  status: "healthy" | "warning" | "critical";
  observedAt: string;
  reasonCodes: readonly string[];
  measurements?: Readonly<Record<string, number | boolean | null>>;
}): Promise<SignalResult> {
  const stateDirectory = operationalStateDirectory();
  if (!stateDirectory) {
    return { enabled: false, transition: null };
  }
  const transition = await transitionOperationalConditionSignal({
    stateDirectory,
    signalType: SIGNAL_TYPE,
    component: input.component,
    sourceUnit: SOURCE_UNIT,
    status: input.status,
    observedAt: input.observedAt,
    reasonCodes: input.reasonCodes,
    measurements: input.measurements ?? {},
  });
  return { enabled: true, transition };
}

async function main(): Promise<void> {
  const observedAt = new Date().toISOString();
  let snapshot:
    | { enabled: true; value: MentorProfileHealthSnapshot }
    | { enabled: false; value: null }
    | null = null;
  let databaseFailureCode: string | null = null;
  try {
    snapshot = await withTx((client) =>
      loadMentorProfileHealthSnapshot(client),
    );
    if (!snapshot.enabled) {
      databaseFailureCode = "mentor_profile_database_unavailable";
    }
  } catch {
    databaseFailureCode = "mentor_profile_database_authority_failed";
  }

  if (databaseFailureCode !== null || !snapshot?.enabled) {
    const reasonCode =
      databaseFailureCode ?? "mentor_profile_database_unavailable";
    const databaseSignal = await transitionCondition({
      component: "mentor_profile_database_authority",
      status: "critical",
      observedAt,
      reasonCodes: [reasonCode],
    });
    console.error(
      JSON.stringify({
        ok: false,
        status: "authority_unavailable",
        error: reasonCode,
        operationalSignal: databaseSignal,
      }),
    );
    process.exitCode = 3;
    return;
  }

  const databaseRecovery = await transitionCondition({
    component: "mentor_profile_database_authority",
    status: "healthy",
    observedAt,
    reasonCodes: [],
  });

  const evaluation = evaluateMentorProfileHealth(snapshot.value);
  const evidence = mentorProfileHealthAlertMetadata(
    snapshot.value,
    evaluation,
  );
  const projectionSignal = await transitionCondition({
    component: "mentor_profile_projection",
    status: evaluation.status,
    observedAt,
    reasonCodes: evaluation.reasonCodes,
    measurements: healthMeasurements(snapshot.value),
  });
  const probeRecovery = await transitionCondition({
    component: "mentor_profile_health_probe",
    status: "healthy",
    observedAt,
    reasonCodes: [],
  });

  console.log(
    JSON.stringify({
      ok: evaluation.status === "healthy",
      ...evidence,
      operationalSignals: {
        databaseAuthority: databaseRecovery,
        projection: projectionSignal,
        healthProbe: probeRecovery,
      },
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
  const observedAt = new Date().toISOString();
  const code = safeReasonCode(error);
  let probeSignal: SignalResult = { enabled: false, transition: null };
  try {
    probeSignal = await transitionCondition({
      component: "mentor_profile_health_probe",
      status: "critical",
      observedAt,
      reasonCodes: [code],
    });
  } catch (signalError) {
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
      operationalSignal: probeSignal,
    }),
  );
  process.exitCode = 3;
});
