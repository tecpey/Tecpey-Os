import { hostname } from "node:os";
import { withTx } from "../src/lib/db";
import {
  MENTOR_PROFILE_HEALTH_POLICY_VERSION,
  evaluateMentorProfileHealth,
  loadMentorProfileHealthSnapshot,
  mentorProfileHealthAlertMetadata,
  type MentorProfileHealthSnapshot,
} from "../src/lib/mentor-profile-health";
import {
  reconcileOperationalSignalIncident,
} from "../src/lib/ops/operational-alert-spool";
import type {
  OperationalSignalDetailValue,
} from "../src/lib/ops/operational-signal-evidence";

const SOURCE = "mentor-profile-health";
const SOURCE_UNIT = "tecpey-mentor-profile-health.service";

function requiredAbsoluteDirectory(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (
    !value ||
    !value.startsWith("/") ||
    value === "/" ||
    value.length > 500 ||
    /[\r\n\u0000]/.test(value)
  ) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return value;
}

function detailsFromSnapshot(
  snapshot: MentorProfileHealthSnapshot,
): Readonly<Record<string, OperationalSignalDetailValue>> {
  return {
    policyVersion: MENTOR_PROFILE_HEALTH_POLICY_VERSION,
    pending: snapshot.pending,
    processing: snapshot.processing,
    failedRetryable: snapshot.failedRetryable,
    unresolvedTerminalFailures: snapshot.unresolvedTerminalFailures,
    unresolvedDeadLetters: snapshot.unresolvedDeadLetters,
    readyBacklog: snapshot.readyBacklog,
    overdueLeases: snapshot.overdueLeases,
    oldestReadyAgeSeconds: snapshot.oldestReadyAgeSeconds,
    maxLeaseOverdueSeconds: snapshot.maxLeaseOverdueSeconds,
  };
}

async function main(): Promise<void> {
  const stateDirectory = requiredAbsoluteDirectory("TECPEY_OPS_STATE_DIR");
  const observedAt = new Date().toISOString();
  const hostName = hostname();

  const snapshot = await withTx((client) =>
    loadMentorProfileHealthSnapshot(client),
  );
  if (!snapshot.enabled) {
    const incident = await reconcileOperationalSignalIncident(stateDirectory, {
      source: SOURCE,
      sourceUnit: SOURCE_UNIT,
      hostName,
      status: "authority_unavailable",
      observedAt,
      reasonCodes: ["mentor_profile_database_unavailable"],
      details: {
        policyVersion: MENTOR_PROFILE_HEALTH_POLICY_VERSION,
        authority: "database_unavailable",
      },
    });
    console.error(JSON.stringify({
      ok: false,
      status: "authority_unavailable",
      error: "mentor_profile_database_unavailable",
      signal: incident,
    }));
    process.exitCode = 3;
    return;
  }

  const evaluation = evaluateMentorProfileHealth(snapshot.value);
  const evidence = mentorProfileHealthAlertMetadata(
    snapshot.value,
    evaluation,
  );
  const incident = await reconcileOperationalSignalIncident(stateDirectory, {
    source: SOURCE,
    sourceUnit: SOURCE_UNIT,
    hostName,
    status: evaluation.status,
    observedAt,
    reasonCodes: evaluation.reasonCodes,
    details: detailsFromSnapshot(snapshot.value),
  });

  console.log(JSON.stringify({
    ok: evaluation.status === "healthy",
    ...evidence,
    signal: incident,
  }));

  process.exitCode =
    evaluation.status === "healthy" ? 0 :
    evaluation.status === "warning" ? 1 :
    2;
}

void main().catch((error) => {
  const code =
    error instanceof Error && /^[a-z0-9._:-]{3,160}$/.test(error.message)
      ? error.message
      : "mentor_profile_health_check_failed";
  console.error(JSON.stringify({ ok: false, status: "error", error: code }));
  process.exitCode = 3;
});
