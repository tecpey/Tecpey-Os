import path from "node:path";
import { withTx } from "../src/lib/db";
import {
  evaluateMentorProfileHealth,
  loadMentorProfileHealthSnapshot,
  mentorProfileHealthAlertMetadata,
} from "../src/lib/mentor-profile-health";
import { enqueueOperationalSignal } from "../src/lib/ops/operational-alert-spool";
import {
  buildMentorProfileHealthAuthoritySignal,
  buildMentorProfileHealthSignal,
} from "../src/lib/ops/mentor-profile-health-signal";

function requiredStateDirectory(): string {
  const raw = process.env.TECPEY_OPS_STATE_DIR?.trim() ?? "";
  if (
    !raw ||
    raw.length > 500 ||
    raw.includes("\0") ||
    !path.isAbsolute(raw)
  ) {
    throw new Error("mentor_profile_ops_state_directory_invalid");
  }
  const normalized = path.normalize(raw);
  if (normalized === path.parse(normalized).root) {
    throw new Error("mentor_profile_ops_state_directory_invalid");
  }
  return normalized;
}

async function enqueueSignal(
  signal: NonNullable<ReturnType<typeof buildMentorProfileHealthSignal>>,
): Promise<void> {
  await enqueueOperationalSignal(requiredStateDirectory(), signal);
}

async function enqueueAuthorityFailure(
  reasonCode:
    | "mentor_profile_database_unavailable"
    | "mentor_profile_health_probe_failed",
  observedAt: string,
): Promise<void> {
  await enqueueSignal(
    buildMentorProfileHealthAuthoritySignal(reasonCode, observedAt),
  );
}

async function loadSnapshot() {
  return withTx((client) =>
    loadMentorProfileHealthSnapshot(client),
  );
}

async function main(): Promise<void> {
  const observedAt = new Date().toISOString();
  let snapshot: Awaited<ReturnType<typeof loadSnapshot>>;

  try {
    snapshot = await loadSnapshot();
  } catch {
    await enqueueAuthorityFailure(
      "mentor_profile_health_probe_failed",
      observedAt,
    );
    console.error(JSON.stringify({
      ok: false,
      status: "authority_unavailable",
      error: "mentor_profile_health_probe_failed",
      durableSignalQueued: true,
    }));
    process.exitCode = 3;
    return;
  }

  if (!snapshot.enabled) {
    await enqueueAuthorityFailure(
      "mentor_profile_database_unavailable",
      observedAt,
    );
    console.error(JSON.stringify({
      ok: false,
      status: "authority_unavailable",
      error: "mentor_profile_database_unavailable",
      durableSignalQueued: true,
    }));
    process.exitCode = 3;
    return;
  }

  const evaluation = evaluateMentorProfileHealth(snapshot.value);
  const evidence = mentorProfileHealthAlertMetadata(
    snapshot.value,
    evaluation,
  );
  const signal = buildMentorProfileHealthSignal(
    snapshot.value,
    evaluation,
    observedAt,
  );
  if (signal) {
    await enqueueSignal(signal);
  }

  console.log(JSON.stringify({
    ok: evaluation.status === "healthy",
    ...evidence,
    durableSignalQueued: signal !== null,
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
  console.error(JSON.stringify({
    ok: false,
    status: "error",
    error: code,
    durableSignalQueued: false,
  }));
  process.exitCode = 3;
});
