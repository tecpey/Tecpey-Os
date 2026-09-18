import { withTx } from "../src/lib/db";
import {
  DEFAULT_MENTOR_PROFILE_HEALTH_POLICY,
  MENTOR_PROFILE_HEALTH_POLICY_VERSION,
  evaluateMentorProfileHealth,
  loadMentorProfileHealthSnapshot,
  mentorProfileHealthAlertMetadata,
} from "../src/lib/mentor-profile-health";
import { enqueueOperationalSignal } from "../src/lib/ops/operational-alert-spool";
import { createOperationalSignalEvidence } from "../src/lib/ops/operational-signal-evidence";

function opsStateDirectory(): string {
  const value = process.env.TECPEY_OPS_STATE_DIR?.trim() ?? "";
  if (!value) throw new Error("tecpey_ops_state_dir_required");
  return value;
}

async function enqueueCriticalSignal(input: {
  signalType: string;
  statusClassification: "active" | "authority_unavailable";
  reasonCodes: readonly string[];
}): Promise<void> {
  const occurredAt = new Date().toISOString();
  const signal = createOperationalSignalEvidence({
    signalType: input.signalType,
    component: "mentor-profile",
    detector: "mentor-profile-health-probe",
    severity: "critical",
    statusClassification: input.statusClassification,
    occurredAt,
    reasonCodes: input.reasonCodes,
    attributes: {
      policyVersion: MENTOR_PROFILE_HEALTH_POLICY_VERSION,
      criticalReadyAgeSeconds:
        DEFAULT_MENTOR_PROFILE_HEALTH_POLICY.criticalReadyAgeSeconds,
      criticalBacklogDepth:
        DEFAULT_MENTOR_PROFILE_HEALTH_POLICY.criticalBacklogDepth,
      criticalLeaseOverdueSeconds:
        DEFAULT_MENTOR_PROFILE_HEALTH_POLICY.criticalLeaseOverdueSeconds,
    },
    dedupeWindowSeconds: 900,
  });
  await enqueueOperationalSignal(opsStateDirectory(), signal);
}

async function main(): Promise<void> {
  const snapshot = await withTx((client) =>
    loadMentorProfileHealthSnapshot(client),
  );
  if (!snapshot.enabled) {
    await enqueueCriticalSignal({
      signalType: "mentor.profile.authority_unavailable",
      statusClassification: "authority_unavailable",
      reasonCodes: ["mentor_profile_database_unavailable"],
    });
    console.error(JSON.stringify({
      ok: false,
      status: "authority_unavailable",
      error: "mentor_profile_database_unavailable",
      signalQueued: true,
    }));
    process.exitCode = 3;
    return;
  }

  const evaluation = evaluateMentorProfileHealth(snapshot.value);
  const evidence = mentorProfileHealthAlertMetadata(
    snapshot.value,
    evaluation,
  );

  if (evaluation.status === "critical") {
    await enqueueCriticalSignal({
      signalType: "mentor.profile.projection_stalled",
      statusClassification: "active",
      reasonCodes: evaluation.reasonCodes,
    });
  }

  console.log(JSON.stringify({
    ok: evaluation.status === "healthy",
    ...evidence,
    signalQueued: evaluation.status === "critical",
  }));

  process.exitCode =
    evaluation.status === "healthy" ? 0 :
    evaluation.status === "warning" ? 1 :
    2;
}

void main().catch(async (error) => {
  const code =
    error instanceof Error && /^[a-z0-9._:-]{3,160}$/.test(error.message)
      ? error.message
      : "mentor_profile_health_check_failed";

  let signalQueued = false;
  try {
    await enqueueCriticalSignal({
      signalType: "mentor.profile.health_probe_failed",
      statusClassification: "authority_unavailable",
      reasonCodes: ["mentor_profile_health_probe_failed"],
    });
    signalQueued = true;
  } catch {
    // Keep the original probe failure authoritative. systemd will surface the
    // non-zero exit even if the local spool itself is unavailable.
  }

  console.error(JSON.stringify({
    ok: false,
    status: "error",
    error: code,
    signalQueued,
  }));
  process.exitCode = 3;
});
