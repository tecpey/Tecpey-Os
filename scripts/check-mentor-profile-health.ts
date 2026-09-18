import { withTx } from "../src/lib/db";
import {
  evaluateMentorProfileHealth,
  loadMentorProfileHealthSnapshot,
  mentorProfileHealthAlertMetadata,
} from "../src/lib/mentor-profile-health";

async function main(): Promise<void> {
  const snapshot = await withTx((client) =>
    loadMentorProfileHealthSnapshot(client),
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

  const evaluation = evaluateMentorProfileHealth(snapshot.value);
  const evidence = mentorProfileHealthAlertMetadata(
    snapshot.value,
    evaluation,
  );
  console.log(JSON.stringify({
    ok: evaluation.status === "healthy",
    ...evidence,
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
